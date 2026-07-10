import { useState, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { conversations as conversationsApi, localPrivate as localPrivateApi } from '../api';
import { useAuth } from '../context/AuthContext';
import { useVoice } from '../context/VoiceContext';
import { useLanguage } from '../context/LanguageContext';
import { useNotification } from '../context/NotificationContext';
import { useUserContextMenuItems } from './useUserContextMenuItems';
import { Icons } from '../components/ContextMenu';
import { undoToast } from '../components/UndoToast';
import { makeLocalPrivateRoute, removeLocalPrivateChat } from '../utils/localPrivateChatCrypto';

export const MAX_PINNED_DMS = 5;

export function getPinnedConversations() {
  try {
    const pinned = localStorage.getItem('slide_pinned_conversations');
    return pinned ? JSON.parse(pinned) : [];
  } catch {
    return [];
  }
}

export function savePinnedConversations(pinnedIds) {
  localStorage.setItem('slide_pinned_conversations', JSON.stringify(pinnedIds));
}

export function useDmConversationContextMenu({
  currentConversationId,
  onRemoveConversation,
  onRestoreConversation,
}) {
  const [pinnedIds, setPinnedIds] = useState(() => getPinnedConversations());
  const [hiddenConversationIds, setHiddenConversationIds] = useState([]);
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, conversation: null });
  const [profileCard, setProfileCard] = useState({ userId: null, anchorEl: null });
  const [nicknameModalUser, setNicknameModalUser] = useState(null);
  const [noteModalUser, setNoteModalUser] = useState(null);

  const { user: authUser } = useAuth();
  const { voiceConversationId, voiceUsers } = useVoice();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();
  const { notify } = useNotification();

  const handleConversationContextMenu = useCallback((e, conversation) => {
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, conversation });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu({ visible: false, x: 0, y: 0, conversation: null });
  }, []);

  const togglePinConversation = useCallback((convId) => {
    if (!convId) return;
    setPinnedIds((prev) => {
      const isPinned = prev.includes(convId);
      let newPinned;
      if (isPinned) {
        newPinned = prev.filter((id) => id !== convId);
      } else {
        if (prev.length >= MAX_PINNED_DMS) return prev;
        newPinned = [...prev, convId];
      }
      savePinnedConversations(newPinned);
      return newPinned;
    });
  }, []);

  const handleCloseConversation = useCallback((conv) => {
    const convId = conv?.conversation_id;
    if (!convId) return;
    setHiddenConversationIds((prev) => (prev.includes(convId) ? prev : [...prev, convId]));
    setPinnedIds((prev) => {
      const next = prev.filter((id) => id !== convId);
      if (next.length !== prev.length) savePinnedConversations(next);
      return next;
    });
    if (conv.is_local_private) {
      if (!conv.accepted) {
        localPrivateApi.declineRequest(conv.local_private_peer_id).catch(() => {});
      }
      removeLocalPrivateChat(authUser?.id, conv.local_private_peer_id);
      if (location.pathname === makeLocalPrivateRoute(conv.local_private_peer_id)) {
        navigate('/channels/@me');
      }
      return;
    }
    onRemoveConversation?.(convId);
    if (currentConversationId === String(convId)) navigate('/channels/@me');
    undoToast.show(
      t('sidebar.conversationDeleted'),
      async () => {
        try {
          await conversationsApi.delete(convId);
        } catch (err) {
          console.error('Failed to persist conversation deletion:', err);
          setHiddenConversationIds((prev) => prev.filter((id) => id !== convId));
          onRestoreConversation?.(conv);
          notify.error('Failed to delete conversation. Please try again.');
        }
      },
      () => {
        setHiddenConversationIds((prev) => prev.filter((id) => id !== convId));
        onRestoreConversation?.(conv);
      },
    );
  }, [
    authUser?.id,
    currentConversationId,
    location.pathname,
    navigate,
    notify,
    onRemoveConversation,
    onRestoreConversation,
    t,
  ]);

  const conv = contextMenu.conversation;
  const isGroup = !!conv?.is_group;
  const isLocalPrivate = !!conv?.is_local_private;
  const otherUser = conv?.participants?.[0];
  const convId = conv?.conversation_id;
  const dmCallUsers = convId ? (voiceUsers[`dm_${convId}`] || []) : [];
  const othersInCall = dmCallUsers.filter((u) => u.id !== authUser?.id);

  const handleViewProfile = useCallback(() => {
    const conversation = contextMenu.conversation;
    if (!conversation) return;
    if (conversation.is_group) {
      navigate(`/channels/@me/${conversation.conversation_id}`);
      closeContextMenu();
      return;
    }
    const other = conversation.participants?.[0];
    if (other?.id) {
      const virtualAnchor = {
        getBoundingClientRect: () => ({
          top: contextMenu.y,
          bottom: contextMenu.y,
          left: contextMenu.x,
          right: contextMenu.x,
          width: 0,
          height: 0,
        }),
      };
      setProfileCard({ userId: other.id, anchorEl: virtualAnchor });
    }
    closeContextMenu();
  }, [contextMenu, closeContextMenu, navigate]);

  const handlePinConversation = useCallback(() => {
    togglePinConversation(contextMenu.conversation?.conversation_id);
    closeContextMenu();
  }, [contextMenu.conversation, togglePinConversation, closeContextMenu]);

  const handleDeleteConversation = useCallback(() => {
    if (contextMenu.conversation) handleCloseConversation(contextMenu.conversation);
    closeContextMenu();
  }, [contextMenu.conversation, handleCloseConversation, closeContextMenu]);

  const userContext = useMemo(() => ({
    conversationId: isLocalPrivate ? null : convId,
    lastMessageId: conv?.last_message_id || null,
    hasUnread: (conv?.unread_count || 0) > 0,
    isDmList: true,
    isInCallWaiting: convId && voiceConversationId === convId && othersInCall.length === 0,
    onPinConversation: convId ? () => { togglePinConversation(convId); closeContextMenu(); } : undefined,
    isPinned: convId ? pinnedIds.includes(convId) : false,
    canPin: !isLocalPrivate && pinnedIds.length < MAX_PINNED_DMS,
    onOpenNicknameModal: (u) => {
      setNicknameModalUser(u);
      closeContextMenu();
    },
    onOpenNoteModal: (u) => {
      setNoteModalUser(u);
      closeContextMenu();
    },
  }), [
    closeContextMenu,
    conv?.last_message_id,
    conv?.unread_count,
    convId,
    isLocalPrivate,
    othersInCall.length,
    pinnedIds,
    togglePinConversation,
    voiceConversationId,
  ]);

  const getUserMenuItems = useUserContextMenuItems(otherUser || {}, userContext);

  const getContextMenuItems = useCallback(() => {
    if (!isGroup && otherUser) {
      return getUserMenuItems();
    }
    const isPinned = pinnedIds.includes(convId);
    const canPin = !isPinned && pinnedIds.length >= MAX_PINNED_DMS;
    return [
      { icon: Icons.profile, label: t('friends.message'), onClick: handleViewProfile },
      { separator: true },
      {
        icon: isPinned ? Icons.unpin : Icons.pin,
        label: isPinned ? t('chat.unpin') : t('chat.pin'),
        onClick: handlePinConversation,
        disabled: canPin,
      },
      { separator: true },
      { icon: Icons.delete, label: t('chat.delete'), onClick: handleDeleteConversation, danger: true },
    ];
  }, [
    convId,
    getUserMenuItems,
    handleDeleteConversation,
    handlePinConversation,
    handleViewProfile,
    isGroup,
    otherUser,
    pinnedIds,
    t,
  ]);

  const contextMenuTitle = useMemo(() => {
    if (!conv) return undefined;
    if (conv.is_group) {
      return conv.group_name || conv.participants?.map((p) => p.display_name).join(', ') || 'Group';
    }
    return conv.participants?.[0]?.display_name || undefined;
  }, [conv]);

  const filterVisibleConversations = useCallback((conversations) => {
    const hidden = new Set(hiddenConversationIds);
    return (conversations || []).filter((c) => !hidden.has(c.conversation_id));
  }, [hiddenConversationIds]);

  return {
    pinnedIds,
    togglePinConversation,
    handleConversationContextMenu,
    closeContextMenu,
    contextMenu,
    getContextMenuItems,
    contextMenuTitle,
    filterVisibleConversations,
    profileCard,
    setProfileCard,
    nicknameModalUser,
    setNicknameModalUser,
    noteModalUser,
    setNoteModalUser,
    handleCloseConversation,
  };
}
