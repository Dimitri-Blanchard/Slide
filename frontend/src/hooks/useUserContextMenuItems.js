import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { friends as friendsApi, direct as directApi, localPrivate as localPrivateApi } from '../api';
import { useAuth } from '../context/AuthContext';
import { useVoice } from '../context/VoiceContext';
import { useNotification } from '../context/NotificationContext';
import { useLanguage } from '../context/LanguageContext';
import { useSettings } from '../context/SettingsContext';
import { Icons } from '../components/ContextMenu';
import useFriendsSync from './useFriendsSync';
import { notifyFriendsChanged, isFriendRequestDuplicateError } from '../utils/friendsSync';
import { isLocalPrivateChatAvailable, makeLocalPrivateRoute, upsertLocalPrivateChat } from '../utils/localPrivateChatCrypto';

export function useUserContextMenuItems(user, context = {}) {
  const { conversationId, channelId, teamId, lastMessageId, hasUnread, isDmList, onPinConversation, isPinned, canPin, onOpenNicknameModal, onOpenNoteModal, isInCallWaiting } = context;
  const { user: currentUser } = useAuth();
  const { joinVoiceDM, ringVoiceDM } = useVoice();
  const { notify } = useNotification();
  const { t } = useLanguage();
  const { developerMode } = useSettings();
  const navigate = useNavigate();
  const { isFriend } = useFriendsSync();

  const isOwn = currentUser?.id === user?.id;

  const copyUserId = useCallback(() => {
    if (user?.id) navigator.clipboard?.writeText(String(user.id)).then(() => notify.success(t('common.copied') || 'Copied!'));
  }, [user?.id, notify, t]);

  const copyChannelId = useCallback(() => {
    if (channelId) navigator.clipboard?.writeText(String(channelId)).then(() => notify.success(t('common.copied') || 'Copied!'));
  }, [channelId, notify, t]);

  const copyConversationId = useCallback(() => {
    if (conversationId) navigator.clipboard?.writeText(String(conversationId)).then(() => notify.success(t('common.copied') || 'Copied!'));
  }, [conversationId, notify, t]);

  const handleBlock = useCallback(async () => {
    if (!user?.id || isOwn) return;
    try {
      await friendsApi.block(user.id);
      notifyFriendsChanged({ userId: user.id, action: 'blocked' });
      notify.success(t('friends.blocked') || 'Blocked');
      if (conversationId) {
        navigate('/channels/@me');
      }
    } catch (err) {
      notify.error(err.message);
    }
  }, [user?.id, isOwn, conversationId, navigate, notify, t]);

  const handleAddFriend = useCallback(async () => {
    if (!user?.id || isOwn) return;
    const username = user.username || user.display_name;
    if (!username) {
      notify.error(t('friends.addFriendError') || 'Cannot add friend: username unknown');
      return;
    }
    try {
      await friendsApi.sendRequest(username);
      notifyFriendsChanged({ action: 'request_sent' });
      notify.success((t('friends.requestSent') || 'Friend request sent to {name}').replace('{name}', username));
    } catch (err) {
      if (isFriendRequestDuplicateError(err.message)) {
        notifyFriendsChanged();
      }
      notify.error(err.message);
    }
  }, [user?.id, user?.username, user?.display_name, isOwn, notify, t]);

  const handleRemoveFriend = useCallback(async () => {
    if (!user?.id || isOwn) return;
    try {
      await friendsApi.removeFriend(user.id);
      notifyFriendsChanged({ userId: user.id, action: 'removed' });
      notify.success(t('friends.removed') || 'Friend removed');
      if (conversationId) {
        navigate('/channels/@me');
      }
    } catch (err) {
      notify.error(err.message);
    }
  }, [user?.id, isOwn, conversationId, navigate, notify, t]);

  const handleStartCall = useCallback(() => {
    if (!conversationId || !user?.id) return;
    joinVoiceDM(parseInt(conversationId, 10), user.display_name || user.username);
  }, [conversationId, user?.id, user?.display_name, user?.username, joinVoiceDM]);

  const handleRingAgain = useCallback(() => {
    if (!conversationId) return;
    ringVoiceDM();
  }, [conversationId, ringVoiceDM]);

  const handleOpenLocalPrivateChat = useCallback(() => {
    if (!user?.id || isOwn) return;
    if (currentUser?.id) {
      upsertLocalPrivateChat(currentUser.id, user, {
        last_message_preview: 'Invitation privée locale',
        last_message_at: new Date().toISOString(),
        initiated_by_me: true,
      });
      localPrivateApi.createRequest(user.id).catch((err) => {
        notify.error(err.message || 'Impossible de créer la demande de chat privé local');
      });
    }
    navigate(makeLocalPrivateRoute(user.id), { state: { user } });
  }, [currentUser?.id, isOwn, navigate, user]);

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
    if (!isOwn && isLocalPrivateChatAvailable()) {
      items.push({
        label: t('chat.localPrivateChat') || 'Créer un chat privé local',
        icon: Icons.lock,
        onClick: handleOpenLocalPrivateChat,
      });
    }
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
      if (isFriend(user.id)) {
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

    if (developerMode) {
      items.push({ separator: true });

      if (channelId) {
        items.push({
          label: t('common.copyChannelId') || 'Copy Channel ID',
          icon: Icons.copy,
          onClick: copyChannelId,
        });
      }

      if (conversationId) {
        items.push({
          label: t('common.copyConversationId') || 'Copy Conversation ID',
          icon: Icons.copy,
          onClick: copyConversationId,
        });
      }

      items.push({
        label: t('common.copyUserId') || 'Copy User ID',
        icon: Icons.copy,
        onClick: copyUserId,
      });
    }

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
    isFriend,
    handleStartCall, handleRingAgain, handleMarkAsRead, handleOpenLocalPrivateChat,
    handleBlock, handleAddFriend, handleRemoveFriend,
    copyUserId, copyChannelId, copyConversationId, developerMode, onOpenNicknameModal, onOpenNoteModal, t, notify, navigate,
  ]);
}
