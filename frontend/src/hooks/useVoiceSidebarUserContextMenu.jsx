import React, { useCallback, useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  friends as friendsApi,
  direct as directApi,
  teams as teamsApi,
  servers,
  invalidateCache,
} from '../api';
import { useAuth } from '../context/AuthContext';
import { useVoice } from '../context/VoiceContext';
import { useNotification } from '../context/NotificationContext';
import { useLanguage } from '../context/LanguageContext';
import { useSettings } from '../context/SettingsContext';
import { Icons } from '../components/ContextMenu';
import { ContextMenuVoiceControls } from '../components/ContextMenuVoiceControls';

export function useVoiceSidebarUserContextMenu(user, context = {}) {
  const {
    teamId,
    channelId,
    roles = [],
    memberRolesMap = {},
    canManage = false,
    onOpenProfileDetail,
    onOpenNoteModal,
    onRolesChanged,
  } = context;

  const { user: currentUser } = useAuth();
  const { joinVoiceDM, streamVolumeByUserId } = useVoice();
  const { notify } = useNotification();
  const { t } = useLanguage();
  const { developerMode } = useSettings();
  const navigate = useNavigate();

  const [friendIds, setFriendIds] = useState(new Set());
  const [inviteTeams, setInviteTeams] = useState([]);

  const isOwn = currentUser?.id != null && user?.id != null && String(currentUser.id) === String(user.id);

  useEffect(() => {
    if (!user?.id || isOwn) return;
    friendsApi.list()
      .then((list) => setFriendIds(new Set((list || []).map((f) => f.id))))
      .catch(() => setFriendIds(new Set()));
  }, [user?.id, isOwn]);

  useEffect(() => {
    if (!user?.id || isOwn) return;
    teamsApi.list()
      .then((list) => setInviteTeams(Array.isArray(list) ? list : []))
      .catch(() => setInviteTeams([]));
  }, [user?.id, isOwn]);

  const emitFriendsChanged = useCallback(() => {
    window.dispatchEvent(new CustomEvent('slide:friends-changed'));
  }, []);

  const handleInviteToServer = useCallback(async (targetTeam) => {
    if (!user?.id || !targetTeam?.id) return;
    try {
      const invite = await servers.createInvite(targetTeam.id, { maxUses: 1 });
      const code = invite?.code || invite?.invite_code;
      if (!code) throw new Error('Invite failed');
      const conv = await directApi.createConversation(user.id);
      const convId = conv?.conversation_id ?? conv?.id;
      if (!convId) throw new Error('Failed to start conversation');
      await directApi.sendMessage(convId, `${window.location.origin}/invite/${code}`, 'text');
      notify.success(
        (t('invite.sentTo') || 'Invite sent to {name}').replace(
          '{name}',
          user.display_name || user.username || ''
        )
      );
    } catch (err) {
      notify.error(err?.message || (t('invite.sendError') || 'Failed to send invite'));
    }
  }, [user, notify, t]);

  const toggleMemberRole = useCallback(async (roleId) => {
    if (!teamId || !user?.id) return;
    const memberRoleIds = memberRolesMap[user.id] || user.roles || [];
    const hasRole = memberRoleIds.some((id) => String(id) === String(roleId));
    try {
      if (hasRole) {
        await servers.removeMemberRole(teamId, user.id, roleId);
      } else {
        await servers.addMemberRole(teamId, user.id, roleId);
      }
      onRolesChanged?.(user.id, roleId, !hasRole);
    } catch (err) {
      notify.error(err?.message || 'Failed to update role');
    }
  }, [teamId, user?.id, user?.roles, memberRolesMap, onRolesChanged, notify]);

  const buildItems = useCallback(() => {
    if (!user?.id) return [];

    const items = [];

    items.push({
      label: t('profile.viewFullProfile') || 'Profile',
      icon: Icons.profile,
      onClick: () => onOpenProfileDetail?.(),
    });
    items.push({ separator: true });

    if (!isOwn) {
      items.push({
        label: t('friends.message') || 'Message',
        icon: Icons.message,
        onClick: async () => {
          try {
            const conv = await directApi.createConversation(user.id);
            navigate(`/channels/@me/${conv.conversation_id}`);
          } catch (err) {
            notify.error(err.message);
          }
        },
      });
      items.push({
        label: t('voice.startCallMenu') || t('voice.startCall') || 'Start a Call',
        icon: Icons.phone,
        onClick: async () => {
          try {
            const conv = await directApi.createConversation(user.id);
            const convId = conv?.conversation_id ?? conv?.id;
            if (!convId) throw new Error('Failed to start call');
            joinVoiceDM(parseInt(convId, 10), user.display_name || user.username);
          } catch (err) {
            notify.error(err?.message || 'Failed to start call');
          }
        },
      });
      items.push({
        label: t('chat.addNote') || 'Add Note',
        icon: Icons.note,
        description: t('chat.addNoteOnlyYou') || 'Only visible to you',
        onClick: () => onOpenNoteModal?.(user),
      });
      items.push({ separator: true });

      items.push({
        custom: <ContextMenuVoiceControls userId={user.id} />,
        keepOpen: true,
      });
      items.push({ separator: true });

      const inviteSubmenu = inviteTeams
        .filter((srv) => srv?.id != null)
        .map((srv) => ({
          label: srv.name || `Server ${srv.id}`,
          onClick: () => handleInviteToServer(srv),
        }));
      if (inviteSubmenu.length > 0) {
        items.push({
          label: t('invite.inviteToServer') || 'Invite to Server',
          icon: Icons.invite,
          submenu: inviteSubmenu,
        });
      }

      const isFriend = friendIds.has(user.id);
      if (!isFriend) {
        items.push({
          label: t('friends.addFriend') || 'Add Friend',
          icon: Icons.invite,
          onClick: async () => {
            const username = user.username || user.display_name;
            if (!username) {
              notify.error(t('friends.addFriendError') || 'Cannot add friend');
              return;
            }
            try {
              await friendsApi.sendRequest(username);
              invalidateCache('/friends');
              emitFriendsChanged();
              notify.success(
                (t('friends.requestSent') || 'Friend request sent to {name}').replace('{name}', username)
              );
            } catch (err) {
              notify.error(err.message);
            }
          },
        });
      }

      items.push({ separator: true });
      items.push({
        label: t('friends.block') || 'Block',
        icon: Icons.delete,
        onClick: async () => {
          try {
            await friendsApi.block(user.id);
            invalidateCache('/friends');
            emitFriendsChanged();
            notify.success(t('friends.blocked') || 'Blocked');
          } catch (err) {
            notify.error(err.message);
          }
        },
        danger: true,
      });

      if (canManage && teamId) {
        const memberRoleIds = memberRolesMap[user.id] || user.roles || [];
        const assignableRoles = (roles || []).filter((r) => !r.is_default);
        if (assignableRoles.length > 0) {
          items.push({ separator: true });
          items.push({
            label: t('server.roles') || 'Roles',
            submenu: assignableRoles.map((role) => {
              const checked = memberRoleIds.some((id) => String(id) === String(role.id));
              return {
                label: role.name,
                checked,
                onClick: () => toggleMemberRole(role.id),
                keepOpen: true,
              };
            }),
          });
        }
      }
    }

    if (developerMode) {
      items.push({ separator: true });
      if (channelId) {
        items.push({
          label: t('common.copyChannelId') || 'Copy Channel ID',
          icon: Icons.copy,
          onClick: () => {
            navigator.clipboard?.writeText(String(channelId));
            notify.success(t('common.copied') || 'Copied!');
          },
        });
      }
      items.push({
        label: t('common.copyUserId') || 'Copy User ID',
        icon: Icons.copy,
        onClick: () => {
          navigator.clipboard?.writeText(String(user.id));
          notify.success(t('common.copied') || 'Copied!');
        },
      });
    }

    return items;
  }, [
    user,
    isOwn,
    teamId,
    channelId,
    roles,
    memberRolesMap,
    canManage,
    friendIds,
    inviteTeams,
    developerMode,
    onOpenProfileDetail,
    onOpenNoteModal,
    handleInviteToServer,
    toggleMemberRole,
    joinVoiceDM,
    navigate,
    notify,
    t,
    emitFriendsChanged,
  ]);

  return useMemo(
    () => buildItems(),
    [buildItems, streamVolumeByUserId]
  );
}
