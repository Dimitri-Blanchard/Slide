import { useCallback, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { friends as friendsApi, direct as directApi, invalidateCache } from '../api';
import { useAuth } from '../context/AuthContext';
import { useVoice } from '../context/VoiceContext';
import { useNotification } from '../context/NotificationContext';
import { useLanguage } from '../context/LanguageContext';
import { Icons } from '../components/ContextMenu';

export function useUserContextMenuItems(user, context = {}) {
  const { conversationId, channelId, teamId, lastMessageId, hasUnread, isDmList, onPinConversation, isPinned, canPin, onOpenNicknameModal, onOpenNoteModal, isInCallWaiting } = context;
  const { user: currentUser } = useAuth();
  const { joinVoiceDM, ringVoiceDM } = useVoice();
  const { notify } = useNotification();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [friendIds, setFriendIds] = useState(new Set());
  const emitFriendsChanged = useCallback(() => {
    window.dispatchEvent(new CustomEvent('slide:friends-changed'));
  }, []);

  const isOwn = currentUser?.id === user?.id;

  useEffect(() => {
    if (!user?.id || isOwn) return;
    friendsApi.list()
      .then((list) => setFriendIds(new Set((list || []).map((f) => f.id))))
      .catch(() => setFriendIds(new Set()));
  }, [user?.id, isOwn]);

  const copyUserId = useCallback(() => {
    if (user?.id) navigator.clipboard?.writeText(String(user.id)).then(() => notify.success(t('common.copied') || 'Copied!'));
  }, [user?.id, notify, t]);

  const copyChannelId = useCallback(() => {
    if (channelId) navigator.clipboard?.writeText(String(channelId)).then(() => notify.success(t('common.copied') || 'Copied!'));
  }, [channelId, notify, t]);

  const handleBlock = useCallback(async () => {
    if (!user?.id || isOwn) return;
    try {
      await friendsApi.block(user.id);
      invalidateCache('/friends');
      emitFriendsChanged();
      notify.success(t('friends.blocked') || 'Blocked');
      if (conversationId) {
        navigate('/channels/@me');
      }
    } catch (err) {
      notify.error(err.message);
    }
  }, [user?.id, isOwn, conversationId, navigate, notify, t, emitFriendsChanged]);

  const handleAddFriend = useCallback(async () => {
    if (!user?.id || isOwn) return;
    const username = user.username || user.display_name;
    if (!username) {
      notify.error(t('friends.addFriendError') || 'Cannot add friend: username unknown');
      return;
    }
    try {
      await friendsApi.sendRequest(username);
      invalidateCache('/friends');
      emitFriendsChanged();
      notify.success((t('friends.requestSent') || 'Friend request sent to {name}').replace('{name}', username));
    } catch (err) {
      notify.error(err.message);
    }
  }, [user?.id, user?.username, user?.display_name, isOwn, notify, t, emitFriendsChanged]);

  const handleRemoveFriend = useCallback(async () => {
    if (!user?.id || isOwn) return;
    try {
      await friendsApi.removeFriend(user.id);
      invalidateCache('/friends');
      emitFriendsChanged();
      setFriendIds((prev) => {
        const next = new Set(prev);
        next.delete(user.id);
        return next;
      });
      notify.success(t('friends.removed') || 'Friend removed');
      if (conversationId) {
        navigate('/channels/@me');
      }
    } catch (err) {
      notify.error(err.message);
    }
  }, [user?.id, isOwn, conversationId, navigate, notify, t, emitFriendsChanged]);

  const handleStartCall = useCallback(() => {
    if (!conversationId || !user?.id) return;
    joinVoiceDM(parseInt(conversationId, 10), user.display_name || user.username);
    navigate(`/channels/@me/${conversationId}`);
  }, [conversationId, user?.id, user?.display_name, user?.username, joinVoiceDM, navigate]);

  const handleRingAgain = useCallback(() => {
    if (!conversationId) return;
    ringVoiceDM();
  }, [conversationId, ringVoiceDM]);

  const handleMarkAsRead = useCallback(async () => {
    if (!conversationId || !lastMessageId) return;
    try {
      await directApi.markRead(conversationId, lastMessageId);
      notify.success(t('common.markedAsRead') || 'Marked as read');
    } catch (err) {
      notify.error(err.message);
    }
  }, [conversationId, lastMessageId, notify, t]);

  return useCallback(() => {
    if (!user?.id) return [];
    const items = [];

    items.push({ label: t('friends.message'), icon: Icons.message, onClick: async () => {
      try {
        const conv = await directApi.createConversation(user.id);
        navigate(`/channels/@me/${conv.conversation_id}`);
      } catch (err) { notify.error(err.message); }
    } });
    items.push({ separator: true });

    if (conversationId) {
      if (isInCallWaiting) {
        items.push({
          label: t('voice.ring') || 'Ring',
          icon: Icons.phone,
          onClick: handleRingAgain,
        });
      } else {
        items.push({
          label: t('voice.startCall') || 'Start Call',
          icon: Icons.phone,
          onClick: handleStartCall,
        });
      }
      if (hasUnread && lastMessageId) {
        items.push({
          label: t('common.markAsRead') || 'Mark as Read',
          icon: Icons.checkRead,
          onClick: handleMarkAsRead,
        });
      }
      if (isDmList && onPinConversation) {
        items.push({
          label: isPinned ? (t('chat.unpin') || 'Unpin') : (t('chat.pin') || 'Pin'),
          icon: isPinned ? Icons.unpin : Icons.pin,
          onClick: onPinConversation,
          disabled: !isPinned && canPin === false,
        });
      }
      items.push({ separator: true });
    }

    items.push({
      label: t('chat.addNote') || 'Add Note',
      icon: Icons.note,
      onClick: () => onOpenNoteModal?.(user),
    });
    items.push({
      label: t('chat.addFriendNickname') || 'Add Friend Nickname',
      icon: Icons.profile,
      onClick: () => onOpenNicknameModal?.(user),
    });

    if (!isOwn) {
      const isFriend = friendIds.has(user.id);
      if (isFriend) {
        items.push({
          label: t('friends.removeFriend') || 'Remove Friend',
          icon: Icons.delete,
          onClick: handleRemoveFriend,
          danger: true,
        });
      } else {
        items.push({
          label: t('friends.addFriend') || 'Add Friend',
          icon: Icons.invite,
          onClick: handleAddFriend,
        });
      }
    }

    items.push({ separator: true });

    if (channelId) {
      items.push({
        label: t('common.copyChannelId') || 'Copy Channel ID',
        icon: Icons.copy,
        onClick: copyChannelId,
      });
      items.push({ separator: true });
    }

    items.push({
      label: t('common.copyUserId') || 'Copy User ID',
      icon: Icons.copy,
      onClick: copyUserId,
    });

    if (!isOwn) {
      items.push({ separator: true });
      items.push({
        label: t('friends.block') || 'Block',
        icon: Icons.delete,
        onClick: handleBlock,
        danger: true,
      });
    }

    return items;
  }, [
    user, conversationId, channelId, lastMessageId, hasUnread, isOwn,
    isDmList, onPinConversation, isPinned, canPin, isInCallWaiting,
    friendIds,
    handleStartCall, handleRingAgain, handleMarkAsRead,
    handleBlock, handleAddFriend, handleRemoveFriend,
    copyUserId, copyChannelId, onOpenNicknameModal, onOpenNoteModal, t, notify, navigate,
  ]);
}
