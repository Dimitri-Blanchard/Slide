import React, { useState, useEffect, useRef, useCallback, memo, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { messages as messagesApi, channels as channelsApi, teams as teamsApi, reactions as reactionsApi, servers, invalidateCache } from '../api';
import { useSocket } from '../context/SocketContext';
import { useOffline, OFFLINE_SENT_EVENT } from '../context/OfflineContext';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { useSounds } from '../context/SoundContext';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import ConfirmModal from './ConfirmModal';
import StickerPicker from './StickerPicker';
import { undoToast } from './UndoToast';
import { useLanguage } from '../context/LanguageContext';
import { useVoice } from '../context/VoiceContext';
import ChannelList from './ChannelList';
import MembersPanel from './MembersPanel';
import ServerSettings from './ServerSettings';
import { ShareInviteModal } from './InviteModal';
import MemberRolesModal from './MemberRolesModal';
import VoiceUserProfileBar from './VoiceUserProfileBar';
import ChannelHeader from './ChannelHeader';
import TopicModal from './TopicModal';
import InboxPanel from './InboxPanel';
import { useSwipeBack } from '../hooks/useSwipeBack';
import FileDropOverlay from './FileDropOverlay';
import './Chat.css';
import './TeamChat.css';

// Persisted cache survives TeamChat remounts so revisiting a channel shows messages instantly
const channelMessagesCache = new Map();

const LiveStreamFullscreenVideo = memo(function LiveStreamFullscreenVideo({ stream, displayName, onClose }) {
  const videoRef = React.useRef(null);
  React.useEffect(() => {
    if (videoRef.current && stream) {
      try {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      } catch (e) {
        console.warn('LiveStreamFullscreenVideo: failed to set srcObject', e);
      }
    }
  }, [stream]);
  React.useEffect(() => {
    if (!stream) onClose();
  }, [stream, onClose]);
  return (
    <div className="live-stream-fullscreen-inner">
      <button className="live-stream-fullscreen-close" onClick={onClose} aria-label="Fermer">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.4 4L12 10.4L5.6 4L4 5.6L10.4 12L4 18.4L5.6 20L12 13.6L18.4 20L20 18.4L13.6 12L20 5.6L18.4 4Z"/>
        </svg>
      </button>
      <video ref={videoRef} autoPlay playsInline muted className="live-stream-fullscreen-video" />
      <span className="live-stream-fullscreen-name">{displayName}</span>
    </div>
  );
});

const TeamChat = memo(function TeamChat({ teamId, initialChannelId, isMobile, onLeaveServer, onOpenSearch }) {
  const DELETE_FUME_MS = 760;
  const [team, setTeam] = useState(null);
  const [channelId, setChannelId] = useState(initialChannelId || null);
  const [channels, setChannels] = useState([]);
  const [categories, setCategories] = useState([]);
  const [messages, setMessages] = useState([]);
  const [members, setMembers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [memberRolesMap, setMemberRolesMap] = useState({});
  const [teamLoading, setTeamLoading] = useState(true);
  const [typingUsers, setTypingUsers] = useState([]);
  const [showMembers, setShowMembers] = useState(true);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, userId: null, displayName: '' });
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteCaptionConfirm, setDeleteCaptionConfirm] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [messageReactions, setMessageReactions] = useState({});
  const [showStickerPanel, setShowStickerPanel] = useState(false);
  const [showServerSettings, setShowServerSettings] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showRolesModal, setShowRolesModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [unreadChannels, setUnreadChannels] = useState(new Set());
  const [mobileChannelListOpen, setMobileChannelListOpen] = useState(!initialChannelId);
  const [editingTopic, setEditingTopic] = useState(false);
  const [topicDraft, setTopicDraft] = useState('');
  const [showTopicModal, setShowTopicModal] = useState(false);
  const [showInbox, setShowInbox] = useState(false);

  const socket = useSocket();
  const { user } = useAuth();
  const { isOnline, addToQueue: addToOfflineQueue } = useOffline();
  const { expandedLiveView, setExpandedLiveView, remoteVideoStreams, ownScreenStream, voiceChannelId, voiceConversationId } = useVoice();
  const { notify, addInboxItem } = useNotification();
  const { playPing } = useSounds();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const typingTimeoutRef = useRef(null);
  const messageListRef = useRef(null);
  const messageInputRef = useRef(null);
  const prevTeamIdRef = useRef(null);
  const skipMessagesEffectRef = useRef(false);
  const lastChannelIdRef = useRef(null);

  const currentChannel = useMemo(() =>
    channels.find(c => c.id === parseInt(channelId, 10)),
    [channels, channelId]
  );

  // ═══════════════════════════════════════════════════════════
  // LOAD TEAM DATA - only when teamId changes
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    if (!teamId) return;
    const isNewTeam = prevTeamIdRef.current !== teamId;
    prevTeamIdRef.current = teamId;

    if (isNewTeam) {
      setTeamLoading(true);
      setMessages([]);
      setChannels([]);
      setCategories([]);
    }

    let cancelled = false;

    Promise.all([
      teamsApi.get(teamId),
      channelsApi.list(teamId),
      teamsApi.members(teamId),
      servers.getCategories(teamId).catch(() => []),
      servers.getRoles(teamId).catch(() => []),
      teamsApi.getUnread(teamId).catch(() => null)
    ])
      .then(([teamData, channelsList, membersList, categoriesList, rolesList, unreadData]) => {
        if (cancelled) return;
        const safeChannels = (Array.isArray(channelsList) ? channelsList : []).filter(c => c && c.id != null);
        const safeCategories = Array.isArray(categoriesList) ? categoriesList : [];
        const firstText = safeChannels.find(c => c?.channel_type === 'text') || safeChannels[0];
        let targetId = initialChannelId && safeChannels.some(c => c && String(c.id) === String(initialChannelId))
          ? initialChannelId
          : firstText?.id;
        const targetCh = safeChannels.find(c => c && String(c.id) === String(targetId));
        const isVoiceRedirect = targetCh?.channel_type === 'voice';
        if (isVoiceRedirect) targetId = firstText?.id;
        const toUse = targetId ? String(targetId) : null;

        setTeam(teamData);
        setMembers(membersList || []);
        setChannels(safeChannels);
        setCategories(safeCategories);
        setRoles(rolesList || []);

        if (unreadData?.channels) {
          const unread = new Set();
          for (const ch of unreadData.channels) {
            if (ch && ch.has_unread && ch.channel_id != null) unread.add(ch.channel_id);
          }
          setUnreadChannels(unread);
        }

        if (toUse) {
          // On mobile with no channel in URL: show channel list only, don't auto-redirect (server bar stays visible)
          if (isMobile && !initialChannelId) {
            setChannelId(null);
          } else {
            const cacheKey = `${teamId}-${toUse}`;
            const cached = channelMessagesCache.get(cacheKey);
            if (cached) {
              setMessages(cached.messages);
              setMessageReactions(cached.reactions || {});
              skipMessagesEffectRef.current = true;
            }
            setChannelId(toUse);
            if (isVoiceRedirect || !initialChannelId || !safeChannels.some(c => String(c.id) === String(initialChannelId))) {
              navigate(`/team/${teamId}/channel/${toUse}`, { replace: true });
            }
            if (!cached) {
              messagesApi.channel(toUse).then((msgs) => {
                if (cancelled) return;
                const safeMsgs = Array.isArray(msgs) ? msgs : [];
                const rxMap = {};
                for (const m of safeMsgs) {
                  if (m.reactions?.length) rxMap[m.id] = m.reactions;
                }
                setMessages(safeMsgs);
                setMessageReactions(rxMap);
                channelMessagesCache.set(cacheKey, { messages: safeMsgs, reactions: rxMap });
              }).catch(() => {});
            }
          }
        } else {
          setChannelId(null);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        const status = err?.response?.status ?? err?.status;
        if (status === 403 || status === 404) {
          onLeaveServer?.(teamId);
        } else {
          console.error(err);
        }
      })
      .finally(() => { if (!cancelled) setTeamLoading(false); });
    return () => { cancelled = true; };
  }, [teamId, onLeaveServer, navigate, isMobile, initialChannelId]);

  // ═══════════════════════════════════════════════════════════
  // SYNC channelId from URL when initialChannelId changes
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    if (initialChannelId && initialChannelId !== channelId) {
      setChannelId(initialChannelId);
    } else if (!initialChannelId && channelId && isMobile) {
      // Navigated to /team/:id (no channel) — show channel list
      setChannelId(null);
      setMobileChannelListOpen(true);
    }
  }, [initialChannelId, channelId, isMobile]);

  // ═══════════════════════════════════════════════════════════
  // REDIRECT: Voice channels are join-only, never shown as main view
  // If URL points to a voice channel, redirect to first text channel
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    if (!channels.length || !channelId) return;
    const ch = channels.find(c => c && c.id === parseInt(channelId, 10));
    if (ch?.channel_type === 'voice') {
      const firstText = channels.find(c => c && c.channel_type === 'text') || channels[0];
      if (firstText && String(firstText.id) !== channelId) {
        setChannelId(firstText.id);
        navigate(`/team/${teamId}/channel/${firstText.id}`, { replace: true });
      }
    }
  }, [channels, channelId, teamId, navigate]);

  // Old servers: if channelId points to deleted/missing channel, redirect to first available
  useEffect(() => {
    if (!teamLoading && team && channels.length > 0 && channelId) {
      const exists = channels.some(c => c && String(c.id) === String(channelId));
      if (!exists) {
        const first = channels[0];
        setChannelId(first?.id);
        navigate(`/team/${teamId}/channel/${first?.id}`, { replace: true });
      }
    }
  }, [teamLoading, team, channels, channelId, teamId, navigate]);

  useEffect(() => {
    if (channelId && isMobile) setMobileChannelListOpen(false);
  }, [channelId, isMobile]);

  // Ensure current user's role IDs are loaded (needed for permission-gated UI actions).
  useEffect(() => {
    if (!teamId || !user?.id) return;
    let cancelled = false;
    servers.getMemberRoles(teamId, user.id)
      .then((memberRoles) => {
        if (cancelled) return;
        const roleIds = (Array.isArray(memberRoles) ? memberRoles : [])
          .map(r => r?.role_id ?? r?.id)
          .filter(v => v != null);
        setMemberRolesMap(prev => ({ ...prev, [user.id]: roleIds }));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [teamId, user?.id]);

  // ═══════════════════════════════════════════════════════════
  // LOAD MESSAGES - only when channelId changes (fast switching!)
  // Use cache for instant display; no loading skeleton for empty/background fetch.
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    if (!channelId || teamLoading) return;
    if (skipMessagesEffectRef.current) {
      skipMessagesEffectRef.current = false;
      return;
    }

    const cacheKey = `${teamId}-${channelId}`;
    const cached = channelMessagesCache.get(cacheKey);
    if (cached) {
      setMessages(cached.messages);
      setMessageReactions(cached.reactions || {});
      setTypingUsers([]);
      setReplyTo(null);
      // Still fetch in background to refresh (cache may be stale if channel got new messages)
    } else {
      setMessages([]);
      setTypingUsers([]);
      setReplyTo(null);
      setMessageReactions({});
    }

    let cancelled = false;
    messagesApi.channel(channelId)
      .then((msgs) => {
        const safeMsgs = Array.isArray(msgs) ? msgs : [];
        const rxMap = {};
        for (const m of safeMsgs) {
          if (m.reactions?.length) rxMap[m.id] = m.reactions;
        }
        // Always cache for when user switches back to this channel
        channelMessagesCache.set(cacheKey, { messages: safeMsgs, reactions: rxMap });
        if (cancelled) return;
        setMessages(safeMsgs);
        setMessageReactions(rxMap);
      })
      .catch((err) => { if (!cancelled) console.error(err); });

    return () => { cancelled = true; };
  }, [channelId, teamLoading, teamId]);

  // Keep cache in sync when messages/reactions change (socket, send, etc.)
  // Only cache when messages actually belong to the current channel - otherwise we'd write
  // the previous channel's messages into the new channel's cache when switching.
  useEffect(() => {
    if (!teamId || !channelId) return;
    const chIdNum = parseInt(channelId, 10);
    const messagesBelongToChannel =
      messages.length === 0
        ? false
        : messages.every((m) => (m.channel_id ?? m.channelId) === chIdNum);
    if (messagesBelongToChannel) {
      channelMessagesCache.set(`${teamId}-${channelId}`, { messages, reactions: messageReactions });
    }
  }, [teamId, channelId, messages, messageReactions]);

  // ═══════════════════════════════════════════════════════════
  // SOCKET: Join/leave channel room
  // ═══════════════════════════════════════════════════════════
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

  // Mark channel as read when viewing
  useEffect(() => {
    if (!teamId || !channelId) return;
    setUnreadChannels(prev => {
      if (!prev.has(parseInt(channelId, 10))) return prev;
      const next = new Set(prev);
      next.delete(parseInt(channelId, 10));
      return next;
    });
    const timeout = setTimeout(() => {
      teamsApi.markChannelRead(teamId, channelId).catch(() => {});
    }, 500);
    return () => clearTimeout(timeout);
  }, [teamId, channelId]);

  // Join team room
  useEffect(() => {
    if (!socket || !teamId) return;
    const tId = parseInt(teamId, 10);
    const rejoin = () => socket.emit('join_team', tId);
    rejoin();
    socket.on('connect', rejoin);
    return () => {
      socket.off('connect', rejoin);
      socket.emit('leave_team', tId);
    };
  }, [socket, teamId]);

  // ═══════════════════════════════════════════════════════════
  // SOCKET: Team structural events (channels, categories, roles, members)
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    if (!socket || !teamId) return;

    const onMemberAdded = ({ teamId: tId, member }) => {
      if (tId === parseInt(teamId, 10)) {
        setMembers(prev => prev.some(m => m.id === member.id) ? prev : [...prev, member]);
      }
    };
    const onMemberRemoved = ({ teamId: tId, userId }) => {
      if (tId === parseInt(teamId, 10)) setMembers(prev => prev.filter(m => m.id !== userId));
    };
    const onTeamUpdated = ({ team: t }) => {
      if (t.id === parseInt(teamId, 10)) setTeam(prev => ({ ...prev, ...t }));
    };
    const onChannelCreated = ({ channel }) => {
      if (channel.team_id === parseInt(teamId, 10)) {
        setChannels(prev => prev.some(c => c.id === channel.id) ? prev : [...prev, channel]);
        if (!channelId) {
          setChannelId(channel.id);
          navigate(`/team/${teamId}/channel/${channel.id}`, { replace: true });
        }
      }
    };
    const onChannelUpdated = ({ channel }) => {
      setChannels(prev => prev.map(c => c.id === channel.id ? { ...c, ...channel } : c));
    };
    const onChannelDeleted = ({ channelId: deletedId }) => {
      setChannels(prev => {
        const remaining = prev.filter(c => c.id !== deletedId);
        if (parseInt(channelId, 10) === deletedId && remaining.length > 0) {
          const first = remaining[0];
          setChannelId(first.id);
          navigate(`/team/${teamId}/channel/${first.id}`, { replace: true });
        }
        return remaining;
      });
    };
    const onCategoryCreated = ({ category }) => {
      if (category.team_id === parseInt(teamId, 10))
        setCategories(prev => prev.some(c => c.id === category.id) ? prev : [...prev, category]);
    };
    const onCategoryUpdated = ({ category }) => {
      setCategories(prev => prev.map(c => c.id === category.id ? { ...c, ...category } : c));
    };
    const onCategoryDeleted = ({ categoryId: id }) => {
      setCategories(prev => prev.filter(c => c.id !== id));
    };
    const onRoleCreated = ({ role }) => setRoles(prev => [...prev, role]);
    const onRoleUpdated = ({ role }) => setRoles(prev => prev.map(r => r.id === role.id ? { ...r, ...role } : r));
    const onRoleDeleted = ({ roleId }) => setRoles(prev => prev.filter(r => r.id !== roleId));
    const onMemberRoleAdded = ({ userId, roleId }) => {
      setMemberRolesMap(prev => ({ ...prev, [userId]: [...(prev[userId] || []), roleId] }));
    };
    const onMemberRoleRemoved = ({ userId, roleId }) => {
      setMemberRolesMap(prev => ({ ...prev, [userId]: (prev[userId] || []).filter(id => id !== roleId) }));
    };

    const events = [
      ['team_member_added', onMemberAdded], ['team_member_removed', onMemberRemoved],
      ['team_updated', onTeamUpdated], ['server_updated', onTeamUpdated],
      ['channel_created', onChannelCreated], ['channel_updated', onChannelUpdated],
      ['channel_deleted', onChannelDeleted], ['channel_moved', onChannelUpdated],
      ['category_created', onCategoryCreated], ['category_updated', onCategoryUpdated],
      ['category_deleted', onCategoryDeleted],
      ['role_created', onRoleCreated], ['role_updated', onRoleUpdated], ['role_deleted', onRoleDeleted],
      ['member_role_added', onMemberRoleAdded], ['member_role_removed', onMemberRoleRemoved],
    ];
    events.forEach(([e, h]) => socket.on(e, h));
    return () => events.forEach(([e, h]) => socket.off(e, h));
  }, [socket, teamId, channelId, navigate]);

  // ═══════════════════════════════════════════════════════════
  // SOCKET: Channel messages (real-time) + unread tracking
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    if (!socket) return;
    const onMessage = (payload) => {
      const msgChannelId = payload.channelId;
      const currentChId = parseInt(channelId, 10);
      const msg = payload.message;
      const senderId = msg?.sender_id || msg?.sender?.id;
      const isOwnMessage = senderId === user?.id;
      const mentionNames = ['everyone', 'channel'];
      if (user?.display_name) mentionNames.push(user.display_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      if (user?.username) mentionNames.push(user.username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

      if (msgChannelId === currentChId) {
        if (senderId && senderId !== user?.id) {
          setTypingUsers(prev => prev.filter(u => u.userId !== senderId));
        }
        // Webhooks are never "own" - always show them.
        // Ignore only same-socket echoes; allow same-user messages from other devices.
        const sameSocket = payload.sourceSocketId && socket?.id && payload.sourceSocketId === socket.id;
        if (!msg?.is_webhook && isOwnMessage && sameSocket) return;
        setMessages(prev => prev.some(m => m.id === msg?.id) ? prev : [...prev, msg]);

        // Check if user is mentioned in this message
        if (mentionNames.length > 0 && msg?.content && (msg.type === 'text' || msg.type === undefined)) {
          const mentionRegex = new RegExp(`@(${mentionNames.join('|')})`, 'i');
          if (mentionRegex.test(msg.content)) {
            const ch = channels.find(c => c.id === msgChannelId);
            addInboxItem({
              channelName: ch?.name || '',
              channelPath: `/team/${teamId}/channel/${msgChannelId}`,
              senderName: msg.sender?.display_name || 'Someone',
              preview: msg.content.substring(0, 100),
            });
            playPing();
          }
          // Check if it's a reply to own message
          if (msg.reply_to_id) {
            const ch = channels.find(c => c.id === msgChannelId);
            addInboxItem({
              channelName: ch?.name || '',
              channelPath: `/team/${teamId}/channel/${msgChannelId}`,
              senderName: msg.sender?.display_name || 'Someone',
              preview: msg.content.substring(0, 100),
            });
            playPing();
          }
        }
      } else {
        setUnreadChannels(prev => {
          if (prev.has(msgChannelId)) return prev;
          const next = new Set(prev);
          next.add(msgChannelId);
          return next;
        });

        // Still check for mentions in other channels
        if (!isOwnMessage && mentionNames.length > 0 && msg?.content && (msg.type === 'text' || msg.type === undefined)) {
          const mentionRegex = new RegExp(`@(${mentionNames.join('|')})`, 'i');
          if (mentionRegex.test(msg.content)) {
            const ch = channels.find(c => c.id === msgChannelId);
            addInboxItem({
              channelName: ch?.name || '',
              channelPath: `/team/${teamId}/channel/${msgChannelId}`,
              senderName: msg.sender?.display_name || 'Someone',
              preview: msg.content.substring(0, 100),
            });
            playPing();
          }
        }
      }
    };
    const onMessageEdited = ({ channelId: chId, message }) => {
      if (chId === parseInt(channelId, 10))
        setMessages(prev => prev.map(m => m.id === message.id ? { ...m, ...message } : m));
    };
    const onMessageDeleted = ({ channelId: chId, messageId }) => {
      if (chId === parseInt(channelId, 10))
        setMessages(prev => prev.filter(m => m.id !== messageId));
    };

    const onReactionAdded = ({ channelId: chId, messageId, emoji, userId, displayName }) => {
      if (chId === parseInt(channelId, 10)) {
        setMessageReactions(prev => {
          const msgReactions = prev[messageId] || [];
          const existing = msgReactions.find(r => r.emoji === emoji);
          if (existing) {
            if (!existing.userIds.some(id => String(id) === String(userId)))
              return { ...prev, [messageId]: msgReactions.map(r => r.emoji === emoji ? { ...r, count: r.count + 1, userIds: [...r.userIds, userId], users: [...r.users, displayName] } : r) };
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
  }, [socket, channelId, user?.id, user?.display_name, teamId, channels, addInboxItem, playPing]);

  // Typing events
  useEffect(() => {
    if (!socket || !channelId) return;
    const onTyping = ({ channelId: chId, userId: uid, displayName }) => {
      if (chId !== parseInt(channelId, 10) || uid === user?.id) return;
      setTypingUsers(prev => {
        const next = prev.filter(u => u.userId !== uid);
        next.push({ userId: uid, displayName });
        return next;
      });
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        setTypingUsers(prev => prev.filter(u => u.userId !== uid));
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

  // Écouter quand un message en file d'attente est envoyé
  useEffect(() => {
    const handler = (e) => {
      const { tempId, message, context, targetId } = e.detail || {};
      if (context !== 'channel' || String(targetId) !== String(channelId) || !message) return;
      setMessages(prev => prev.map(m => (
        m.id === tempId
          ? { ...message, _clientKey: m._clientKey || m.id }
          : m
      )));
    };
    window.addEventListener(OFFLINE_SENT_EVENT, handler);
    return () => window.removeEventListener(OFFLINE_SENT_EVENT, handler);
  }, [channelId]);

  // ═══════════════════════════════════════════════════════════
  // CHANNEL MANAGEMENT
  // ═══════════════════════════════════════════════════════════
  const handleEditChannel = useCallback(async (channelIdToEdit, data) => {
    try {
      const updated = await channelsApi.update(channelIdToEdit, data);
      setChannels(prev => prev.map(c => c.id === channelIdToEdit ? { ...c, ...updated } : c));
      notify.success('Channel updated');
    } catch (err) { notify.error(err.message || 'Failed to update channel'); }
  }, [notify]);

  const handleDeleteChannel = useCallback(async (channelIdToDelete) => {
    try {
      await channelsApi.delete(channelIdToDelete);
      setChannels(prev => {
        const remaining = prev.filter(c => c.id !== channelIdToDelete);
        if (parseInt(channelId, 10) === channelIdToDelete && remaining.length > 0) {
          setChannelId(remaining[0].id);
          navigate(`/team/${teamId}/channel/${remaining[0].id}`, { replace: true });
        }
        return remaining;
      });
      notify.success('Channel deleted');
    } catch (err) { notify.error(err.message || 'Failed to delete channel'); }
  }, [channelId, teamId, navigate, notify]);

  // ═══════════════════════════════════════════════════════════
  // MESSAGE HANDLERS
  // ═══════════════════════════════════════════════════════════
  const sendMessage = useCallback(async (content, type, replyToId) => {
    if (!channelId) return Promise.reject(new Error('No channel'));
    if (socket) socket.emit('stop_typing_channel', { channelId: parseInt(channelId, 10) });
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
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
    setMessages(prev => [...prev, optimisticMsg]);

    if (!isOnline) {
      try {
        await addToOfflineQueue({
          context: 'channel',
          targetId: channelId,
          payload: { content, type, replyToId },
          tempId,
        });
        return optimisticMsg;
      } catch (e) {
        setMessages(prev => prev.map(m =>
          m.id === tempId ? { ...m, _pending: false, _failed: true, _retryPayload: { content, type, replyToId } } : m
        ));
        throw e;
      }
    }

    try {
      const msg = await messagesApi.sendChannel(channelId, content, type, replyToId);
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
        setMessages(prev => prev.map(m => (
          m.id === tempId
            ? { ...commandMsg, _clientKey: m._clientKey || m.id }
            : m
        )));
        return commandMsg;
      }
      setMessages(prev => prev.map(m => (
        m.id === tempId
          ? { ...msg, _clientKey: m._clientKey || m.id }
          : m
      )));
      return msg;
    } catch (err) {
      const { isNetworkError } = await import('../utils/offlineMessageQueue');
      if (isNetworkError(err)) {
        try {
          await addToOfflineQueue({
            context: 'channel',
            targetId: channelId,
            payload: { content, type, replyToId },
            tempId,
          });
          return optimisticMsg;
        } catch (e) {
          setMessages(prev => prev.map(m =>
            m.id === tempId ? { ...m, _pending: false, _failed: true, _retryPayload: { content, type, replyToId } } : m
          ));
          throw err;
        }
      }
      setMessages(prev => prev.map(m =>
        m.id === tempId ? { ...m, _pending: false, _failed: true, _retryPayload: { content, type, replyToId } } : m
      ));
      throw err;
    }
  }, [channelId, socket, user, isOnline, addToOfflineQueue]);

  const retryFailedMessage = useCallback(msg => {
    const payload = msg._retryPayload;
    if (!payload) return;
    setMessages(prev => prev.filter(m => m.id !== msg.id));
    sendMessage(payload.content, payload.type, payload.replyToId);
  }, [sendMessage]);

  const sendMedia = useCallback((item, type = 'sticker') => {
    if (!channelId) return Promise.reject(new Error('No channel'));
    const messageType = type === 'gif' ? 'gif' : type === 'emoji' ? 'emoji' : 'sticker';
    const content = item.image_url || item.url;
    return messagesApi.sendChannel(channelId, content, messageType, null).then(msg => {
      setMessages(prev => [...prev, msg]);
      return msg;
    });
  }, [channelId]);

  const handleToggleStickerPanel = useCallback(() => setShowStickerPanel(prev => !prev), []);
  const handleStickerSelect = useCallback(item => sendMedia(item, item.type || 'sticker'), [sendMedia]);
  const handleEmojiSelect = useCallback(emoji => messageInputRef.current?.insertText(emoji), []);

  const maxFileSize = user?.has_nitro ? 25 * 1024 * 1024 : 8 * 1024 * 1024;

  const uploadFile = useCallback((file, voiceDuration = null, caption = null) => {
    if (!channelId) return Promise.reject(new Error('No channel'));

    // Client-side subscription size check
    if (file.size > maxFileSize) {
      const limitMb = user?.has_nitro ? '25' : '8';
      const msg = user?.has_nitro
        ? `Fichier trop volumineux. Limite Nitro : ${limitMb} Mo.`
        : `Fichier trop volumineux. Limite : ${limitMb} Mo. Upgrade vers Nitro pour 25 Mo.`;
      notify.error(msg);
      return Promise.reject(new Error(msg));
    }

    const isImage = file.type.startsWith('image/');
    const tempId = `temp_${Date.now()}`;
    const optimisticMessage = {
      id: tempId, _clientKey: tempId, channel_id: parseInt(channelId, 10), sender_id: user?.id,
      content: URL.createObjectURL(file), type: isImage ? 'image' : 'file',
      created_at: new Date().toISOString(),
      sender: { id: user?.id, display_name: user?.display_name, avatar_url: user?.avatar_url },
      attachment: { file_name: file.name, file_url: URL.createObjectURL(file), file_size: file.size, mime_type: file.type },
      caption: caption || null,
      _pending: true, _voiceDuration: voiceDuration,
    };
    setMessages(prev => [...prev, optimisticMessage]);
    return messagesApi.uploadChannel(channelId, file, caption).then(msg => {
      setMessages(prev => prev.map(m => (
        m.id === tempId
          ? { ...msg, _pending: false, _clientKey: m._clientKey || m.id }
          : m
      )));
      return msg;
    }).catch(err => {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, _pending: false, _failed: true } : m));
      notify.error(err.message || t('chat.sendError'));
      throw err;
    });
  }, [channelId, user, maxFileSize, notify, t]);

  const onTyping = useCallback(() => {
    if (socket && channelId) socket.emit('typing_channel', { channelId: parseInt(channelId, 10) });
  }, [socket, channelId]);

  const handleEdit = useCallback((messageId, newContent) => {
    if (!channelId) return;
    messagesApi.editChannel(channelId, messageId, newContent)
      .then(updatedMsg => setMessages(prev => prev.map(m => m.id === messageId ? { ...m, ...updatedMsg } : m)))
      .catch(err => notify.error(err.message || t('errors.edit')));
  }, [channelId, notify, t]);

  const handleDeleteForMe = useCallback(msg => {
    if (!channelId) return;
    setMessages(prev => prev.map(m => (m.id === msg.id ? { ...m, _deleting: true } : m)));
    window.setTimeout(() => {
      setMessages(prev => prev.filter(m => m.id !== msg.id));
      undoToast.show(
        t('chat.messageHidden'),
        () => messagesApi.hideChannel(channelId, msg.id).catch(err => { notify.error(err.message); setMessages(prev => [...prev, msg].sort((a, b) => a.id - b.id)); }),
        () => setMessages(prev => [...prev, msg].sort((a, b) => a.id - b.id))
      );
    }, DELETE_FUME_MS);
  }, [channelId, notify, t, DELETE_FUME_MS]);

  const doDeleteForAll = useCallback((msg) => {
    if (!channelId) return;
    setMessages(prev => prev.map(m => (m.id === msg.id ? { ...m, _deleting: true } : m)));
    window.setTimeout(() => {
      setMessages(prev => prev.filter(m => m.id !== msg.id));
      messagesApi.deleteChannel(channelId, msg.id).catch(err => { notify.error(err.message); setMessages(prev => [...prev, msg].sort((a, b) => a.id - b.id)); });
    }, DELETE_FUME_MS);
  }, [channelId, notify, DELETE_FUME_MS]);

  const handleDeleteForAll = useCallback((msg, instant) => {
    if (instant) {
      doDeleteForAll(msg);
      setDeleteCaptionConfirm(null);
    } else {
      setDeleteConfirm(msg);
    }
  }, [doDeleteForAll]);

  const handleRequestDeleteCaption = useCallback((msg) => {
    setDeleteCaptionConfirm(msg);
  }, []);

  const handleConfirmDeleteCaption = useCallback(() => {
    if (deleteCaptionConfirm) {
      doDeleteForAll(deleteCaptionConfirm);
    }
    setDeleteCaptionConfirm(null);
  }, [deleteCaptionConfirm, doDeleteForAll]);

  const handleConfirmDelete = useCallback(() => {
    if (deleteConfirm) doDeleteForAll(deleteConfirm);
    setDeleteConfirm(null);
  }, [deleteConfirm, doDeleteForAll]);

  const lastOwnMessage = useMemo(() => {
    if (messages.length === 0) return null;
    const last = messages[messages.length - 1];
    return last.sender_id === user?.id && last.type === 'text' ? last : null;
  }, [messages, user?.id]);

  const handleEditLastMessage = useCallback(msg => messageListRef.current?.startEdit(msg), []);
  const handleReply = useCallback(msg => setReplyTo(msg), []);
  const handleCancelReply = useCallback(() => setReplyTo(null), []);

  const handleAddReaction = useCallback(async (messageId, emoji) => {
    if (!channelId) return;
    try {
      await reactionsApi.addChannel(channelId, messageId, emoji);
      setMessageReactions(prev => {
        const msgR = prev[messageId] || [];
        const ex = msgR.find(r => r.emoji === emoji);
        if (ex) {
          if (!ex.userIds.some(id => String(id) === String(user?.id)))
            return { ...prev, [messageId]: msgR.map(r => r.emoji === emoji ? { ...r, count: r.count + 1, userIds: [...r.userIds, user?.id], users: [...r.users, user?.display_name] } : r) };
          return prev;
        }
        return { ...prev, [messageId]: [...msgR, { emoji, count: 1, userIds: [user?.id], users: [user?.display_name] }] };
      });
    } catch (err) { notify.error(err.message || t('errors.addReaction')); }
  }, [channelId, user, notify, t]);

  const handleRemoveReaction = useCallback(async (messageId, emoji, targetUserId = user?.id) => {
    if (!channelId) return;
    try {
      await reactionsApi.removeChannel(channelId, messageId, emoji, targetUserId);
      setMessageReactions(prev => {
        const msgR = prev[messageId] || [];
        return {
          ...prev,
          [messageId]: msgR
            .map(r => {
              if (r.emoji !== emoji) return r;
              const removeIdx = r.userIds.findIndex(id => String(id) === String(targetUserId));
              if (removeIdx === -1) return r;
              const nextUserIds = r.userIds.filter((_, i) => i !== removeIdx);
              const nextUsers = r.users.filter((_, i) => i !== removeIdx);
              return { ...r, count: Math.max(0, r.count - 1), userIds: nextUserIds, users: nextUsers };
            })
            .filter(r => r.count > 0)
        };
      });
    } catch (err) { notify.error(err.message || t('errors.removeReaction')); }
  }, [channelId, user, notify, t]);

  // ═══════════════════════════════════════════════════════════
  // MEMBER MANAGEMENT
  // ═══════════════════════════════════════════════════════════
  const handleRemoveMember = useCallback((userId, displayName) => {
    setConfirmModal({ isOpen: true, userId, displayName });
  }, []);

  const confirmRemoveMember = useCallback(async () => {
    const { userId, displayName } = confirmModal;
    const isSelf = userId === user?.id;
    setConfirmModal({ isOpen: false, userId: null, displayName: '' });
    try {
      await teamsApi.removeMember(teamId, userId);
      if (isSelf) {
        onLeaveServer?.(teamId);
      } else {
        setMembers(prev => prev.filter(m => m.id !== userId));
      }
    } catch (err) {
      notify.error(err.message || t('errors.removeMember'));
    }
  }, [confirmModal, teamId, user?.id, notify, t, onLeaveServer]);

  const handleBanMember = useCallback(async (userId, reason = '') => {
    try {
      await servers.banMember(teamId, userId, { reason });
      setMembers(prev => prev.filter(m => m.id !== userId));
      notify.success('Member banned');
    } catch (err) { notify.error(err.message || 'Failed to ban member'); }
  }, [teamId, notify]);

  const currentMember = useMemo(
    () => members.find(m => String(m.id) === String(user?.id)),
    [members, user?.id]
  );
  const memberRole = currentMember?.role || currentMember?.team_role || null;
  const isOwner = useMemo(
    () => memberRole === 'owner' || String(team?.owner_id) === String(user?.id),
    [memberRole, team?.owner_id, user?.id]
  );
  const isTeamAdmin = useMemo(() => memberRole === 'admin', [memberRole]);
  const canManage = useMemo(() => isOwner || isTeamAdmin, [isOwner, isTeamAdmin]);
  const canModerateReactions = useMemo(() => {
    if (canManage) return true;
    const currentRoleIds = memberRolesMap?.[user?.id] || [];
    if (!Array.isArray(currentRoleIds) || currentRoleIds.length === 0) return false;
    const isEnabled = (v) => v === true || v === 1 || v === '1' || v === 'true';
    const hasRole = (roleId) => currentRoleIds.some(id => String(id) === String(roleId));
    return roles.some(role =>
      hasRole(role.id) &&
      (isEnabled(role.perm_administrator) || isEnabled(role.perm_manage_messages))
    );
  }, [canManage, memberRolesMap, roles, user?.id]);

  // ═══════════════════════════════════════════════════════════
  // TOPIC EDITING
  // ═══════════════════════════════════════════════════════════
  const startEditTopic = useCallback(() => {
    if (!canManage) return;
    setTopicDraft(currentChannel?.topic || '');
    setEditingTopic(true);
  }, [canManage, currentChannel?.topic]);

  const saveTopic = useCallback(async () => {
    if (!currentChannel) return;
    setEditingTopic(false);
    if (topicDraft === (currentChannel.topic || '')) return;
    await handleEditChannel(currentChannel.id, { topic: topicDraft });
  }, [currentChannel, topicDraft, handleEditChannel]);

  // ═══════════════════════════════════════════════════════════
  // RENDER - Always show layout, never full-screen loading
  // ═══════════════════════════════════════════════════════════
  const displayTeam = team || (teamId ? { id: parseInt(teamId, 10), name: '' } : null);
  const displayChannel = currentChannel || (channelId && channels.find(c => String(c.id) === String(channelId))) || null;

  const handleSwipeBack = useCallback(() => {
    if (mobileChannelListOpen) {
      navigate(`/channels/@me`);
    } else if (channelId) {
      lastChannelIdRef.current = channelId;
      navigate(`/team/${teamId}`);
    } else {
      setMobileChannelListOpen(true);
    }
  }, [mobileChannelListOpen, navigate, channelId, teamId]);

  const handleSwipeForward = useCallback(() => {
    if (mobileChannelListOpen && lastChannelIdRef.current) {
      navigate(`/team/${teamId}/channel/${lastChannelIdRef.current}`);
      lastChannelIdRef.current = null;
    }
  }, [mobileChannelListOpen, navigate, teamId]);

  const swipeBack = useSwipeBack(
    isMobile && teamId ? handleSwipeBack : undefined,
    isMobile && teamId && mobileChannelListOpen && lastChannelIdRef.current ? handleSwipeForward : undefined
  );

  const swipeHandlers = isMobile && teamId
    ? {
        onTouchStart: swipeBack.onTouchStart,
        onTouchMove: swipeBack.onTouchMove,
        onTouchEnd: swipeBack.onTouchEnd,
        onTouchCancel: swipeBack.onTouchCancel,
      }
    : {};

  return (
    <div
      className={`team-view ${mobileChannelListOpen ? 'mobile-channels-open' : ''} ${showStickerPanel ? 'sticker-panel-open' : ''}`}
      style={{
        transform: isMobile ? `translateX(${swipeBack.dragOffsetX}px)` : undefined,
        transition: isMobile && !swipeBack.isDragging ? 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none',
      }}
      {...swipeHandlers}
    >
      {swipeBack.swipeProgress > 0 && channelId && (
        <div
          className="swipe-back-indicator"
          style={{ opacity: Math.min(1, swipeBack.swipeProgress * 1.2), transform: `translateX(${swipeBack.swipeProgress * 12}px)` }}
          aria-hidden
        >
          <div className="swipe-back-chevron" />
        </div>
      )}
      {isMobile && mobileChannelListOpen && (
        <div className="mobile-nav-overlay" onClick={() => setMobileChannelListOpen(false)} />
      )}
      <ChannelList
        team={displayTeam}
        channels={channels}
        categories={categories}
        currentChannelId={String(channelId)}
        onChannelsChange={setChannels}
        onCategoriesChange={setCategories}
        onOpenSettings={() => setShowServerSettings(true)}
        onInvite={() => setShowInviteModal(true)}
        onLeave={() => handleRemoveMember(user?.id, user?.display_name)}
        canManage={canManage}
        unreadChannels={unreadChannels}
        onEditChannel={handleEditChannel}
        onDeleteChannel={handleDeleteChannel}
        hideUserPanel={isMobile && mobileChannelListOpen}
        isMobile={isMobile}
        onActiveChannelClick={isMobile ? () => setMobileChannelListOpen(false) : undefined}
      />

      {expandedLiveView ? (
        <div className="live-stream-fullscreen">
          <LiveStreamFullscreenVideo
            stream={expandedLiveView.userId === user?.id ? ownScreenStream : remoteVideoStreams?.[expandedLiveView.userId]}
            displayName={expandedLiveView.displayName}
            onClose={() => setExpandedLiveView(null)}
          />
          <div className="live-stream-profile-bar">
            <VoiceUserProfileBar />
          </div>
        </div>
      ) : (
      <>
      <div className={`team-chat ${showStickerPanel ? 'sticker-panel-open' : ''}`}>
        <ChannelHeader
          channel={displayChannel}
          showMembers={showMembers}
          onToggleMembers={() => setShowMembers(!showMembers)}
          onOpenSearch={onOpenSearch}
          canManage={canManage}
          editingTopic={editingTopic}
          topicDraft={topicDraft}
          onStartEditTopic={startEditTopic}
          onSaveTopic={saveTopic}
          onCancelEdit={() => setEditingTopic(false)}
          onTopicChange={setTopicDraft}
          isMobile={isMobile}
          showMobileBack={!!channelId}
          onToggleMobileChannelList={() => {
            if (channelId) {
              lastChannelIdRef.current = channelId;
              navigate(`/team/${teamId}`);
            } else {
              navigate('/channels/@me');
            }
          }}
          onOpenTopic={currentChannel?.topic ? () => setShowTopicModal(true) : undefined}
          showInbox={showInbox}
          onToggleInbox={() => setShowInbox(v => !v)}
        />

        {displayChannel?.channel_type === 'voice' ? (
          <div className="team-chat-loading">{t('voice.redirecting') || 'Redirecting…'}</div>
        ) : (
          <div className="chat-main">
            <FileDropOverlay
              uploadTarget={`#${displayChannel?.name || 'general'}`}
              canWrite={!!uploadFile && displayChannel?.can_send !== false}
              maxFileSize={maxFileSize}
              onDrop={(file) => messageInputRef.current?.attachFile?.(file)}
              onUploadDirect={(file) => uploadFile(file).catch(() => {})}
            >
              <div className="chat-main-content">
                <MessageList
                  ref={messageListRef}
                  messages={messages}
                  currentUserId={user?.id}
                  currentUserName={user?.display_name}
                  otherUsers={members}
                  roles={roles}
                  memberRolesMap={memberRolesMap}
                  members={members}
                  onEdit={handleEdit}
                  onDeleteForMe={handleDeleteForMe}
                  onDeleteForAll={handleDeleteForAll}
                  onRequestDeleteCaption={handleRequestDeleteCaption}
                  onReply={handleReply}
                  onAddReaction={handleAddReaction}
                  onRemoveReaction={handleRemoveReaction}
                  canModerateReactions={canModerateReactions}
                  messageReactions={messageReactions}
                  onRetryFailedMessage={retryFailedMessage}
                  topBanner={displayTeam?.banner_url ? (
                    <div className="team-chat-banner" style={{ backgroundImage: `url(${displayTeam.banner_url})` }} />
                  ) : null}
                  serverName={displayTeam?.name}
                  onInviteClick={() => setShowInviteModal(true)}
                  onFocusInput={() => messageInputRef.current?.focus?.()}
                />
                {typingUsers.length > 0 && (
                  <div className="chat-typing">
                    <div className="chat-typing-dots"><span></span><span></span><span></span></div>
                    {typingUsers.map(u => u.displayName).join(', ')} {typingUsers.length > 1 ? t('chat.typingPlural') : t('chat.typing')}...
                  </div>
                )}
                {displayChannel && (
                  <MessageInput
                    ref={messageInputRef}
                    onSend={sendMessage}
                    onUpload={uploadFile}
                    onTyping={onTyping}
                    placeholder={`Message #${displayChannel?.name || 'general'}`}
                    lastOwnMessage={lastOwnMessage}
                    onEditLastMessage={handleEditLastMessage}
                    draftKey={`team_${teamId}_channel_${channelId}`}
                    replyTo={replyTo}
                    onCancelReply={handleCancelReply}
                    mentionUsers={members}
                    onToggleStickerPanel={handleToggleStickerPanel}
                    stickerPanelOpen={showStickerPanel}
                    isAdmin={canManage}
                    canSend={displayChannel?.can_send !== false}
                    maxFileSize={maxFileSize}
                    onInputFocus={isMobile ? () => messageListRef.current?.scrollToBottom?.() : undefined}
                  />
                )}
              </div>
            </FileDropOverlay>
            {isMobile && (
              <StickerPicker
                isOpen={showStickerPanel}
                onClose={() => setShowStickerPanel(false)}
                onSelect={handleStickerSelect}
                onEmojiSelect={handleEmojiSelect}
              />
            )}
          </div>
        )}
      </div>

      {!isMobile && (
        <StickerPicker
          isOpen={showStickerPanel}
          onClose={() => setShowStickerPanel(false)}
          onSelect={handleStickerSelect}
          onEmojiSelect={handleEmojiSelect}
        />
      )}

      {showMembers && (
        <MembersPanel teamId={teamId} channelId={channelId} members={members} roles={roles} memberRolesMap={memberRolesMap} currentUserId={user?.id} isOwner={isOwner} canManage={canManage}
          onManageRoles={m => { setSelectedMember(m); setShowRolesModal(true); }} onKick={m => handleRemoveMember(m.id, m.display_name)} onBan={m => handleBanMember(m.id)} />
      )}
      </>
      )}

      <ConfirmModal isOpen={confirmModal.isOpen} title={confirmModal.userId === user?.id ? t('team.leaveGroup') : t('team.removeMember')} message={confirmModal.userId === user?.id ? t('team.leaveConfirm') : t('team.removeConfirm', { name: confirmModal.displayName })} confirmText={confirmModal.userId === user?.id ? t('team.leave') : t('team.remove')} cancelText={t('common.cancel')} type="danger" onConfirm={confirmRemoveMember} onCancel={() => setConfirmModal({ isOpen: false, userId: null, displayName: '' })} />
      <ConfirmModal isOpen={!!deleteConfirm} message={t('chat.deleteMessageConfirm')} confirmText={t('chat.delete')} cancelText={t('common.cancel')} type="danger" onConfirm={handleConfirmDelete} onCancel={() => setDeleteConfirm(null)} />
      <ConfirmModal isOpen={!!deleteCaptionConfirm} message={t('chat.deleteCaptionConfirm')} confirmText={t('chat.delete')} cancelText={t('common.cancel')} type="danger" onConfirm={handleConfirmDeleteCaption} onCancel={() => setDeleteCaptionConfirm(null)} />
      <ServerSettings team={team} roles={roles} members={members} channels={channels} categories={categories} isOpen={showServerSettings} onClose={() => setShowServerSettings(false)} onUpdate={(updatedTeam) => {
  invalidateCache('/teams');
  invalidateCache('/servers');
  if (updatedTeam) {
    setTeam(prev => prev ? { ...prev, ...updatedTeam } : updatedTeam);
  } else {
    teamsApi.get(teamId).then(setTeam);
  }
  servers.getRoles(teamId).then(setRoles).catch(() => {});
}} />
      <ShareInviteModal isOpen={showInviteModal} onClose={() => setShowInviteModal(false)} team={team} channels={channels} />
      <MemberRolesModal isOpen={showRolesModal} onClose={() => { setShowRolesModal(false); setSelectedMember(null); }} team={team} member={selectedMember} />
      {showTopicModal && (
        <TopicModal
          channel={currentChannel}
          canManage={canManage}
          onClose={() => setShowTopicModal(false)}
          onStartEditTopic={startEditTopic}
        />
      )}
      {showInbox && <InboxPanel onClose={() => setShowInbox(false)} />}
    </div>
  );
});

export default TeamChat;
