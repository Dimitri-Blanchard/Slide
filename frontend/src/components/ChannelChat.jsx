import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { Lock } from 'lucide-react';
import { messages as messagesApi, channels as channelsApi, reactions as reactionsApi, teams as teamsApi } from '../api';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { useSettings } from '../context/SettingsContext';
import { useLanguage } from '../context/LanguageContext';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import StickerPicker from './StickerPicker';
import './Chat.css';

const ChannelChat = memo(function ChannelChat({ teamId, channelId, currentTeam, onChannelsChange }) {
  const [channel, setChannel] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typingUsers, setTypingUsers] = useState([]);
  const [replyTo, setReplyTo] = useState(null);
  const [messageReactions, setMessageReactions] = useState({});
  const [showStickerPanel, setShowStickerPanel] = useState(false);
  const [members, setMembers] = useState([]);
  const socket = useSocket();
  const { user } = useAuth();
  const { notify } = useNotification();
  const { sendNotification, shouldNotify } = useSettings();
  const { t } = useLanguage();
  const typingTimeoutRef = useRef(null);
  const messageListRef = useRef(null);
  const messageInputRef = useRef(null);

  useEffect(() => {
    if (!channelId) return;
    let cancelled = false;
    setLoading(true);
    setMessageReactions({});
    Promise.all([channelsApi.get(channelId), messagesApi.channel(channelId)])
      .then(([ch, msgs]) => {
        if (cancelled) return;
        setChannel(ch);
        setMessages(msgs);
        const rxMap = {};
        for (const m of msgs) {
          if (m.reactions && m.reactions.length > 0) {
            rxMap[m.id] = m.reactions;
          }
        }
        setMessageReactions(rxMap);
      })
      .catch((err) => { if (!cancelled) console.error(err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [channelId]);

  // Load team members for mentions
  useEffect(() => {
    if (!teamId) return;
    teamsApi.members(teamId)
      .then((membersList) => setMembers(membersList || []))
      .catch(console.error);
  }, [teamId]);

  useEffect(() => {
    if (!socket || !channelId) return;
    const chId = parseInt(channelId, 10);
    const rejoin = () => socket.emit('join_channel', chId);
    rejoin();
    socket.on('connect', rejoin);
    return () => {
      socket.off('connect', rejoin);
      socket.emit('leave_channel', chId);
    };
  }, [socket, channelId]);

  useEffect(() => {
    if (!socket) return;
    const onMessage = (payload) => {
      if (payload.channelId === parseInt(channelId, 10)) {
        const senderId = payload.message?.sender_id || payload.message?.sender?.id;
        if (senderId && senderId !== user?.id) {
          setTypingUsers(prev => prev.filter(u => u.userId !== senderId));
        }
        // Ignore messages from current user - they're already added via API response
        // Webhooks are never "own" - always show them
        const isOwnUser = payload.message?.sender_id === user?.id || payload.message?.sender?.id === user?.id;
        const sameSocket = payload.sourceSocketId && socket?.id && payload.sourceSocketId === socket.id;
        if (!payload.message?.is_webhook && isOwnUser && sameSocket) {
          return;
        }
        setMessages((prev) => {
          if (prev.some((m) => m.id === payload.message?.id)) return prev;
          return [...prev, payload.message];
        });
        
        // Send desktop notification for mentions
        const msg = payload.message;
        if (msg && msg.sender_id !== user?.id) {
          // Check if user is mentioned (@display_name, @username, @everyone, @channel)
          const content = msg.content || '';
          const byDisplayName = user?.display_name && content.includes(`@${user.display_name}`);
          const byUsername = user?.username && content.includes(`@${user.username}`);
          const isMentioned = byDisplayName || byUsername || content.includes('@everyone') || content.includes('@channel');
          
          if (isMentioned && shouldNotify('channel', true)) {
            // Only notify if window is not focused
            if (!document.hasFocus()) {
              const senderName = msg.sender?.display_name || t('chat.someone');
              const channelName = channel?.name || t('chat.channel');
              
              sendNotification(t('notifications.mentioned', { name: senderName }), {
                body: `#${channelName}: ${content.substring(0, 100)}`,
                tag: `channel-mention-${channelId}`,
                onClick: () => {
                  window.focus();
                }
              });
            }
          }
        }
      }
    };
    
    // Message edited
    const onMessageEdited = ({ channelId: chId, message }) => {
      if (chId === parseInt(channelId, 10)) {
        setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, ...message } : m)));
      }
    };
    
    // Message deleted
    const onMessageDeleted = ({ channelId: chId, messageId }) => {
      if (chId === parseInt(channelId, 10)) {
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
      }
    };
    
    const onReactionAdded = ({ channelId: chId, messageId, emoji, userId, displayName }) => {
      if (chId === parseInt(channelId, 10)) {
        setMessageReactions(prev => {
          const msgReactions = prev[messageId] || [];
          const existing = msgReactions.find(r => r.emoji === emoji);
          if (existing) {
            if (!existing.userIds.some(id => String(id) === String(userId))) {
              return { ...prev, [messageId]: msgReactions.map(r => r.emoji === emoji ? { ...r, count: r.count + 1, userIds: [...r.userIds, userId], users: [...r.users, displayName] } : r) };
            }
            return prev;
          }
          return { ...prev, [messageId]: [...msgReactions, { emoji, count: 1, userIds: [userId], users: [displayName] }] };
        });
      }
    };

    const onReactionRemoved = ({ channelId: chId, messageId, emoji, userId }) => {
      if (chId === parseInt(channelId, 10)) {
        setMessageReactions(prev => {
          const msgReactions = prev[messageId] || [];
          return {
            ...prev,
            [messageId]: msgReactions
              .map(r => {
                if (r.emoji !== emoji) return r;
                const removeIdx = r.userIds.findIndex(id => String(id) === String(userId));
                if (removeIdx === -1) return r; // already removed locally; avoid double decrement
                const nextUserIds = r.userIds.filter((_, i) => i !== removeIdx);
                const nextUsers = r.users.filter((_, i) => i !== removeIdx);
                return { ...r, count: Math.max(0, r.count - 1), userIds: nextUserIds, users: nextUsers };
              })
              .filter(r => r.count > 0)
          };
        });
      }
    };

    socket.on('channel_message', onMessage);
    socket.on('message_edited', onMessageEdited);
    socket.on('message_deleted', onMessageDeleted);
    socket.on('reaction_added', onReactionAdded);
    socket.on('reaction_removed', onReactionRemoved);
    
    return () => {
      socket.off('channel_message', onMessage);
      socket.off('message_edited', onMessageEdited);
      socket.off('message_deleted', onMessageDeleted);
      socket.off('reaction_added', onReactionAdded);
      socket.off('reaction_removed', onReactionRemoved);
    };
  }, [socket, channelId, user?.id]);

  useEffect(() => {
    if (!socket) return;
    const onTyping = ({ channelId: chId, userId: uid, displayName }) => {
      if (chId !== parseInt(channelId, 10) || uid === user?.id) return;
      setTypingUsers((prev) => {
        const next = prev.filter((u) => u.userId !== uid);
        next.push({ userId: uid, displayName });
        return next;
      });
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        setTypingUsers((prev) => prev.filter((u) => u.userId !== uid));
      }, 3000);
    };
    const onStopTyping = ({ channelId: chId, userId: uid }) => {
      if (chId !== parseInt(channelId, 10)) return;
      setTypingUsers(prev => prev.filter(u => u.userId !== uid));
    };
    socket.on('user_typing', onTyping);
    socket.on('user_stop_typing', onStopTyping);
    return () => {
      socket.off('user_typing', onTyping);
      socket.off('user_stop_typing', onStopTyping);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [socket, channelId, user?.id]);

  const sendMessage = useCallback((content, type, replyToId) => {
    if (socket) socket.emit('stop_typing_channel', { channelId: parseInt(channelId, 10) });
    const tempId = `temp_${Date.now()}`;
    const optimisticMsg = {
      id: tempId,
      _clientKey: tempId,
      channel_id: parseInt(channelId, 10),
      sender_id: user?.id,
      content,
      type: type || 'text',
      reply_to_id: replyToId,
      created_at: new Date().toISOString(),
      sender: { id: user?.id, display_name: user?.display_name, avatar_url: user?.avatar_url },
      _pending: true,
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    return messagesApi.sendChannel(channelId, content, type, replyToId)
      .then((msg) => {
        if (msg?.isCommand) {
          const commandMsg = {
            id: tempId,
            channel_id: parseInt(channelId, 10),
            sender_id: user?.id,
            content: msg.message,
            type: 'system',
            subtype: 'command_result',
            created_at: new Date().toISOString(),
            sender: { id: user?.id, display_name: user?.display_name, avatar_url: user?.avatar_url },
            isCommand: true,
            commandSuccess: msg.success,
            commandType: msg.type,
            commandInput: content.trim(),
          };
          setMessages((prev) => prev.map((m) => (
            m.id === tempId
              ? { ...commandMsg, _clientKey: m._clientKey || m.id }
              : m
          )));
          return commandMsg;
        }
        setMessages((prev) => prev.map((m) => (
          m.id === tempId
            ? { ...msg, _clientKey: m._clientKey || m.id }
            : m
        )));
        return msg;
      })
      .catch((err) => {
        setMessages((prev) => prev.map((m) =>
          m.id === tempId ? { ...m, _pending: false, _failed: true, _retryPayload: { content, type, replyToId } } : m
        ));
        throw err;
      });
  }, [channelId, socket, user]);

  const retryFailedMessage = useCallback((msg) => {
    const payload = msg._retryPayload;
    if (!payload) return;
    setMessages((prev) => prev.filter((m) => m.id !== msg.id));
    sendMessage(payload.content, payload.type, payload.replyToId);
  }, [sendMessage]);
  
  // Send sticker/gif/emoji as a message
  const sendMedia = useCallback((item, type = 'sticker') => {
    const messageType = type === 'gif' ? 'gif' : type === 'emoji' ? 'emoji' : 'sticker';
    const content = item.image_url || item.url;
    
    return messagesApi.sendChannel(channelId, content, messageType, null).then((msg) => {
      // Message is broadcast by backend via Socket.io
      setMessages((prev) => [...prev, msg]);
      return msg;
    }).catch((err) => {
      console.error(`Erreur envoi ${messageType}:`, err);
      throw err;
    });
  }, [channelId]);
  
  // Toggle sticker panel
  const handleToggleStickerPanel = useCallback(() => {
    setShowStickerPanel(prev => !prev);
  }, []);
  
  // Handle sticker/gif/emoji selection from panel
  const handleStickerSelect = useCallback((item) => {
    sendMedia(item, item.type || 'sticker');
  }, [sendMedia]);

  // Handle emoji selection from panel
  const handleEmojiSelect = useCallback((emoji) => {
    messageInputRef.current?.insertText(emoji);
  }, []);

  // Upload file to channel
  const uploadFile = useCallback((file, voiceDuration = null) => {
    const isVoice = file.type.startsWith('audio/');
    const isImage = file.type.startsWith('image/');
    
    // Create optimistic message
    const tempId = `temp_${Date.now()}`;
    const optimisticMessage = {
      id: tempId,
      _clientKey: tempId,
      channel_id: parseInt(channelId, 10),
      sender_id: user?.id,
      content: URL.createObjectURL(file),
      type: isImage ? 'image' : 'file',
      created_at: new Date().toISOString(),
      sender: {
        id: user?.id,
        display_name: user?.display_name,
        avatar_url: user?.avatar_url,
      },
      attachment: {
        file_name: file.name,
        file_url: URL.createObjectURL(file),
        file_size: file.size,
        mime_type: file.type,
      },
      _pending: true,
      _voiceDuration: voiceDuration,
    };
    
    // Add optimistic message immediately
    setMessages((prev) => [...prev, optimisticMessage]);
    
    // Upload in background
    return messagesApi.uploadChannel(channelId, file).then((msg) => {
      // Replace optimistic message with real one
      // Backend broadcasts via Socket.io, so other users will receive the message
      setMessages((prev) => prev.map((m) => 
        m.id === tempId
          ? { ...msg, _pending: false, _clientKey: m._clientKey || m.id }
          : m
      ));
      return msg;
    }).catch((err) => {
      console.error('Erreur upload channel:', err);
      // Mark as failed
      setMessages((prev) => prev.map((m) => 
        m.id === tempId ? { ...m, _pending: false, _failed: true } : m
      ));
      throw err;
    });
  }, [channelId, user]);

  const onTyping = useCallback(() => {
    if (socket && channelId) socket.emit('typing_channel', { channelId: parseInt(channelId, 10) });
  }, [socket, channelId]);

  // Reply handler
  const handleReply = useCallback((msg) => {
    setReplyTo(msg);
  }, []);

  const handleCancelReply = useCallback(() => {
    setReplyTo(null);
  }, []);

  // Reaction handlers
  const handleAddReaction = useCallback(async (messageId, emoji) => {
    try {
      await reactionsApi.addChannel(channelId, messageId, emoji);
      // Optimistic update
      setMessageReactions(prev => {
        const msgReactions = prev[messageId] || [];
        const existing = msgReactions.find(r => r.emoji === emoji);
        if (existing) {
          if (!existing.userIds.some(id => String(id) === String(user?.id))) {
            return {
              ...prev,
              [messageId]: msgReactions.map(r => 
                r.emoji === emoji 
                  ? { ...r, count: r.count + 1, userIds: [...r.userIds, user?.id], users: [...r.users, user?.display_name] }
                  : r
              )
            };
          }
          return prev;
        }
        return {
          ...prev,
          [messageId]: [...msgReactions, { emoji, count: 1, userIds: [user?.id], users: [user?.display_name] }]
        };
      });
    } catch (err) {
      notify.error(err.message || t('errors.addReaction'));
    }
  }, [channelId, user, notify, t]);

  const handleRemoveReaction = useCallback(async (messageId, emoji, targetUserId = user?.id) => {
    try {
      await reactionsApi.removeChannel(channelId, messageId, emoji, targetUserId);
      // Optimistic update
      setMessageReactions(prev => {
        const msgReactions = prev[messageId] || [];
        return {
          ...prev,
          [messageId]: msgReactions
            .map(r => {
              if (r.emoji !== emoji) return r;
              const removeIdx = r.userIds.findIndex(id => String(id) === String(targetUserId));
              if (removeIdx === -1) return r; // already removed locally; avoid double decrement
              const nextUserIds = r.userIds.filter((_, i) => i !== removeIdx);
              const nextUsers = r.users.filter((_, i) => i !== removeIdx);
              return { ...r, count: Math.max(0, r.count - 1), userIds: nextUserIds, users: nextUsers };
            })
            .filter(r => r.count > 0)
        };
      });
    } catch (err) {
      notify.error(err.message || t('errors.removeReaction'));
    }
  }, [channelId, user, notify, t]);

  if (loading || !channel) {
    return (
      <div className="chat-container">
        <header className="chat-header">
          <span className="chat-header-skeleton-icon" />
          <div className="chat-header-info">
            <div className="chat-header-skeleton-title" />
            <div className="chat-header-skeleton-desc" />
          </div>
        </header>
        <div className="chat-main">
          <div className="chat-main-content">
            <MessageList loading={true} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`chat-container ${showStickerPanel ? 'sticker-panel-open' : ''}`}>
      <header className="chat-header">
        <span className="chat-header-icon">#</span>
        <div className="chat-header-info">
          <h1 className="chat-header-title">{channel.name}</h1>
          {channel.description && (
            <p className="chat-header-desc">{channel.description}</p>
          )}
        </div>
        <span className="chat-header-e2ee" title={t('securityDashboard.e2eeTooltip')} aria-label={t('securityDashboard.e2eeTooltip')}>
          <Lock size={12} strokeWidth={2.5} />
          <span>E2EE</span>
        </span>
      </header>
      <div className="chat-main">
        <div className="chat-main-content">
          <MessageList 
            ref={messageListRef}
            messages={messages} 
            currentUserId={user?.id}
            currentUserName={user?.display_name}
            otherUsers={members}
            onReply={handleReply}
            onAddReaction={handleAddReaction}
            onRemoveReaction={handleRemoveReaction}
              canModerateReactions={currentTeam?.role === 'owner' || currentTeam?.role === 'admin' || user?.role === 'admin'}
            messageReactions={messageReactions}
            onRetryFailedMessage={retryFailedMessage}
          />
          {typingUsers.length > 0 && (
            <div className="chat-typing">
              <div className="chat-typing-dots">
                <span></span><span></span><span></span>
              </div>
              {typingUsers.map((u) => u.displayName).join(', ')} {typingUsers.length > 1 ? t('chat.typingPlural') : t('chat.typing')}...
            </div>
          )}
          <MessageInput 
            ref={messageInputRef}
            onSend={sendMessage} 
            onUpload={uploadFile} 
            onTyping={onTyping} 
            placeholder={`Message #${channel.name}`}
            draftKey={`channel_${channelId}`}
            replyTo={replyTo}
            onCancelReply={handleCancelReply}
            mentionUsers={members}
            onToggleStickerPanel={handleToggleStickerPanel}
            stickerPanelOpen={showStickerPanel}
            isAdmin={user?.role === 'admin'}
            onInputFocus={() => messageListRef.current?.scrollToBottom?.()}
          />
        </div>
        
        <StickerPicker
          isOpen={showStickerPanel}
          onClose={() => setShowStickerPanel(false)}
          onSelect={handleStickerSelect}
          onEmojiSelect={handleEmojiSelect}
        />
      </div>
    </div>
  );
});

export default ChannelChat;
