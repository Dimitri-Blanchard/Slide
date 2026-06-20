import {
  appendEncryptedLocalPrivateMessage,
  decryptLocalPrivatePayload,
  getLocalPrivateChat,
  getOrCreateLocalPrivateIdentity,
  getStoredPeerPublicKey,
  isLocalPrivateChatAvailable,
  storePeerPublicKey,
  upsertLocalPrivateChat,
} from './localPrivateChatCrypto';
import { scheduleNativeNotification } from './nativeNotifications';

export function normalizeSocketUserId(id) {
  if (id == null) return null;
  const n = parseInt(id, 10);
  return Number.isInteger(n) && n > 0 ? n : id;
}

export function normalizeLocalPrivateSocketPayload(payload = {}) {
  const fromUserId =
    payload.fromUserId ??
    payload.from_user_id ??
    payload.senderId ??
    payload.sender_id ??
    null;
  const toUserId =
    payload.toUserId ??
    payload.to_user_id ??
    payload.targetUserId ??
    payload.target_user_id ??
    payload.recipientId ??
    payload.recipient_id ??
    null;
  const fromUser = payload.fromUser ?? payload.from_user ?? payload.sender ?? null;
  const publicKey = payload.publicKey ?? payload.public_key ?? null;
  return {
    fromUserId,
    toUserId,
    fromUser,
    publicKey,
    encryptedPayload: payload.encryptedPayload ?? payload.encrypted_payload ?? null,
    messageId: payload.messageId ?? payload.message_id ?? null,
    createdAt: payload.createdAt ?? payload.created_at ?? null,
  };
}

export function buildLocalPrivateKeyAnnouncePayload({ toUserId, fromUserId, fromUser, publicJwk }) {
  const targetId = normalizeSocketUserId(toUserId);
  const senderId = normalizeSocketUserId(fromUserId);
  return {
    toUserId: targetId,
    targetUserId: targetId,
    to_user_id: targetId,
    fromUserId: senderId,
    from_user_id: senderId,
    fromUser,
    from_user: fromUser,
    publicKey: publicJwk,
    public_key: publicJwk,
  };
}

export function buildLocalPrivateMessagePayload({
  toUserId,
  fromUserId,
  fromUser,
  messageId,
  createdAt,
  encryptedPayload,
}) {
  const targetId = normalizeSocketUserId(toUserId);
  const senderId = normalizeSocketUserId(fromUserId);
  return {
    toUserId: targetId,
    targetUserId: targetId,
    to_user_id: targetId,
    fromUserId: senderId,
    from_user_id: senderId,
    fromUser,
    from_user: fromUser,
    messageId,
    message_id: messageId,
    createdAt,
    created_at: createdAt,
    encryptedPayload,
    encrypted_payload: encryptedPayload,
  };
}

function isViewingLocalPrivateChat(peerId) {
  if (typeof window === 'undefined' || !peerId) return false;
  return window.location.pathname.includes(`/private-local/${encodeURIComponent(String(peerId))}`);
}

/**
 * Persist an incoming local-private invite (sidebar + stored peer key).
 * @returns {boolean} whether the payload was handled
 */
export function handleIncomingLocalPrivateKeyAnnounce(currentUserId, rawPayload, { notify } = {}) {
  if (!isLocalPrivateChatAvailable() || currentUserId == null) return false;

  const { fromUserId, fromUser, publicKey } = normalizeLocalPrivateSocketPayload(rawPayload);
  if (!fromUserId || String(fromUserId) === String(currentUserId)) return false;

  const peerId = String(fromUserId);
  const existing = getLocalPrivateChat(currentUserId, peerId);
  const hadPeerKey = !!getStoredPeerPublicKey(currentUserId, peerId);
  if (publicKey) storePeerPublicKey(currentUserId, peerId, publicKey);

  const viewing = isViewingLocalPrivateChat(peerId);
  const isPendingInvite = !existing?.accepted;
  const nextUnread = viewing
    ? 0
    : Math.min(99, (existing?.unread_count || 0) + (isPendingInvite ? 1 : 0));

  // Initiator receiving peer's key (e.g. invite sent from phone, accepted on PC) = handshake complete.
  const accepted = existing?.initiated_by_me && publicKey && !hadPeerKey
    ? true
    : (existing?.accepted ?? false);

  upsertLocalPrivateChat(currentUserId, fromUser || { id: fromUserId }, {
    last_message_preview: accepted ? 'Chat privé local accepté' : 'Invitation privée locale',
    last_message_at: new Date().toISOString(),
    accepted,
    initiated_by_me: existing ? (existing.initiated_by_me ?? false) : false,
    unread_count: nextUnread,
  });

  if (!viewing && isPendingInvite) {
    notify?.(fromUser || { id: fromUserId });
  }

  return true;
}

async function handleIncomingLocalPrivateMessage(currentUserId, rawPayload, { notify } = {}) {
  if (!isLocalPrivateChatAvailable() || currentUserId == null) return false;

  const { fromUserId, fromUser, encryptedPayload, messageId, createdAt } = normalizeLocalPrivateSocketPayload(rawPayload);
  if (!fromUserId || !encryptedPayload || String(fromUserId) === String(currentUserId)) return false;

  const peerId = String(fromUserId);
  const existing = getLocalPrivateChat(currentUserId, peerId);
  if (!existing) return false;

  const viewing = isViewingLocalPrivateChat(peerId);
  if (viewing) return false;

  try {
    const publicKey = getStoredPeerPublicKey(currentUserId, peerId);
    if (!publicKey) return false;

    const { privateKey } = await getOrCreateLocalPrivateIdentity(currentUserId);
    const payload = await decryptLocalPrivatePayload(privateKey, publicKey, encryptedPayload);
    const record = {
      id: messageId || payload.id,
      senderId: peerId,
      createdAt: createdAt || payload.createdAt,
      peerPublicKey: publicKey,
      encryptedPayload,
      delivery: 'received',
    };
    appendEncryptedLocalPrivateMessage(currentUserId, peerId, record);

    upsertLocalPrivateChat(currentUserId, fromUser || { id: fromUserId }, {
      last_message_preview: payload.content,
      last_message_at: payload.createdAt,
      accepted: true,
      unread_count: Math.min(99, (existing.unread_count || 0) + 1),
    });

    notify?.(fromUser || { id: fromUserId }, payload.content);
    return true;
  } catch {
    return false;
  }
}

export async function notifyLocalPrivateInvite(fromUser) {
  const name = fromUser?.display_name || fromUser?.username || 'Quelqu\'un';
  const title = 'Chat privé local';
  const body = `${name} t'a invité à un chat privé local`;

  if (window.electron?.showNotification) {
    window.electron.showNotification({ title, body });
    return;
  }

  await scheduleNativeNotification({ title, body });
}

export async function notifyLocalPrivateMessage(fromUser, preview) {
  const name = fromUser?.display_name || fromUser?.username || 'Quelqu\'un';
  const title = 'Chat privé local';
  const body = preview ? `${name}: ${String(preview).slice(0, 120)}` : `${name} t'a envoyé un message`;

  if (window.electron?.showNotification) {
    window.electron.showNotification({ title, body });
    return;
  }

  await scheduleNativeNotification({ title, body });
}

export function bindLocalPrivateChatSocket(socket, currentUserId, options = {}) {
  if (!socket || currentUserId == null) return () => {};

  const onKeyAnnounce = (payload) => {
    handleIncomingLocalPrivateKeyAnnounce(currentUserId, payload, options);
  };

  const onMessage = (payload) => {
    handleIncomingLocalPrivateMessage(currentUserId, payload, options).catch(() => {});
  };

  socket.on('local_private_chat_key_announce', onKeyAnnounce);
  socket.on('local_private_chat_message', onMessage);
  return () => {
    socket.off('local_private_chat_key_announce', onKeyAnnounce);
    socket.off('local_private_chat_message', onMessage);
  };
}
