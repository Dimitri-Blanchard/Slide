import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Clock, Lock, ShieldAlert } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { users as usersApi } from '../api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useNotification } from '../context/NotificationContext';
import Avatar from './Avatar';
import MessageInput from './MessageInput';
import {
  appendEncryptedLocalPrivateMessage,
  decryptLocalPrivatePayload,
  encryptLocalPrivatePayload,
  getEncryptedLocalPrivateMessages,
  getLocalPrivateChat,
  getOrCreateLocalPrivateIdentity,
  getStoredPeerPublicKey,
  isLocalPrivateChatAvailable,
  storePeerPublicKey,
  upsertLocalPrivateChat,
} from '../utils/localPrivateChatCrypto';
import {
  buildLocalPrivateKeyAnnouncePayload,
  buildLocalPrivateMessagePayload,
  normalizeLocalPrivateSocketPayload,
} from '../utils/localPrivateChatSocket';
import './LocalPrivateChat.css';

function normalizeProfile(profile, fallbackId) {
  const user = profile?.user || profile?.profile || profile;
  if (!user) return { id: fallbackId, display_name: `User ${fallbackId}` };
  return {
    id: user.id ?? fallbackId,
    username: user.username,
    display_name: user.display_name || user.username || `User ${fallbackId}`,
    avatar_url: user.avatar_url,
  };
}

function formatLocalTime(value) {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  } catch {
    return '';
  }
}

const LocalPrivateChat = memo(function LocalPrivateChat({ peerUserId, isMobile }) {
  const navigate = useNavigate();
  const location = useLocation();
  const socket = useSocket();
  const { user } = useAuth();
  const { notify } = useNotification();
  const [peer, setPeer] = useState(() => location.state?.user || null);
  const [messages, setMessages] = useState([]);
  const [identity, setIdentity] = useState(null);
  const [peerPublicKey, setPeerPublicKey] = useState(null);
  const [readyError, setReadyError] = useState('');
  const endRef = useRef(null);

  const peerId = String(peerUserId || '');
  const currentUserId = user?.id != null ? String(user.id) : '';
  const isAvailable = isLocalPrivateChatAvailable();
  const canSendEncrypted = !!(identity?.privateKey && peerPublicKey && socket?.connected);
  const isWaitingForPeer = isAvailable && !readyError && socket?.connected && !peerPublicKey;

  const hydrateMessages = useCallback(async (privateKey, publicKey) => {
    if (!currentUserId || !peerId || !privateKey || !publicKey) return;
    const stored = getEncryptedLocalPrivateMessages(currentUserId, peerId);
    const decrypted = [];
    for (const record of stored) {
      try {
        const payload = await decryptLocalPrivatePayload(privateKey, record.peerPublicKey || publicKey, record.encryptedPayload);
        decrypted.push({
          id: record.id,
          sender_id: record.senderId,
          content: payload.content,
          created_at: payload.createdAt,
          delivery: record.delivery || 'local',
        });
      } catch {
        decrypted.push({
          id: record.id,
          sender_id: record.senderId,
          content: '[Encrypted message unavailable]',
          created_at: record.createdAt,
          delivery: 'locked',
        });
      }
    }
    setMessages(decrypted.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)));
  }, [currentUserId, peerId]);

  useEffect(() => {
    if (!isAvailable) return;
    if (!currentUserId) return;
    let cancelled = false;
    getOrCreateLocalPrivateIdentity(currentUserId)
      .then((nextIdentity) => {
        if (cancelled) return;
        setIdentity(nextIdentity);
        const storedPeerKey = getStoredPeerPublicKey(currentUserId, peerId);
        if (storedPeerKey) {
          setPeerPublicKey(storedPeerKey);
          hydrateMessages(nextIdentity.privateKey, storedPeerKey);
        }
      })
      .catch((err) => setReadyError(err.message || 'Private identity unavailable.'));
    return () => { cancelled = true; };
  }, [currentUserId, hydrateMessages, isAvailable, peerId]);

  useEffect(() => {
    if (peer || !peerId) return;
    let cancelled = false;
    usersApi.getProfile(peerId)
      .then((profile) => {
        if (!cancelled) setPeer(normalizeProfile(profile, peerId));
      })
      .catch(() => {
        if (!cancelled) setPeer({ id: peerId, display_name: `User ${peerId}` });
      });
    return () => { cancelled = true; };
  }, [peer, peerId]);

  const announceKey = useCallback(() => {
    if (!socket || !identity?.publicJwk || !peerId || !currentUserId) return;
    socket.emit('local_private_chat_key_announce', buildLocalPrivateKeyAnnouncePayload({
      toUserId: peerId,
      fromUserId: currentUserId,
      fromUser: {
        id: user?.id,
        display_name: user?.display_name,
        username: user?.username,
        avatar_url: user?.avatar_url,
      },
      publicJwk: identity.publicJwk,
    }));
  }, [currentUserId, identity?.publicJwk, peerId, socket, user]);

  useEffect(() => {
    if (!socket || !identity?.publicJwk || !currentUserId || !peerId) return;
    if (!getLocalPrivateChat(currentUserId, peerId)) return;
    announceKey();
    socket.on('connect', announceKey);
    const interval = setInterval(announceKey, 15000);
    return () => {
      socket.off('connect', announceKey);
      clearInterval(interval);
    };
  }, [announceKey, currentUserId, identity?.publicJwk, peerId, socket]);

  useEffect(() => {
    if (!socket || !identity?.privateKey || !currentUserId || !peerId) return;

    const acceptPeerKey = (rawPayload) => {
      const { fromUserId, fromUser, publicKey } = normalizeLocalPrivateSocketPayload(rawPayload);
      if (String(fromUserId) !== peerId || !publicKey) return;
      const existing = getLocalPrivateChat(currentUserId, peerId);
      storePeerPublicKey(currentUserId, peerId, publicKey);
      setPeerPublicKey(publicKey);
      if (fromUser) setPeer((prev) => ({ ...(prev || {}), ...fromUser }));
      upsertLocalPrivateChat(currentUserId, fromUser || { id: peerId }, {
        last_message_preview: 'Chat privé local accepté',
        last_message_at: new Date().toISOString(),
        accepted: true,
        initiated_by_me: existing?.initiated_by_me ?? false,
        unread_count: 0,
      });
      hydrateMessages(identity.privateKey, publicKey);
    };

    const receiveMessage = async (rawPayload) => {
      const { fromUserId, fromUser, encryptedPayload, messageId, createdAt } = normalizeLocalPrivateSocketPayload(rawPayload);
      if (String(fromUserId) !== peerId || !encryptedPayload) return;
      if (!getLocalPrivateChat(currentUserId, peerId)) return;
      try {
        const publicKey = peerPublicKey || getStoredPeerPublicKey(currentUserId, peerId);
        if (!publicKey) {
          announceKey();
          return;
        }
        const payload = await decryptLocalPrivatePayload(identity.privateKey, publicKey, encryptedPayload);
        const record = {
          id: messageId || payload.id,
          senderId: String(fromUserId),
          createdAt: createdAt || payload.createdAt,
          peerPublicKey: publicKey,
          encryptedPayload,
          delivery: 'received',
        };
        appendEncryptedLocalPrivateMessage(currentUserId, peerId, record);
        if (fromUser) setPeer((prev) => ({ ...(prev || {}), ...fromUser }));
        upsertLocalPrivateChat(currentUserId, fromUser || { id: peerId }, {
          last_message_preview: payload.content,
          last_message_at: payload.createdAt,
          accepted: true,
          unread_count: 0,
        });
        setMessages((prev) => {
          if (prev.some((msg) => msg.id === record.id)) return prev;
          return [...prev, {
            id: record.id,
            sender_id: String(fromUserId),
            content: payload.content,
            created_at: payload.createdAt,
            delivery: 'received',
          }];
        });
      } catch (err) {
        notify.error(err.message || 'Unable to decrypt private message.');
      }
    };

    socket.on('local_private_chat_key_announce', acceptPeerKey);
    socket.on('local_private_chat_message', receiveMessage);
    return () => {
      socket.off('local_private_chat_key_announce', acceptPeerKey);
      socket.off('local_private_chat_message', receiveMessage);
    };
  }, [announceKey, currentUserId, hydrateMessages, identity?.privateKey, notify, peerId, peerPublicKey, socket]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  const title = peer?.display_name || peer?.username || `User ${peerId}`;

  const sendMessage = useCallback(async (content) => {
    const text = String(content || '').trim();
    if (!text) return null;
    if (!canSendEncrypted) {
      const message = !socket?.connected
        ? 'Connexion socket indisponible.'
        : `${title} doit accepter le chat privé local avant que tu puisses envoyer un message.`;
      announceKey();
      throw new Error(message);
    }
    const createdAt = new Date().toISOString();
    const id = `local_private_${currentUserId}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const encryptedPayload = await encryptLocalPrivatePayload(identity.privateKey, peerPublicKey, {
      id,
      content: text,
      createdAt,
    });
    const record = {
      id,
      senderId: currentUserId,
      createdAt,
      peerPublicKey,
      encryptedPayload,
      delivery: 'sent',
    };
    appendEncryptedLocalPrivateMessage(currentUserId, peerId, record);
    upsertLocalPrivateChat(currentUserId, peer || { id: peerId, display_name: title }, {
      last_message_preview: text,
      last_message_at: createdAt,
      accepted: true,
      unread_count: 0,
    });
    setMessages((prev) => [...prev, {
      id,
      sender_id: currentUserId,
      content: text,
      created_at: createdAt,
      delivery: 'sent',
    }]);
    socket.emit('local_private_chat_message', buildLocalPrivateMessagePayload({
      toUserId: peerId,
      fromUserId: currentUserId,
      fromUser: {
        id: user?.id,
        display_name: user?.display_name,
        username: user?.username,
        avatar_url: user?.avatar_url,
      },
      messageId: id,
      createdAt,
      encryptedPayload,
    }));
    return { id, content: text };
  }, [announceKey, canSendEncrypted, currentUserId, identity?.privateKey, notify, peer, peerId, peerPublicKey, socket, title, user]);

  const statusText = useMemo(() => {
    if (!isAvailable) return 'Disponible dans l’app Slide (mobile ou desktop).';
    if (readyError) return readyError;
    if (!socket?.connected) return 'Connexion au relais en cours...';
    if (!peerPublicKey) return `Invitation envoyée, en attente de l’acceptation de ${title}`;
    return 'Chat local chiffré de bout en bout';
  }, [isAvailable, peerPublicKey, readyError, socket?.connected, title]);

  if (!isAvailable) {
    return (
      <div className="local-private-chat local-private-blocked">
        <ShieldAlert size={28} />
        <h2>Chat privé local indisponible</h2>
        <p>Cette fonctionnalité n’est pas disponible dans le navigateur web. Utilise l’app Slide sur mobile ou desktop.</p>
      </div>
    );
  }

  return (
    <div className="local-private-chat chat-container">
      <header className="local-private-header chat-header">
        {isMobile && (
          <button className="dc-mobile-back" onClick={() => navigate('/channels/@me')} aria-label="Retour">
            <ChevronLeft size={22} strokeWidth={2} />
          </button>
        )}
        <Avatar user={peer} size="medium" showPresence />
        <div className="local-private-title">
          <h1>{title}</h1>
          <span className={canSendEncrypted ? 'ready' : ''}>
            <Lock size={13} />
            {statusText}
          </span>
        </div>
      </header>

      <div className="local-private-notice">
        {canSendEncrypted
          ? 'Messages chiffrés et stockés uniquement sur cet appareil. Le serveur ne voit jamais le contenu.'
          : `${title} peut accepter sur n’importe quel appareil (téléphone ou PC). L’historique reste local à chaque appareil.`}
      </div>

      <div className="local-private-messages">
        {messages.length === 0 ? (
          <div className="local-private-empty">
            {isWaitingForPeer ? <Clock size={32} /> : <Lock size={32} />}
            <h2>{isWaitingForPeer ? 'Invitation en attente' : 'Chat privé local'}</h2>
            <p>
              {isWaitingForPeer
                ? `${title} doit accepter de créer ce chat privé local avant que les messages puissent être envoyés.`
                : 'Les messages sont gardés localement sous forme chiffrée et le serveur ne reçoit jamais le contenu lisible.'}
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isOwn = String(msg.sender_id) === currentUserId;
            return (
              <div key={msg.id} className={`local-private-message ${isOwn ? 'own' : ''}`}>
                <div className="local-private-bubble">
                  <p>{msg.content}</p>
                  <span>{formatLocalTime(msg.created_at)}</span>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      <div className="local-private-input">
        <MessageInput
          onSend={sendMessage}
          placeholder={canSendEncrypted ? `Message privé local à ${title}` : `En attente que ${title} accepte...`}
          draftKey={`local_private_${currentUserId}_${peerId}`}
          maxFileSize={0}
        />
      </div>
    </div>
  );
});

export default LocalPrivateChat;
