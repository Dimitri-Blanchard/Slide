import React, { useState, useMemo, useRef, memo, useCallback } from 'react';
import { useOnlineUsers } from '../context/SocketContext';
import { usePrefetchOnHover } from '../context/PrefetchContext';
import ClickableAvatar from './ClickableAvatar';
import { useCompactTouchUi } from '../hooks/useCompactTouchUi';
import { useLongPress } from '../hooks/useLongPress';
import { useRightPanelWidth } from '../hooks/useRightPanelWidth';
import { hapticImpact } from '../utils/nativeHaptics';
import './MembersPanel.css';

const MemberItem = memo(function MemberItem({ member, isOnline, roleColor, channelId, teamId, serverRoleBadges, serverTeamRole, canManage, isOwner, roles, memberRolesMap, onKick, onBan, voiceChannelId, onRolesChanged }) {
  const memberRowRef = useRef(null);
  const { onMouseEnter, onMouseLeave } = usePrefetchOnHover();
  const compactTouchUi = useCompactTouchUi();

  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
    const avatarEl = memberRowRef.current?.querySelector('.clickable-avatar');
    if (!avatarEl) return;
    avatarEl.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 2,
      buttons: 2,
      clientX: e.clientX,
      clientY: e.clientY,
    }));
  }, []);

  const { longPressProps, shouldSkipClick } = useLongPress(
    useCallback((e) => {
      hapticImpact('Medium');
      handleContextMenu(e);
    }, [handleContextMenu]),
    { disabled: !compactTouchUi },
  );

  const handleRowClick = (e) => {
    e.stopPropagation();
    if (shouldSkipClick()) return;
    // Single ProfileCard lives inside ClickableAvatar; opening from the row must use that
    // instance only — otherwise context menu "View Profile" + click-through opens two cards.
    const avatarEl = memberRowRef.current?.querySelector('.clickable-avatar');
    avatarEl?.click();
  };

  return (
    <>
      <div
        ref={memberRowRef}
        className={`mp-member ${isOnline ? '' : 'offline'}`}
        onClick={handleRowClick}
        onContextMenu={compactTouchUi ? longPressProps.onContextMenu : handleContextMenu}
        onPointerDown={compactTouchUi ? longPressProps.onPointerDown : undefined}
        onPointerMove={compactTouchUi ? longPressProps.onPointerMove : undefined}
        onPointerUp={compactTouchUi ? longPressProps.onPointerUp : undefined}
        onPointerCancel={compactTouchUi ? longPressProps.onPointerCancel : undefined}
        onMouseEnter={() => onMouseEnter(member?.id, member)}
        onMouseLeave={onMouseLeave}
      >
        <div className="mp-member-avatar">
          <ClickableAvatar
            user={member}
            size="medium"
            showPresence
            position="right"
            contextMenuContext={{
              channelId,
              teamId,
              useServerMenu: true,
              canManage,
              isOwner,
              roles,
              memberRolesMap,
              voiceChannelId,
              onKick: onKick ? () => onKick(member) : undefined,
              onBan: onBan ? () => onBan(member) : undefined,
              targetTeamRole: member.role,
              onRolesChanged,
              onOpenProfileDetail: () => {
                const avatarEl = memberRowRef.current?.querySelector('.clickable-avatar');
                avatarEl?.click();
              },
            }}
            serverRoleBadges={serverRoleBadges}
            serverTeamRole={serverTeamRole}
          />
        </div>
        <div className="mp-member-info">
          <span
            className="mp-member-name"
            style={roleColor ? { color: roleColor } : undefined}
          >
            {member.display_name}
          </span>
          {member.status_message && (
            <span className="mp-member-status">{member.status_message}</span>
          )}
        </div>
        {member.role === 'owner' && (
          <svg className="mp-crown" width="14" height="14" viewBox="0 0 24 24" fill="#f0b232" title="Server Owner">
            <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5z"/>
          </svg>
        )}
      </div>
    </>
  );
});

export default function MembersPanel({ teamId, channelId, members, roles, memberRolesMap, currentUserId, isOwner, canManage, onManageRoles, onKick, onBan, voiceChannelId = null, onRolesChanged }) {
  const { isUserOnline } = useOnlineUsers();

  const { width, handleResizeStart } = useRightPanelWidth();

  const groupedMembers = useMemo(() => {
    if (!members || members.length === 0) return { online: [], offline: [], roleGroups: [] };

    const sortedRoles = [...(roles || [])].filter(r => r.show_separately).sort((a, b) => (a.position || 0) - (b.position || 0));

    const online = [];
    const offline = [];
    const roleGroupsMap = new Map();

    sortedRoles.forEach(role => {
      roleGroupsMap.set(role.id, { role, members: [] });
    });

    const assignedToGroup = new Set();

    members.forEach(member => {
      const memberRoles = memberRolesMap?.[member.id] || member.roles || [];
      const isOnline = isUserOnline(member.id);

      for (const role of sortedRoles) {
        if (memberRoles.includes(role.id)) {
          const group = roleGroupsMap.get(role.id);
          if (group) {
            group.members.push({ ...member, _online: isOnline, _roleColor: role.color });
            assignedToGroup.add(member.id);
          }
          break;
        }
      }

      if (!assignedToGroup.has(member.id)) {
        if (isOnline) {
          online.push(member);
        } else {
          offline.push(member);
        }
      }
    });

    const roleGroups = [];
    for (const [, group] of roleGroupsMap) {
      if (group.members.length > 0) {
        roleGroups.push(group);
      }
    }

    return { online, offline, roleGroups };
  }, [members, roles, memberRolesMap, isUserOnline]);

  return (
    <aside className="members-panel" style={{ width, minWidth: width }}>
      <div className="mp-resize-edge" onMouseDown={handleResizeStart} aria-hidden="true" />
      <div className="mp-scroll">
        {/* Role groups displayed separately */}
        {groupedMembers.roleGroups.map(group => (
          <div key={group.role.id} className="mp-group">
            <h3 className="mp-group-title" style={group.role.color ? { color: group.role.color } : undefined}>
              {group.role.name} — {group.members.length}
            </h3>
            {group.members.map(member => {
              const memberRoleIds = memberRolesMap?.[member.id] || member.roles || [];
              const serverRoleBadges = (roles || []).filter(r => memberRoleIds.includes(r.id)).map(r => ({ name: r.name, color: r.color }));
              return (
                <MemberItem
                  key={member.id}
                  member={member}
                  isOnline={member._online}
                  roleColor={member._roleColor}
                  channelId={channelId}
                  teamId={teamId}
                  serverRoleBadges={serverRoleBadges}
                  serverTeamRole={member.role}
                  canManage={canManage}
                  isOwner={isOwner}
                  roles={roles}
                  memberRolesMap={memberRolesMap}
                  onKick={onKick}
                  onBan={onBan}
                  voiceChannelId={voiceChannelId}
                  onRolesChanged={onRolesChanged}
                />
              );
            })}
          </div>
        ))}

        {/* Online members (not in a displayed role group) */}
        {groupedMembers.online.length > 0 && (
          <div className="mp-group">
            <h3 className="mp-group-title">
              Online — {groupedMembers.online.length}
            </h3>
            {groupedMembers.online.map(member => {
              const memberRoleIds = memberRolesMap?.[member.id] || member.roles || [];
              const serverRoleBadges = (roles || []).filter(r => memberRoleIds.includes(r.id)).map(r => ({ name: r.name, color: r.color }));
              return (
                <MemberItem
                  key={member.id}
                  member={member}
                  isOnline={true}
                  channelId={channelId}
                  teamId={teamId}
                  serverRoleBadges={serverRoleBadges}
                  serverTeamRole={member.role}
                  canManage={canManage}
                  isOwner={isOwner}
                  roles={roles}
                  memberRolesMap={memberRolesMap}
                  onKick={onKick}
                  onBan={onBan}
                  voiceChannelId={voiceChannelId}
                  onRolesChanged={onRolesChanged}
                />
              );
            })}
          </div>
        )}

        {/* Offline members */}
        {groupedMembers.offline.length > 0 && (
          <div className="mp-group">
            <h3 className="mp-group-title">
              Offline — {groupedMembers.offline.length}
            </h3>
            {groupedMembers.offline.map(member => {
              const memberRoleIds = memberRolesMap?.[member.id] || member.roles || [];
              const serverRoleBadges = (roles || []).filter(r => memberRoleIds.includes(r.id)).map(r => ({ name: r.name, color: r.color }));
              return (
                <MemberItem
                  key={member.id}
                  member={member}
                  isOnline={false}
                  channelId={channelId}
                  teamId={teamId}
                  serverRoleBadges={serverRoleBadges}
                  serverTeamRole={member.role}
                  canManage={canManage}
                  isOwner={isOwner}
                  roles={roles}
                  memberRolesMap={memberRolesMap}
                  onKick={onKick}
                  onBan={onBan}
                  voiceChannelId={voiceChannelId}
                  onRolesChanged={onRolesChanged}
                />
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
