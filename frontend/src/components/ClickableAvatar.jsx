import React, { useState, useCallback, useRef, useMemo, memo } from 'react';
import Avatar from './Avatar';
import { usePrefetchOnHover } from '../context/PrefetchContext';
import { useSettings } from '../context/SettingsContext';
import ProfileCard from './ProfileCard';
import ContextMenu, { Icons } from './ContextMenu';
import AddNoteModal from './AddNoteModal';
import FriendNicknameModal from './FriendNicknameModal';
import { useUserContextMenuItems } from '../hooks/useUserContextMenuItems';
import './ClickableAvatar.css';

const ClickableAvatar = memo(function ClickableAvatar({
  user,
  size = 'medium',
  className = '',
  showPresence = false,
  position = 'right',
  disabled = false,
  onClick,
  contextMenuItems = [],
  contextMenuContext = {},
  gifAnimate,
  serverRoleBadges = null,
  serverTeamRole = null,
}) {
  const [showProfile, setShowProfile] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [nicknameModalUser, setNicknameModalUser] = useState(null);
  const [noteModalUser, setNoteModalUser] = useState(null);
  const avatarRef = useRef(null);
  const { developerMode } = useSettings();

  const handleContextMenuClose = useCallback(() => setContextMenu(null), []);

  const mergedContext = useMemo(() => ({
    ...contextMenuContext,
    onOpenNoteModal: contextMenuContext.onOpenNoteModal ?? ((u) => {
      setNoteModalUser(u);
      handleContextMenuClose();
    }),
    onOpenNicknameModal: contextMenuContext.onOpenNicknameModal ?? ((u) => {
      setNicknameModalUser(u);
      handleContextMenuClose();
    }),
  }), [contextMenuContext, handleContextMenuClose]);

  const getFullContextMenuItems = useUserContextMenuItems(user, mergedContext);

  const handleClick = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    if (onClick) { onClick(e); return; }
    setShowProfile(true);
  }, [disabled, onClick]);

  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    if (onClick) return;
    if (!user?.id) return;
    const viewProfileItem = {
      label: 'View Profile',
      icon: Icons.profile,
      onClick: () => setShowProfile(true)
    };
    let items;
    if (contextMenuItems.length > 0 && Object.keys(contextMenuContext).length === 0) {
      const base = [viewProfileItem, { separator: true }, ...contextMenuItems];
      if (developerMode) {
        const copyIdItem = {
          label: 'Copy User ID',
          icon: null,
          onClick: () => navigator.clipboard.writeText(String(user.id))
        };
        base.push({ separator: true }, copyIdItem);
      }
      items = base;
    } else {
      const fullItems = getFullContextMenuItems?.() || [];
      items = [viewProfileItem, { separator: true }, ...fullItems];
    }
    setContextMenu({ x: e.clientX, y: e.clientY, items });
  }, [disabled, onClick, contextMenuItems, contextMenuContext, getFullContextMenuItems, user?.id, developerMode]);

  const handleClose = useCallback(() => {
    setShowProfile(false);
  }, []);

  const { onMouseEnter, onMouseLeave } = usePrefetchOnHover();

  return (
    <>
      <div 
        ref={avatarRef}
        className={`clickable-avatar ${disabled ? 'disabled' : ''}`}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => onMouseEnter(user?.id, user)}
        onMouseLeave={onMouseLeave}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleClick(e);
          }
        }}
      >
        <Avatar 
          user={user} 
          size={size} 
          className={className} 
          showPresence={showPresence} 
          gifAnimate={gifAnimate}
        />
      </div>
      <ProfileCard
        userId={user?.id}
        user={user}
        isOpen={showProfile}
        onClose={handleClose}
        anchorEl={avatarRef.current}
        position={position}
        serverRoleBadges={serverRoleBadges}
        serverTeamRole={serverTeamRole}
      />
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={handleContextMenuClose}
        />
      )}
      <AddNoteModal
        isOpen={!!noteModalUser}
        onClose={() => setNoteModalUser(null)}
        user={noteModalUser}
      />
      <FriendNicknameModal
        isOpen={!!nicknameModalUser}
        onClose={() => setNicknameModalUser(null)}
        user={nicknameModalUser}
      />
    </>
  );
});

export default ClickableAvatar;
