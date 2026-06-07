import React, { useCallback, useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  friends as friendsApi,
  direct as directApi,
  teams as teamsApi,
  servers,
} from '../api';
import { useAuth } from '../context/AuthContext';
import { useVoice } from '../context/VoiceContext';
import { useNotification } from '../context/NotificationContext';
import { useLanguage } from '../context/LanguageContext';
import { useSettings } from '../context/SettingsContext';
import { Icons } from '../components/ContextMenu';
import useFriendsSync from './useFriendsSync';
import { notifyFriendsChanged, isFriendRequestDuplicateError } from '../utils/friendsSync';
import { ContextMenuVoiceControls } from '../components/ContextMenuVoiceControls';

export function useVoiceSidebarUserContextMenu(user, context = {}) {
  const {
    teamId,
    channelId,
    roles = [],
    memberRolesMap = {},
    canManage = false,
    isOwner = false,
    voiceChannelId = null,
    onKick,
    onBan,
    targetTeamRole = null,
    onOpenProfileDetail,
    onOpenNoteModal,
    onRolesChanged,
  } = context;

  const { user: currentUser } = useAuth();
  const { joinVoiceDM, streamVolumeByUserId, moderateVoiceUser, voiceUsers } = useVoice();
  const { notify } = useNotification();
  const { t } = useLanguage();
  const { developerMode } = useSettings();
  const navigate = useNavigate();

  const [inviteTeams, setInviteTeams] = useState([]);
  const { isFriend } = useFriendsSync();

  const isOwn = currentUser?.id != null && user?.id != null && String(currentUser.id) === String(user.id);

  useEffect(() => {
    if (!user?.id || isOwn) return;
    teamsApi.list()
      .then((list) => setInviteTeams(Array.isArray(list) ? list : []))
      .catch(() => setInviteTeams([]));
  }, [user?.id, isOwn]);

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

  const resolveVoiceChannelId = useCallback(() => {
    if (voiceChannelId) return voiceChannelId;
    if (!teamId || !user?.id) return null;
    for (const [chId, users] of Object.entries(voiceUsers || {})) {
      if ((users || []).some((u) => String(u.id) === String(user.id))) return chId;
    }
    return null;
  }, [voiceChannelId, teamId, user?.id, voiceUsers]);

  const runVoiceModeration = useCallback((action, durationMinutes) => {
    const chId = resolveVoiceChannelId();
    if (!teamId || !chId || !user?.id) {
      notify.error(t('server.voiceModerationNotInChannel') || 'Member is not in a voice channel');
      return;
    }
    moderateVoiceUser(teamId, chId, user.id, action, durationMinutes);
    const labels = {
      kick: t('server.voiceKickDone') || 'Disconnected from voice',
      server_mute: t('server.voiceServerMuteDone') || 'Server muted',
      server_unmute: t('server.voiceServerUnmuteDone') || 'Server unmuted',
      server_deafen: t('server.voiceServerDeafenDone') || 'Server deafened',
      server_undeafen: t('server.voiceServerUndeafenDone') || 'Server undeafened',
      temp_mute: t('server.voiceTempMuteDone') || 'Temporarily muted',
    };
    notify.success(labels[action] || 'Done');
  }, [resolveVoiceChannelId, teamId, user?.id, moderateVoiceUser, notify, t]);

  const buildItems = useCallback(() => {
    if (!user?.id) return [];

    const memberTeamRole = targetTeamRole || user.role || user.team_role;
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

      if (!isFriend(user.id)) {
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
              notifyFriendsChanged({ action: 'request_sent' });
              notify.success(
                (t('friends.requestSent') || 'Friend request sent to {name}').replace('{name}', username)
              );
            } catch (err) {
              if (isFriendRequestDuplicateError(err.message)) {
                notifyFriendsChanged();
              }
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
            notifyFriendsChanged({ userId: user.id, action: 'blocked' });
            notify.success(t('friends.blocked') || 'Blocked');
          } catch (err) {
            notify.error(err.message);
          }
        },
        danger: true,
      });

      if (canManage && teamId && memberTeamRole !== 'owner') {
        items.push({ separator: true });
        items.push({
          label: t('server.moderation') || 'Moderation',
          icon: Icons.profile,
          submenu: [
            {
              label: t('server.kickFromVoice') || 'Disconnect from voice',
              onClick: () => runVoiceModeration('kick'),
            },
            {
              label: t('server.serverMute') || 'Server mute',
              onClick: () => runVoiceModeration('server_mute'),
            },
            {
              label: t('server.serverUnmute') || 'Remove server mute',
              onClick: () => runVoiceModeration('server_unmute'),
            },
            {
              label: t('server.serverDeafen') || 'Server deafen',
              onClick: () => runVoiceModeration('server_deafen'),
            },
            {
              label: t('server.serverUndeafen') || 'Remove server deafen',
              onClick: () => runVoiceModeration('server_undeafen'),
            },
            {
              label: t('server.tempMute') || 'Timeout (temp mute)',
              submenu: [
                { label: '1 min', onClick: () => runVoiceModeration('temp_mute', 1) },
                { label: '5 min', onClick: () => runVoiceModeration('temp_mute', 5) },
                { label: '10 min', onClick: () => runVoiceModeration('temp_mute', 10) },
                { label: '1 h', onClick: () => runVoiceModeration('temp_mute', 60) },
              ],
            },
            ...(onKick ? [{
              label: t('team.remove') || 'Kick from server',
              danger: true,
              onClick: () => onKick(user),
            }] : []),
            ...(onBan ? [{
              label: t('admin.banUser') || 'Ban',
              danger: true,
              onClick: () => onBan(user),
            }] : []),
          ],
        });

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
    isOwner,
    voiceChannelId,
    onKick,
    onBan,
    targetTeamRole,
    voiceUsers,
    runVoiceModeration,
    moderateVoiceUser,
    isFriend,
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
  ]);

  return useMemo(
    () => buildItems(),
    [buildItems, streamVolumeByUserId]
  );
}
