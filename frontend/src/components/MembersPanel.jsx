import React, { useState, useMemo, useRef, useEffect, memo, useCallback } from 'react';
import { useOnlineUsers } from '../context/SocketContext';
import { useLanguage } from '../context/LanguageContext';
import { usePrefetchOnHover } from '../context/PrefetchContext';
import ClickableAvatar from './ClickableAvatar';
import ProfileCard from './ProfileCard';
import './MembersPanel.css';

const MEMBERS_PANEL_WIDTH_KEY = 'slide_members_panel_width';
const MIN_WIDTH = 160;
const MAX_WIDTH = 400;
const DEFAULT_WIDTH = 240;

function getStoredWidth() {
  try {
    const v = localStorage.getItem(MEMBERS_PANEL_WIDTH_KEY);
    if (v) {
      const n = parseInt(v, 10);
      if (!isNaN(n) && n >= MIN_WIDTH && n <= MAX_WIDTH) return n;
    }
  } catch (_) {}
  return DEFAULT_WIDTH;
}

function setStoredWidth(w) {
  try {
    localStorage.setItem(MEMBERS_PANEL_WIDTH_KEY, String(w));
  } catch (_) {}
}

const MemberItem = memo(function MemberItem({ member, isOnline, roleColor, channelId, teamId, serverRoleBadges, serverTeamRole }) {
  const [showProfile, setShowProfile] = useState(false);
  const [clickPos, setClickPos] = useState(null);
  const memberRowRef = useRef(null);
  const { onMouseEnter, onMouseLeave } = usePrefetchOnHover();

  const handleContextMenu = (e) => {
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
  };

  const handleNameClick = (e) => {
    e.stopPropagation();
    setClickPos({ x: e.clientX, y: e.clientY });
    setShowProfile(true);
  };

  return (
    <>
      <div
        ref={memberRowRef}
        className={`mp-member ${isOnline ? '' : 'offline'}`}
        onClick={handleNameClick}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => onMouseEnter(member?.id, member)}
        onMouseLeave={onMouseLeave}
      >
        <div className="mp-member-avatar">
          <ClickableAvatar
            user={member}
            size="medium"
            showPresence
            position="right"
            contextMenuContext={{ channelId, teamId }}
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
      <ProfileCard
        userId={member?.id}
        user={member}
        isOpen={showProfile}
        onClose={() => setShowProfile(false)}
        clickPos={clickPos}
        position="left"
        serverRoleBadges={serverRoleBadges}
        serverTeamRole={serverTeamRole}
      />
    </>
  );
});

export default function MembersPanel({ teamId, channelId, members, roles, memberRolesMap, currentUserId, isOwner, canManage, onManageRoles, onKick, onBan }) {
  const { isUserOnline } = useOnlineUsers();
  const { t } = useLanguage();

  const [width, setWidth] = useState(getStoredWidth);
  const widthRef = useRef(width);
  widthRef.current = width;

  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = widthRef.current;
    const onMove = (ev) => {
      const delta = startX - ev.clientX;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startW + delta));
      setWidth(next);
      setStoredWidth(next);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

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
    <aside className="members-panel" style={{ width: width, minWidth: width }}>
      <div className="mp-resize-handle" onMouseDown={handleResizeStart} title={t('members.resizeMembersList') || 'Redimensionner la liste des membres'} aria-label={t('members.resizeMembersList') || 'Redimensionner la liste des membres'} />
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
                />
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
