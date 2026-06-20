import React, { useState, useCallback, memo, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { channels as channelsApi, servers } from '../api';
import { useLanguage } from '../context/LanguageContext';
import { useNotification } from '../context/NotificationContext';
import { useVoice, sameUserId, coercePositiveInt, getRemoteStreamForUser } from '../context/VoiceContext';
import { useModalEnterAnimation } from '../hooks/useModalEnterAnimation';
import { useCompactTouchUi } from '../hooks/useCompactTouchUi';
import { useLongPress } from '../hooks/useLongPress';
import { useAuth } from '../context/AuthContext';
import { hapticImpact } from '../utils/nativeHaptics';
import { serverChannelPath, channelSettingsPath } from '../utils/appRoutes';
import ConfirmModal from './ConfirmModal';
import ClickableAvatar from './ClickableAvatar';
import ChannelSettings from './ChannelSettings';
import ContextMenu from './ContextMenu';
import ProfileCard from './ProfileCard';
import UserDetailModal from './UserDetailModal';
import AddNoteModal from './AddNoteModal';
import { useVoiceSidebarUserContextMenu } from '../hooks/useVoiceSidebarUserContextMenu';
import AppIcon from './icons/AppIcon';
import ServerMobileMenuSheet from './ServerMobileMenuSheet';
import MobileSidebarUserBar from './MobileSidebarUserBar';
import ServerBanner from './ServerBanner';
import './ChannelList.css';

const MobileChannelToolbar = memo(function MobileChannelToolbar({ onOpenSearch, onInvite }) {
  const { t } = useLanguage();
  return (
    <div className="mobile-channel-toolbar">
      <button type="button" className="mobile-channel-search" onClick={onOpenSearch}>
        <AppIcon name="search" size={18} />
        <span>{t('common.search') === 'common.search' ? 'Search' : t('common.search')}</span>
      </button>
      <button type="button" className="mobile-channel-tool-btn" onClick={onInvite} aria-label="Invite">
        <AppIcon name="userPlus" size={20} />
      </button>
      <button type="button" className="mobile-channel-tool-btn" aria-label="Events">
        <AppIcon name="compass" size={20} />
      </button>
    </div>
  );
});

const MobileBoostGoal = memo(function MobileBoostGoal({ team }) {
  const current = team?.boost_level || 0;
  const goal = 33;
  return (
    <button type="button" className="mobile-boost-goal">
      <span className="mobile-boost-goal-label">Boost Goal</span>
      <span className="mobile-boost-goal-meta">
        <span className="mobile-boost-goal-count">{current}/{goal} Boosts</span>
        <AppIcon name="caretDown" size={14} className="mobile-boost-chevron" />
      </span>
    </button>
  );
});

const channelIcons = {
  text: <AppIcon name="channelText" size={18} />,
  voice: <AppIcon name="channelVoice" size={18} />,
  announcement: <AppIcon name="channelAnnouncement" size={18} />,
  stage: <AppIcon name="check" size={18} />,
  forum: <AppIcon name="channelForum" size={18} />,
};

const ServerHeader = memo(function ServerHeader({ team, onOpenSettings, onInvite, onCreateChannel, onCreateCategory, onLeave, isMobile = false, canOpenServerSettings = false }) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const compactTouch = useCompactTouchUi();
  const { t } = useLanguage();

  useEffect(() => {
    if (!dropdownOpen || compactTouch) return;
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [dropdownOpen, compactTouch]);

  if (!team) return null;

  return (
    <div className="server-header" ref={dropdownRef}>
      <button className={`server-header-btn ${dropdownOpen ? 'open' : ''}`} onClick={() => setDropdownOpen(!dropdownOpen)}>
        <span className="server-header-name">{team.name}</span>
        {team?.boost_level > 0 && (
          <span className="boost-badge" title={`Server Boost Level ${team.boost_level}`}>
            <AppIcon name="nitro" size={10} />
            Level {team.boost_level}
          </span>
        )}
        {dropdownOpen ? (
          <AppIcon name="close" size={18} className="server-header-chevron" weight="bold" />
        ) : isMobile ? (
          <AppIcon name="caretDown" size={16} className="server-header-chevron server-header-chevron--right" weight="bold" />
        ) : (
          <AppIcon name="caretDown" size={18} className="server-header-chevron" weight="bold" />
        )}
      </button>
      {dropdownOpen && compactTouch ? (
        <ServerMobileMenuSheet
          team={team}
          onClose={() => setDropdownOpen(false)}
          onInvite={onInvite}
          onOpenSettings={onOpenSettings}
          canOpenServerSettings={canOpenServerSettings}
          onCreateChannel={onCreateChannel}
          onCreateCategory={onCreateCategory}
          onLeave={onLeave}
        />
      ) : dropdownOpen ? (
        <div className="server-dropdown">
          <button className="server-dropdown-item accent" onClick={() => { onInvite?.(); setDropdownOpen(false); }}>
            <AppIcon name="userPlus" size={18} />
            <span>{t('server.invitePeople') || 'Invite People'}</span>
          </button>
          <div className="server-dropdown-separator" />
          {canOpenServerSettings && (
            <button className="server-dropdown-item" onClick={() => { onOpenSettings?.(); setDropdownOpen(false); }}>
              <AppIcon name="settings" size={18} />
              <span>{t('server.settings') || 'Server Settings'}</span>
            </button>
          )}
          <button className="server-dropdown-item" onClick={() => { onCreateChannel?.(); setDropdownOpen(false); }}>
            <AppIcon name="plus" size={18} weight="bold" />
            <span>{t('server.createChannel') || 'Create Channel'}</span>
          </button>
          <button className="server-dropdown-item" onClick={() => { onCreateCategory?.(); setDropdownOpen(false); }}>
            <AppIcon name="archive" size={18} />
            <span>{t('server.createCategory') || 'Create Category'}</span>
          </button>
          {team?.role !== 'owner' && (<>
          <div className="server-dropdown-separator" />
          <button className="server-dropdown-item danger" onClick={() => { onLeave?.(); setDropdownOpen(false); }}>
            <AppIcon name="signOut" size={18} />
            <span>{t('server.leave') || 'Leave Server'}</span>
          </button>
          </>)}
        </div>
      ) : null}
    </div>
  );
});

// ═══════════════════════════════════════════════════════════
// CHANNEL CONTEXT MENU
// ═══════════════════════════════════════════════════════════
const MUTE_DURATIONS = [
  { label: 'For 15 Minutes', ms: 15 * 60 * 1000, key: '15m' },
  { label: 'For 1 Hour', ms: 60 * 60 * 1000, key: '1h' },
  { label: 'For 3 Hours', ms: 3 * 60 * 60 * 1000, key: '3h' },
  { label: 'For 8 Hours', ms: 8 * 60 * 60 * 1000, key: '8h' },
  { label: 'For 24 Hours', ms: 24 * 60 * 60 * 1000, key: '24h' },
];

const checkIcon = <AppIcon name="check" size={16} />;

const bellIcon = <AppIcon name="bell" size={16} />;
const bellMutedIcon = <AppIcon name="bellOff" size={16} />;

const ChannelContextMenu = memo(function ChannelContextMenu({ x, y, channel, team, teamId, onClose, canManage, onEdit, onDelete, onCopyId, isMuted, muteKey, onMute, onUnmute }) {
  const { t } = useLanguage();
  const items = [];

  items.push(
    {
      label: 'Copy Link',
      icon: <AppIcon name="link" size={16} />,
      onClick: () => {
        const link = `${window.location.origin}${serverChannelPath(team || { id: teamId }, channel)}`;
        navigator.clipboard?.writeText(link).then(() => {}, () => {});
      },
    },
    {
      label: 'Copy Channel ID',
      icon: <AppIcon name="copy" size={16} />,
      onClick: () => onCopyId?.(channel.id),
    },
    { separator: true },
  );

  const muteSubmenu = [];
  if (isMuted) {
    muteSubmenu.push(
      { label: 'Unmute', icon: bellIcon, onClick: () => onUnmute?.(channel.id) },
      { separator: true },
    );
  }
  MUTE_DURATIONS.forEach(d => {
    muteSubmenu.push({
      label: d.label,
      icon: muteKey === d.key ? checkIcon : undefined,
      onClick: () => onMute?.(channel.id, d.ms, d.key),
    });
  });
  muteSubmenu.push(
    { separator: true },
    {
      label: 'Until I turn it back on',
      icon: muteKey === 'indefinite' ? checkIcon : undefined,
      onClick: () => onMute?.(channel.id, null, 'indefinite'),
    },
  );

  items.push({
    label: isMuted ? 'Muted' : 'Mute Channel',
    icon: isMuted ? bellMutedIcon : bellMutedIcon,
    submenu: muteSubmenu,
  });

  items.push(
    {
      label: 'Notification Settings',
      icon: bellIcon,
      submenu: [
        { label: 'All Messages', description: 'White dot + badges' },
        { label: 'Only @mentions', description: '@everyone, @user, @here, @role — badges only' },
        { label: 'Nothing' },
      ],
    },
  );

  if (canManage) {
    items.push(
      { separator: true },
      {
        label: t('channelSettings.menuLabel'),
        description: t('channelSettings.menuDesc'),
        icon: <AppIcon name="settings" size={16} />,
        onClick: () => {
          onClose?.();
          onEdit?.(channel);
        },
      },
      { separator: true },
      {
        label: 'Delete Channel',
        danger: true,
        icon: <AppIcon name="delete" size={16} />,
        onClick: () => onDelete?.(channel),
      }
    );
  }

  return <ContextMenu x={x} y={y} items={items} onClose={onClose} />;
});

// ═══════════════════════════════════════════════════════════
// CATEGORY CONTEXT MENU
// ═══════════════════════════════════════════════════════════
const CategoryContextMenu = memo(function CategoryContextMenu({ x, y, category, onClose, onEdit, onDelete, onCreate }) {
  const items = [
    {
      label: 'Edit Category',
      icon: <AppIcon name="edit" size={16} />,
      onClick: () => onEdit?.(category),
    },
    {
      label: 'Create Channel',
      icon: <AppIcon name="plus" size={16} weight="bold" />,
      onClick: () => onCreate?.(category?.id),
    },
    { separator: true },
    {
      label: 'Delete Category',
      danger: true,
      icon: <AppIcon name="delete" size={16} />,
      onClick: () => onDelete?.(category),
    },
  ];
  return <ContextMenu x={x} y={y} items={items} onClose={onClose} />;
});

// ═══════════════════════════════════════════════════════════
// CATEGORY
// ═══════════════════════════════════════════════════════════
const Category = memo(function Category({
  category, channels, team, teamId, currentChannelId,
  onCreateChannel, onEditCategory, onDeleteCategory, canManage,
  unreadChannels, onEditChannel, onDeleteChannel, onCopyChannelId,
  isChannelMuted, getChannelMuteKey, onMuteChannel, onUnmuteChannel,
  onChannelMove, dragOverCategoryId, setDragOverCategoryId,
  isMobile, onActiveChannelClick, onVoiceJoinRequest, roles, memberRolesMap, onRolesChanged,
  isOwner = false, onKick, onBan,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [ctxMenu, setCtxMenu] = useState(null);
  const [dropIndicatorTop, setDropIndicatorTop] = useState(null);
  const [dropIndicatorPosition, setDropIndicatorPosition] = useState(null);
  const listRef = useRef(null);
  const targetCategoryId = category?.id ?? null;
  const { voiceChannelId } = useVoice();
  const compactTouchUi = useCompactTouchUi();

  const openCategoryMenu = useCallback((clientX, clientY) => {
    if (!canManage || !category) return;
    setCtxMenu({ x: clientX, y: clientY });
  }, [canManage, category]);

  const handleContextMenu = (e) => {
    e.preventDefault();
    openCategoryMenu(e.clientX, e.clientY);
  };

  const { longPressProps } = useLongPress(
    useCallback((e) => {
      hapticImpact('Medium');
      openCategoryMenu(e.clientX, e.clientY);
    }, [openCategoryMenu]),
    { disabled: !compactTouchUi || !canManage },
  );

  const categoryChannels = useMemo(() => {
    const filtered = (channels || []).filter(c =>
      c && c.id != null && (category ? c.category_id === category.id : !c.category_id)
    );
    return [...filtered].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  }, [channels, category]);

  /** When collapsed, still show channels the user is "in" (selected text, or connected voice). */
  const channelsToRender = useMemo(() => {
    if (!collapsed) return categoryChannels;
    return categoryChannels.filter((ch) => {
      if (ch.channel_type === 'voice') {
        return voiceChannelId != null && String(voiceChannelId) === String(ch.id);
      }
      return currentChannelId === String(ch.id);
    });
  }, [collapsed, categoryChannels, currentChannelId, voiceChannelId]);

  const listFullyCollapsed = collapsed && channelsToRender.length === 0;

  const handleDragOver = (e) => {
    if (!canManage) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverCategoryId?.(targetCategoryId);
    if (e.target === listRef.current) {
      setDropIndicatorTop(null);
    }
  };

  const handleCategoryHeaderDragOver = (e) => {
    if (!canManage) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverCategoryId?.(targetCategoryId);
    setDropIndicatorPosition(categoryChannels.length);
    setDropIndicatorTop(null);
  };

  const handleDragLeave = (e) => {
    if (e.relatedTarget != null && !e.currentTarget.contains(e.relatedTarget)) {
      setDragOverCategoryId?.(null);
      setDropIndicatorTop(null);
      setDropIndicatorPosition(null);
    }
  };

  const handleDragEnd = () => {
    setDragOverCategoryId?.(null);
    setDropIndicatorTop(null);
    setDropIndicatorPosition(null);
  };

  const handleDragOverAtPosition = (position, clientY) => {
    setDragOverCategoryId?.(targetCategoryId);
    setDropIndicatorPosition(position);
    if (position != null && clientY != null && listRef.current) {
      const listRect = listRef.current.getBoundingClientRect();
      setDropIndicatorTop(clientY - listRect.top);
    } else {
      setDropIndicatorTop(null);
    }
  };

  const handleCategoryHeaderDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverCategoryId?.(null);
    setDropIndicatorTop(null);
    setDropIndicatorPosition(null);
    if (!canManage || !onChannelMove) return;
    const data = e.dataTransfer.getData('application/x-slide-channel');
    if (!data) return;
    try {
      const { channelId } = JSON.parse(data);
      onChannelMove(channelId, targetCategoryId, categoryChannels.length);
    } catch (_) {}
  };

  const handleListDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverCategoryId?.(null);
    setDropIndicatorTop(null);
    setDropIndicatorPosition(null);
    if (!canManage || !onChannelMove) return;
    const data = e.dataTransfer.getData('application/x-slide-channel');
    if (!data) return;
    try {
      const { channelId } = JSON.parse(data);
      const pos = dropIndicatorPosition != null ? dropIndicatorPosition : categoryChannels.length;
      onChannelMove(channelId, targetCategoryId, pos);
    } catch (_) {}
  };

  const isDragOver = dragOverCategoryId === targetCategoryId;

  return (
    <div
      className={`channel-category ${isDragOver ? 'channel-category-drag-over' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <div
        className={`category-header ${isDragOver ? 'category-header-drag-over' : ''}`}
        onClick={() => setCollapsed(!collapsed)}
        onContextMenu={compactTouchUi ? longPressProps.onContextMenu : handleContextMenu}
        onPointerDown={compactTouchUi ? longPressProps.onPointerDown : undefined}
        onPointerMove={compactTouchUi ? longPressProps.onPointerMove : undefined}
        onPointerUp={compactTouchUi ? longPressProps.onPointerUp : undefined}
        onPointerCancel={compactTouchUi ? longPressProps.onPointerCancel : undefined}
        onDragOver={handleCategoryHeaderDragOver}
        onDrop={handleCategoryHeaderDrop}
      >
        <span
          className={`collapse-arrow-wrap${collapsed ? ' is-collapsed' : ''}`}
          aria-hidden
        >
          <AppIcon name="caretDown" size={14} className="collapse-arrow" weight="bold" />
        </span>
        <span className="category-name">{category?.name || 'CHANNELS'}</span>
        {canManage && (
          <button className="add-channel-btn" onClick={(e) => { e.stopPropagation(); onCreateChannel?.(category?.id); }} title="Create Channel">
            <AppIcon name="plus" size={16} weight="bold" />
          </button>
        )}
      </div>

      <ul
        ref={listRef}
        className={`channel-list channel-list-droppable${listFullyCollapsed ? ' channel-list-collapsed' : ''}`}
        onDrop={handleListDrop}
      >
        {channelsToRender.map((channel) => {
          const index = categoryChannels.findIndex((c) => String(c.id) === String(channel.id));
          return (
          <ChannelItem
            key={channel.id}
            channel={channel}
            team={team}
            teamId={teamId}
            isActive={currentChannelId === String(channel.id)}
            hasUnread={unreadChannels?.has(channel.id)}
            canManage={canManage}
            onEdit={onEditChannel}
            onDelete={onDeleteChannel}
            onCopyId={onCopyChannelId}
            isMuted={isChannelMuted?.(channel.id)}
            muteKey={getChannelMuteKey?.(channel.id)}
            onMute={onMuteChannel}
            onUnmute={onUnmuteChannel}
            onChannelMove={onChannelMove}
            onDragEnd={handleDragEnd}
            onDragOverAtPosition={handleDragOverAtPosition}
            categoryId={targetCategoryId}
            position={index >= 0 ? index : 0}
            channelCount={categoryChannels.length}
            dropIndicatorPosition={dropIndicatorPosition}
            isDragOverCategory={isDragOver}
            isMobile={isMobile}
            onActiveChannelClick={onActiveChannelClick}
            onVoiceJoinRequest={onVoiceJoinRequest}
            roles={roles}
            memberRolesMap={memberRolesMap}
            onRolesChanged={onRolesChanged}
            isOwner={isOwner}
            onKick={onKick}
            onBan={onBan}
          />
          );
        })}
        {dropIndicatorTop != null && (
          <li
            className="channel-drop-indicator channel-drop-indicator-floating"
            aria-hidden="true"
            style={{ top: `${Math.max(0, dropIndicatorTop - 5)}px` }}
          />
        )}
      </ul>

      {ctxMenu && (
        <CategoryContextMenu
          x={ctxMenu.x} y={ctxMenu.y} category={category}
          onClose={() => setCtxMenu(null)}
          onEdit={onEditCategory} onDelete={onDeleteCategory} onCreate={onCreateChannel}
        />
      )}
    </div>
  );
});

// ═══════════════════════════════════════════════════════════
// LIVE STREAM HOVER PREVIEW & FULL MODAL
// ═══════════════════════════════════════════════════════════
const LiveStreamPreviewVideo = memo(function LiveStreamPreviewVideo({ stream }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (ref.current && stream) {
      try {
        ref.current.srcObject = stream;
        ref.current.play().catch(() => {});
      } catch (e) {
        console.warn('LiveStreamPreviewVideo: failed to set srcObject', e);
      }
    }
  }, [stream]);
  return <video ref={ref} autoPlay playsInline muted className="live-preview-video" />;
});

const LiveStreamHoverPreview = memo(function LiveStreamHoverPreview({ stream, displayName, anchorRef, onMouseEnter, onClose }) {
  const [pos, setPos] = React.useState({ x: 0, y: 0 });

  React.useEffect(() => {
    if (anchorRef?.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      setPos({ x: rect.right + 8, y: rect.top });
    }
  }, [anchorRef]);

  if (!stream) return null;
  if (typeof document === 'undefined' || !document.body) return null;
  return createPortal(
    <div
      className="live-stream-hover-preview"
      style={{ left: pos.x, top: pos.y }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onClose}
    >
      <LiveStreamPreviewVideo stream={stream} />
      <span className="live-preview-name">{displayName}</span>
    </div>,
    document.body
  );
});

// ═══════════════════════════════════════════════════════════
// VOICE USER in sidebar (shown under voice channels)
// ═══════════════════════════════════════════════════════════
const VoiceUserItem = memo(function VoiceUserItem({
  voiceUser,
  isSpeaking,
  isScreenSharing,
  stream,
  onLiveClick,
  channelId,
  teamId,
  isExiting,
  roles,
  memberRolesMap,
  canManage,
  isOwner = false,
  onKick,
  onBan,
  onRolesChanged,
  serverRoleBadges,
  serverTeamRole,
}) {
  const [showHoverPreview, setShowHoverPreview] = React.useState(false);
  const [showProfile, setShowProfile] = React.useState(false);
  const [showProfileDetail, setShowProfileDetail] = React.useState(false);
  const [contextMenu, setContextMenu] = React.useState(null);
  const [noteModalUser, setNoteModalUser] = React.useState(null);
  const hoverTimeoutRef = React.useRef(null);
  const hideTimeoutRef = React.useRef(null);
  const itemRef = React.useRef(null);
  const avatarWrapRef = React.useRef(null);

  const menuItems = useVoiceSidebarUserContextMenu(voiceUser, {
    teamId,
    channelId,
    voiceChannelId: channelId,
    roles,
    memberRolesMap,
    canManage,
    isOwner,
    onKick,
    onBan,
    targetTeamRole: serverTeamRole,
    onOpenProfileDetail: () => {
      setContextMenu(null);
      setShowProfileDetail(true);
    },
    onOpenNoteModal: (u) => {
      setContextMenu(null);
      setNoteModalUser(u);
    },
    onRolesChanged,
  });
  const compactTouchUi = useCompactTouchUi();

  const openVoiceUserMenu = useCallback((clientX, clientY) => {
    if (!voiceUser?.id) return;
    setContextMenu({ x: clientX, y: clientY });
  }, [voiceUser?.id]);

  const { longPressProps, shouldSkipClick } = useLongPress(
    useCallback((e) => {
      hapticImpact('Medium');
      openVoiceUserMenu(e.clientX, e.clientY);
    }, [openVoiceUserMenu]),
    { disabled: !compactTouchUi || !voiceUser?.id },
  );

  const clearHideTimeout = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  };

  const handleMouseEnter = () => {
    if (!isScreenSharing || !stream) return;
    clearHideTimeout();
    hoverTimeoutRef.current = setTimeout(() => setShowHoverPreview(true), 400);
  };
  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    hideTimeoutRef.current = setTimeout(() => setShowHoverPreview(false), 150);
  };

  React.useEffect(() => () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
  }, []);

  const handleRowClick = (e) => {
    e.stopPropagation();
    if (shouldSkipClick()) return;
    setShowProfile(true);
  };

  const handleRowContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    openVoiceUserMenu(e.clientX, e.clientY);
  };

  return (
    <>
      <div
        ref={itemRef}
        className={`voice-sidebar-user ${isSpeaking ? 'speaking' : ''} ${isScreenSharing ? 'has-live' : ''} ${isExiting ? 'voice-sidebar-user--exiting' : ''}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleRowClick}
        onContextMenu={compactTouchUi ? longPressProps.onContextMenu : handleRowContextMenu}
        onPointerDown={compactTouchUi ? longPressProps.onPointerDown : undefined}
        onPointerMove={compactTouchUi ? longPressProps.onPointerMove : undefined}
        onPointerUp={compactTouchUi ? longPressProps.onPointerUp : undefined}
        onPointerCancel={compactTouchUi ? longPressProps.onPointerCancel : undefined}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleRowClick(e);
          }
        }}
      >
        <div ref={avatarWrapRef} className={`voice-sidebar-avatar ${isSpeaking ? 'speaking' : ''}`}>
          <ClickableAvatar
            user={voiceUser}
            size="small"
            showPresence={false}
            position="right"
            suppressContextMenu
            onClick={handleRowClick}
            serverRoleBadges={serverRoleBadges}
            serverTeamRole={serverTeamRole}
          />
        </div>
        <span className="voice-sidebar-username">{voiceUser.display_name}</span>
        {isScreenSharing && (
          <span
            className={`voice-sidebar-live-badge ${stream ? 'clickable' : ''}`}
            onClick={(e) => { if (stream) { e.stopPropagation(); onLiveClick?.(); } }}
            title={stream ? 'Voir le live' : 'Connexion en cours...'}
          >
            LIVE
          </span>
        )}
        {!!voiceUser.muted && (
          <AppIcon name="micOff" size={14} className="voice-sidebar-status muted" />
        )}
        {!!voiceUser.deafened && (
          <AppIcon name="deafenOff" size={14} className="voice-sidebar-status deafened" />
        )}
        {showHoverPreview && isScreenSharing && stream && (
          <LiveStreamHoverPreview
            stream={stream}
            displayName={voiceUser.display_name}
            anchorRef={itemRef}
            onMouseEnter={clearHideTimeout}
            onClose={() => { clearHideTimeout(); setShowHoverPreview(false); }}
          />
        )}
      </div>
      <ProfileCard
        userId={voiceUser?.id}
        user={voiceUser}
        isOpen={showProfile}
        onClose={() => setShowProfile(false)}
        anchorEl={avatarWrapRef.current?.querySelector('.clickable-avatar')}
        position="right"
        keepRightOfSelector=".channel-sidebar"
        serverRoleBadges={serverRoleBadges}
        serverTeamRole={serverTeamRole}
      />
      <UserDetailModal
        userId={voiceUser?.id}
        user={voiceUser}
        isOpen={showProfileDetail}
        onClose={() => setShowProfileDetail(false)}
      />
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={menuItems}
          onClose={() => setContextMenu(null)}
        />
      )}
      <AddNoteModal
        isOpen={!!noteModalUser}
        onClose={() => setNoteModalUser(null)}
        user={noteModalUser}
      />
    </>
  );
});

// ═══════════════════════════════════════════════════════════
// CHANNEL ITEM with context menu & hover actions
// ═══════════════════════════════════════════════════════════
const ChannelItem = memo(function ChannelItem({
  channel, team, teamId, isActive, hasUnread, canManage, onEdit, onDelete, onCopyId,
  isMuted, muteKey, onMute, onUnmute, onChannelMove, onDragEnd, onDragOverAtPosition,
  categoryId, position, channelCount, dropIndicatorPosition, isDragOverCategory,
  isMobile, onActiveChannelClick, onVoiceJoinRequest, roles, memberRolesMap, onRolesChanged,
  isOwner = false, onKick, onBan,
}) {
  if (!channel || channel.id == null) return null;
  const icon = channelIcons[channel.channel_type] || channelIcons.text;
  const isPrivate = channel.is_private;
  const isVoice = channel.channel_type === 'voice';
  const [ctxMenu, setCtxMenu] = useState(null);
  const { user } = useAuth();
  const { t } = useLanguage();
  const compactTouchUi = useCompactTouchUi();
  const longPressTimerRef = useRef(null);
  const longPressStartRef = useRef(null);
  const clearChannelLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressStartRef.current = null;
  }, []);

  const openChannelMenuAt = useCallback((clientX, clientY) => {
    setCtxMenu({ x: clientX, y: clientY });
  }, []);

  const onChannelRowPointerDown = useCallback((e) => {
    if (!compactTouchUi || e.button !== 0) return;
    longPressStartRef.current = { x: e.clientX, y: e.clientY };
    const cx = e.clientX;
    const cy = e.clientY;
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      longPressStartRef.current = null;
      hapticImpact('Medium');
      openChannelMenuAt(cx, cy);
    }, 500);
  }, [compactTouchUi, openChannelMenuAt]);

  const onChannelRowPointerMove = useCallback((e) => {
    if (!longPressStartRef.current) return;
    const dx = e.clientX - longPressStartRef.current.x;
    const dy = e.clientY - longPressStartRef.current.y;
    if (dx * dx + dy * dy > 100) clearChannelLongPress();
  }, [clearChannelLongPress]);

  const onChannelRowPointerUp = useCallback(() => clearChannelLongPress(), [clearChannelLongPress]);

  const { voiceUsers, isUserSpeakingInChannel, voiceChannelId, voiceLeaveAnim, remoteVideoStreams, screenSharingUserIds, isScreenSharing, ownScreenStream, setExpandedLiveView, setVoiceViewMinimized } = useVoice();
  const navigate = useNavigate();

  const channelVoiceUsers = isVoice
    ? (voiceUsers[channel.id] || voiceUsers[coercePositiveInt(channel.id)] || [])
    : [];
  const isConnected = isVoice && voiceChannelId != null && String(voiceChannelId) === String(channel.id);
  const isLeavingChannel =
    isVoice &&
    voiceLeaveAnim?.kind === 'channel' &&
    String(voiceLeaveAnim.channelId) === String(channel.id);

  const handleContextMenu = (e) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  };

  const stopMobileMenuPointer = useCallback((e) => {
    e.stopPropagation();
  }, []);

  const handleMobileMenuClick = useCallback((ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    hapticImpact('Light');
    const r = ev.currentTarget.getBoundingClientRect();
    setCtxMenu({ x: r.left, y: r.bottom + 4 });
  }, []);

  const handleDragStart = (e) => {
    if (!canManage || !onChannelMove) return;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-slide-channel', JSON.stringify({ channelId: channel.id }));
    e.currentTarget.classList.add('channel-item-dragging');
    const ghost = e.currentTarget.cloneNode(true);
    ghost.classList.add('channel-drag-ghost');
    ghost.style.cssText = 'position:fixed;top:-9999px;left:0;width:280px;margin:0;list-style:none;pointer-events:none;opacity:1;box-shadow:0 8px 24px rgba(0,0,0,0.4);border-radius:8px;overflow:hidden;';
    document.body.appendChild(ghost);
    const rect = ghost.getBoundingClientRect();
    e.dataTransfer.setDragImage(ghost, rect.width / 2, rect.height / 2);
    requestAnimationFrame(() => ghost.remove());
  };

  const EDGE_ZONE = 6;
  const GAP_OFFSET = 2;
  const handleDragOver = (e) => {
    if (!canManage) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (onDragOverAtPosition && e.currentTarget) {
      const rect = e.currentTarget.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const inTopEdge = y < EDGE_ZONE;
      const inBottomEdge = y > rect.height - EDGE_ZONE;
      const isFirst = position === 0;
      const isLast = position === (channelCount ?? 1) - 1;
      if (inTopEdge) {
        const lineY = isFirst ? rect.top - GAP_OFFSET : rect.top;
        onDragOverAtPosition(position, lineY);
      } else if (inBottomEdge) {
        const lineY = isLast ? rect.bottom + GAP_OFFSET : rect.bottom;
        onDragOverAtPosition(Math.min(position + 1, channelCount ?? position + 1), lineY);
      } else {
        onDragOverAtPosition(null, null);
      }
    }
  };

  const handleDragLeave = () => {};

  const handleDrop = (e) => {
    e.preventDefault();
    onDragEnd?.();
    if (!canManage || !onChannelMove) return;
    const data = e.dataTransfer.getData('application/x-slide-channel');
    if (!data) return;
    try {
      const { channelId } = JSON.parse(data);
      if (channelId === channel.id) return;
      onChannelMove(channelId, categoryId, position);
    } catch (_) {}
  };

  const handleDragEnd = (e) => {
    e.currentTarget?.classList?.remove('channel-item-dragging');
    onDragEnd?.();
  };

  const handleVoiceClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isMobile) {
      if (isConnected) {
        setVoiceViewMinimized(false);
        return;
      }
      onVoiceJoinRequest?.(channel);
      return;
    }
    navigate(serverChannelPath(team || { id: teamId }, channel));
  };

  const showUnread = hasUnread && !isMuted;

  const channelLinkContent = (
    <>
      <span className="channel-icon">{icon}</span>
      {!!isPrivate && (
        <AppIcon name="lock" size={12} className="channel-lock" />
      )}
      <span className="channel-name">{channel.name}</span>
      {!!channel.nsfw && <span className="channel-nsfw">18+</span>}
      {isMuted && (
        <AppIcon name="bellOff" size={12} className="channel-muted-icon" />
      )}
      {showUnread && <span className="channel-unread-dot" />}
    </>
  );

  return (
    <li
      className={`channel-item ${isActive ? 'active' : ''} ${showUnread ? 'unread' : ''} ${isVoice ? 'voice-channel' : ''} ${isConnected || isLeavingChannel ? 'voice-connected' : ''} ${isLeavingChannel ? 'voice-connected--leaving' : ''} ${canManage ? 'channel-item-draggable' : ''} ${isDragOverCategory && dropIndicatorPosition != null && position >= dropIndicatorPosition ? 'channel-item-shift-down' : ''}`}
      draggable={canManage && !!onChannelMove}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onDragEnd={handleDragEnd}
    >
      {isVoice ? (
        <div
          className="channel-link"
          onClick={handleVoiceClick}
          onContextMenu={handleContextMenu}
          onPointerDown={onChannelRowPointerDown}
          onPointerMove={onChannelRowPointerMove}
          onPointerUp={onChannelRowPointerUp}
          onPointerCancel={onChannelRowPointerUp}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleVoiceClick(e); } }}
        >
          {channelLinkContent}
        </div>
      ) : (
        <Link
          to={serverChannelPath(team || { id: teamId }, channel)}
          className="channel-link"
          onContextMenu={handleContextMenu}
          onPointerDown={onChannelRowPointerDown}
          onPointerMove={onChannelRowPointerMove}
          onPointerUp={onChannelRowPointerUp}
          onPointerCancel={onChannelRowPointerUp}
          onClick={isMobile && isActive && onActiveChannelClick ? (e) => { e.preventDefault(); onActiveChannelClick(); } : undefined}
        >
          {channelLinkContent}
        </Link>
      )}
      {compactTouchUi && (
        <button
          type="button"
          className="channel-mobile-menu-btn"
          aria-label={t('chat.moreOptions')}
          onPointerDown={stopMobileMenuPointer}
          onPointerUp={stopMobileMenuPointer}
          onClick={handleMobileMenuClick}
        >
          <AppIcon name="more" size={20} />
        </button>
      )}
      {canManage && !compactTouchUi && (
        <div className="channel-actions">
          <button className="channel-action-btn" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onEdit?.(channel); }} title={t('channelSettings.menuLabel')}>
            <AppIcon name="settings" size={14} />
          </button>
        </div>
      )}
      {isVoice && channelVoiceUsers.length > 0 && (
        <div className="voice-sidebar-users">
          {channelVoiceUsers.map(u => {
            const exitingSelf =
              isLeavingChannel &&
              voiceLeaveAnim?.userId != null &&
              sameUserId(u.id, voiceLeaveAnim.userId);
            return (
            <VoiceUserItem
              key={u.id}
              voiceUser={u}
              isSpeaking={!!u.speaking || isUserSpeakingInChannel(channel.id, u.id)}
              isScreenSharing={!!getRemoteStreamForUser(remoteVideoStreams, u.id) || screenSharingUserIds?.has?.(u.id) || (sameUserId(u.id, user?.id) && isScreenSharing)}
              stream={sameUserId(u.id, user?.id) ? ownScreenStream : getRemoteStreamForUser(remoteVideoStreams, u.id)}
              onLiveClick={() => setExpandedLiveView({ userId: u.id, displayName: u.display_name })}
              channelId={channel.id}
              teamId={teamId}
              isExiting={exitingSelf}
              roles={roles}
              memberRolesMap={memberRolesMap}
              canManage={canManage}
              isOwner={isOwner}
              onKick={onKick}
              onBan={onBan}
              onRolesChanged={onRolesChanged}
              serverRoleBadges={(roles || []).filter((r) => (memberRolesMap?.[u.id] || []).some((id) => String(id) === String(r.id))).map((r) => ({ name: r.name, color: r.color }))}
              serverTeamRole={u.role}
            />
            );
          })}
        </div>
      )}
      {ctxMenu && (
        <ChannelContextMenu
          x={ctxMenu.x} y={ctxMenu.y} channel={channel} team={team} teamId={teamId}
          onClose={() => setCtxMenu(null)} canManage={canManage}
          onEdit={onEdit} onDelete={onDelete} onCopyId={onCopyId}
          isMuted={isMuted} muteKey={muteKey} onMute={onMute} onUnmute={onUnmute}
        />
      )}
    </li>
  );
});

// ═══════════════════════════════════════════════════════════
// CHANNEL MODAL (Create / Edit)
// ═══════════════════════════════════════════════════════════
const ChannelModal = ({ isOpen, onClose, onSubmit, onError, teamId, categories, defaultCategoryId }) => {
  const [name, setName] = useState('');
  const [type, setType] = useState('text');
  const [categoryId, setCategoryId] = useState('');
  const [topic, setTopic] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [slowmode, setSlowmode] = useState(0);
  const [nsfw, setNsfw] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setType('text');
      const catId = defaultCategoryId ?? '';
      setCategoryId(catId !== '' && catId != null ? String(catId) : '');
      setTopic('');
      setIsPrivate(false);
      setSlowmode(0);
      setNsfw(false);
    }
  }, [isOpen, defaultCategoryId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    const resolvedCatId = categoryId && String(categoryId).trim() ? (parseInt(categoryId, 10) || null) : null;
    try {
      await onSubmit({
        name: name.trim(),
        channel_type: type,
        channelType: type,
        category_id: resolvedCatId,
        categoryId: resolvedCatId,
        topic,
        is_private: isPrivate,
        isPrivate,
        slowmode_seconds: slowmode,
        slowmodeSeconds: slowmode,
        nsfw,
      });
      onClose();
    } catch (err) {
      onError?.(err?.message || 'Failed to create channel');
    }
    setLoading(false);
  };

  if (!isOpen) return null;

  const channelTypes = [
    { key: 'text', label: 'Text', icon: channelIcons.text, desc: 'Send messages, images, GIFs, emoji, opinions, and puns' },
    { key: 'voice', label: 'Voice', icon: channelIcons.voice, desc: 'Hang out together with voice, video, and screen share' },
    { key: 'announcement', label: 'Announcement', icon: channelIcons.announcement, desc: 'Important updates for your community' },
    { key: 'forum', label: 'Forum', icon: channelIcons.forum, desc: 'Create a space for organized discussions' },
  ];

  return (
    <div className="channel-modal-overlay" onClick={onClose}>
      <div className="channel-modal" onClick={(e) => e.stopPropagation()}>
        <div className="channel-modal-header">
          <h3>Create Channel</h3>
          <p className="channel-modal-sub">in {categories?.find(c => String(c.id) === String(categoryId || ''))?.name || 'your server'}</p>
          <button className="modal-close-btn" onClick={onClose}>
            <AppIcon name="close" size={20} weight="bold" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Channel Type</label>
            <div className="channel-type-grid">
              {channelTypes.map(ct => (
                <button key={ct.key} type="button" className={`channel-type-option ${type === ct.key ? 'active' : ''}`} onClick={() => setType(ct.key)}>
                  <span className="cto-icon">{ct.icon}</span>
                  <div className="cto-info">
                    <span className="cto-label">{ct.label}</span>
                    <span className="cto-desc">{ct.desc}</span>
                  </div>
                  <div className="cto-radio"><div className="cto-radio-inner" /></div>
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>Channel Name</label>
            <div className="channel-name-input-wrapper">
              <span className="channel-name-prefix">{channelIcons[type]}</span>
              <input type="text" value={name} onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, '-'))} placeholder="new-channel" required autoFocus />
            </div>
          </div>

          {categories?.length > 0 && (
            <div className="form-group">
              <label>Category</label>
              <select value={String(categoryId || '')} onChange={(e) => setCategoryId(e.target.value || '')}>
                <option value="">No Category</option>
                {categories.map(cat => <option key={cat.id} value={String(cat.id)}>{cat.name}</option>)}
              </select>
            </div>
          )}

          {(type === 'text' || type === 'announcement') && (
            <div className="form-group">
              <label>Topic <span className="form-optional">Optional</span></label>
              <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Let everyone know what this channel is about" maxLength={1024} />
            </div>
          )}

          <div className="form-toggles">
            <label className="toggle-row">
              <div className="toggle-info">
                <AppIcon name="lock" size={16} />
                <span>Private Channel</span>
              </div>
              <div className={`toggle-switch ${isPrivate ? 'on' : ''}`} onClick={() => setIsPrivate(!isPrivate)}>
                <div className="toggle-knob" />
              </div>
            </label>
            {type === 'text' && (
              <label className="toggle-row">
                <div className="toggle-info">
                  <span style={{ fontSize: '14px', opacity: 0.7 }}>18+</span>
                  <span>Age-Restricted Channel</span>
                </div>
                <div className={`toggle-switch ${nsfw ? 'on' : ''}`} onClick={() => setNsfw(!nsfw)}>
                  <div className="toggle-knob" />
                </div>
              </label>
            )}
          </div>

          {type === 'text' && (
            <div className="form-group">
              <label>Slowmode</label>
              <select value={slowmode} onChange={(e) => setSlowmode(Number(e.target.value))}>
                <option value="0">Off</option>
                <option value="5">5 seconds</option>
                <option value="10">10 seconds</option>
                <option value="15">15 seconds</option>
                <option value="30">30 seconds</option>
                <option value="60">1 minute</option>
                <option value="120">2 minutes</option>
                <option value="300">5 minutes</option>
                <option value="600">10 minutes</option>
              </select>
            </div>
          )}

          <div className="form-actions">
            <button type="button" onClick={onClose} className="cancel-btn">Cancel</button>
            <button type="submit" className="submit-btn" disabled={loading || !name.trim()}>
              {loading ? 'Creating...' : 'Create Channel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// CATEGORY MODAL
// ═══════════════════════════════════════════════════════════
const CATEGORY_NAME_MAX = 100;

const CategoryModal = ({ isOpen, onClose, onSubmit, initialName }) => {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setName(initialName || '');
      setError('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, initialName]);

  useEffect(() => {
    if (!isOpen) return;
    const onEscape = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [isOpen, onClose]);

  const trimmed = name.trim();
  const isValid = trimmed.length > 0 && trimmed.length <= CATEGORY_NAME_MAX;
  const charCount = name.length;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isValid) return;
    setLoading(true);
    setError('');
    try {
      await onSubmit(trimmed);
      setName('');
      onClose();
    } catch (err) {
      const msg = err?.message || err?.error || 'Failed to save category';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const val = e.target.value;
    if (val.length <= CATEGORY_NAME_MAX) setName(val);
    setError('');
  };

  const enterInstant = useModalEnterAnimation('channel-category-modal', isOpen);

  if (!isOpen) return null;

  return (
    <div className={`channel-modal-overlay category-modal-overlay${enterInstant ? ' modal-enter-instant' : ''}`} onClick={onClose}>
      <div className="channel-modal category-modal" onClick={(e) => e.stopPropagation()}>
        <div className="category-modal-header">
          <div className="category-modal-title-wrap">
            <h3>{initialName ? 'Edit Category' : 'Create Category'}</h3>
            <p className="category-modal-subtitle">
              {initialName ? 'Update the category name' : 'Organize your channels into groups'}
            </p>
          </div>
          <button type="button" className="category-modal-close" onClick={onClose} aria-label="Close">
            <AppIcon name="close" size={20} weight="bold" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="category-modal-form">
          <div className="form-group category-form-group">
            <label htmlFor="category-name-input">Category name</label>
            <div className={`category-input-wrapper ${charCount > 0 ? 'has-count' : ''}`}>
              <input
                id="category-name-input"
                ref={inputRef}
                type="text"
                value={name}
                onChange={handleChange}
                placeholder="e.g. General, Gaming"
                autoComplete="off"
                autoFocus
                disabled={loading}
                className={error ? 'input-error' : ''}
                aria-invalid={!!error}
                aria-describedby={error ? 'category-error' : 'category-hint'}
              />
              {charCount > 0 && (
                <span className={`category-char-count ${charCount > CATEGORY_NAME_MAX * 0.9 ? 'near-limit' : ''}`}>
                  {charCount}/{CATEGORY_NAME_MAX}
                </span>
              )}
            </div>
            {error ? (
              <p id="category-error" className="category-form-error" role="alert">{error}</p>
            ) : (
              <p id="category-hint" className="category-form-hint">Keep it short and descriptive</p>
            )}
          </div>
          <div className="form-actions category-form-actions">
            <button type="button" onClick={onClose} className="cancel-btn category-cancel-btn">Cancel</button>
            <button type="submit" className="submit-btn category-submit-btn" disabled={loading || !isValid}>
              {loading ? (
                <span className="category-btn-content"><span className="category-btn-spinner" /> Saving…</span>
              ) : (
                initialName ? 'Save Changes' : 'Create Category'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// VOICE STATUS BAR - Shows when connected to voice (server or DM)
// ═══════════════════════════════════════════════════════════
export const VoiceStatusBar = memo(function VoiceStatusBar() {
  const { voiceChannelId, voiceChannelName, voiceConversationId, voiceConversationName, voiceLeaveAnim, connectionState, isScreenSharing, startScreenShare, stopScreenShare, leaveVoice, leaveVoiceDM } = useVoice();
  const [showVoiceDetails, setShowVoiceDetails] = useState(false);
  const [voiceStats, setVoiceStats] = useState({ ping: 0, avgPing: 0, packetLoss: 0, server: 'c-mxp03-ff-032875', pingHistory: [] });
  const voiceDetailsRef = useRef(null);
  const voiceDetailsTriggerRef = useRef(null);
  const [vdmPosition, setVdmPosition] = useState(null);
  const pingCanvasRef = useRef(null);

  const isLeavingChannel = voiceLeaveAnim?.kind === 'channel';
  const isLeavingDm = voiceLeaveAnim?.kind === 'dm';
  const isInVoice = voiceChannelId || voiceConversationId || voiceLeaveAnim;
  const displayName = isLeavingChannel
    ? (voiceLeaveAnim.channelName || 'Voice Channel')
    : isLeavingDm
      ? (voiceLeaveAnim.conversationName || 'DM Call')
      : voiceChannelId
        ? (voiceChannelName || 'Voice Channel')
        : (voiceConversationName || 'DM Call');
  const isExitingBar = !!voiceLeaveAnim;

  // Simulate ping stats (real stats would come from RTCPeerConnection.getStats())
  useEffect(() => {
    if (!isInVoice || !showVoiceDetails) return;
    const iv = setInterval(() => {
      setVoiceStats(prev => {
        const ping = Math.max(8, Math.min(80, (prev.ping || 30) + (Math.random() - 0.5) * 12));
        const history = [...prev.pingHistory, ping].slice(-40);
        const avgPing = history.length ? history.reduce((a, b) => a + b, 0) / history.length : ping;
        const packetLoss = Math.max(0, Math.min(2, parseFloat(prev.packetLoss) + (Math.random() - 0.6) * 0.3));
        return { ...prev, ping: Math.round(ping), avgPing: Math.round(avgPing), packetLoss: packetLoss.toFixed(1), pingHistory: history };
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [isInVoice, showVoiceDetails]);

  // Draw ping graph on canvas
  useEffect(() => {
    const canvas = pingCanvasRef.current;
    if (!canvas || !showVoiceDetails) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const pts = voiceStats.pingHistory;
    if (pts.length < 2) return;
    const maxP = Math.max(...pts, 60);
    ctx.strokeStyle = '#23a55a';
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach((p, i) => {
      const x = (i / (pts.length - 1)) * w;
      const y = h - (p / maxP) * (h - 4) - 2;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Fill under
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = 'rgba(35, 165, 90, 0.08)';
    ctx.fill();
  }, [voiceStats.pingHistory, showVoiceDetails]);

  // Close voice details on outside click
  useEffect(() => {
    if (!showVoiceDetails) return;
    const handler = (e) => {
      const inModal = voiceDetailsRef.current && voiceDetailsRef.current.contains(e.target);
      const inTrigger = voiceDetailsTriggerRef.current && voiceDetailsTriggerRef.current.contains(e.target);
      if (!inModal && !inTrigger) setShowVoiceDetails(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showVoiceDetails]);

  // Calculate voice details modal position when opened
  useEffect(() => {
    if (!showVoiceDetails || !voiceDetailsTriggerRef.current) { setVdmPosition(null); return; }
    const rect = voiceDetailsTriggerRef.current.getBoundingClientRect();
    setVdmPosition({ left: rect.left, bottom: window.innerHeight - rect.top + 8 });
  }, [showVoiceDetails]);

  if (!isInVoice) return null;

  const handleDisconnect = () => {
    if (isExitingBar) return;
    if (voiceChannelId || isLeavingChannel) {
      leaveVoice();
    } else {
      leaveVoiceDM();
    }
  };

  return (
    <div className={`voice-status-bar${isExitingBar ? ' voice-status-bar--exiting' : ''}`}>
      <div className="vsb-info">
        <div className={`vsb-status${showVoiceDetails ? ' vsb-status--active' : ''}`} ref={voiceDetailsTriggerRef} onClick={() => setShowVoiceDetails(v => !v)} title={connectionState === 'connected' ? 'Secure connection — Voice is encrypted (DTLS-SRTP)' : connectionState === 'connecting' ? 'Establishing secure connection...' : connectionState === 'leaving' ? 'Leaving voice...' : 'Connection interrupted'}>
          <div className="vsb-status-cube">
            <div className="vsb-status-face vsb-status-face--front">
              <div className={`vsb-signal ${connectionState}`} />
              <span className="vsb-label">
                {connectionState === 'leaving'
                  ? 'Leaving...'
                  : connectionState === 'connecting'
                    ? 'Connecting...'
                    : 'Connected'}
              </span>
            </div>
            <div className="vsb-status-face vsb-status-face--top">
              <span className="vsb-details-label">Voice Details</span>
            </div>
          </div>
          {showVoiceDetails && vdmPosition && createPortal(
            <div className="voice-details-modal voice-details-modal-portal" ref={voiceDetailsRef} style={{ left: vdmPosition.left, bottom: vdmPosition.bottom }} onClick={(e) => e.stopPropagation()}>
              <div className="vdm-title">Voice Connection</div>
              <div className="vdm-row">
                <span className="vdm-row-label">Avg. Ping</span>
                <span className="vdm-row-value">{voiceStats.avgPing} ms</span>
              </div>
              <div className="vdm-row">
                <span className="vdm-row-label">Last Ping</span>
                <span className="vdm-row-value">{voiceStats.ping} ms</span>
              </div>
              <div className="vdm-ping-graph">
                <canvas ref={pingCanvasRef} />
              </div>
              <div className="vdm-row">
                <span className="vdm-row-label">Server</span>
                <span className="vdm-row-value">{voiceStats.server}</span>
              </div>
              <div className="vdm-row">
                <span className="vdm-row-label">Outbound Packet Loss</span>
                <span className="vdm-row-value">{voiceStats.packetLoss}%</span>
              </div>
              <div className="vdm-encryption">
                <AppIcon name="lock" size={14} />
                <span>End-to-end encrypted</span>
              </div>
            </div>,
            document.body
          )}
        </div>
        <span className="vsb-channel">{displayName}</span>
      </div>
      <div className="vsb-controls">
        {voiceChannelId && (
          <>
            <button
              className={`vsb-btn ${isScreenSharing ? 'active' : ''}`}
              onClick={isScreenSharing ? stopScreenShare : startScreenShare}
              title={isScreenSharing ? 'Arrêter le partage' : 'Partager l\'écran'}
            >
              <AppIcon name="screenShare" size={18} />
            </button>
          </>
        )}
        <button
          type="button"
          className="vsb-btn disconnect"
          onClick={handleDisconnect}
          title="Disconnect"
        >
          <AppIcon name="phoneOff" size={18} />
        </button>
      </div>
    </div>
  );
});

// ═══════════════════════════════════════════════════════════
// MAIN CHANNEL LIST EXPORT
// ═══════════════════════════════════════════════════════════
export default function ChannelList({
  team, channels, categories, currentChannelId,
  onChannelsChange, onCategoriesChange,
  onOpenSettings, onInvite, onLeave,
  canManage = false, canOpenServerSettings = false, unreadChannels,
  onEditChannel, onDeleteChannel,
  hideUserPanel = false,
  isMobile = false,
  onOpenSearch,
  notificationCount = 0,
  isNotificationsActive = false,
  onMobileNotificationsClick,
  pendingFriendsCount = 0,
  onActiveChannelClick,
  onVoiceJoinRequest,
  width,
  onResizeStart,
  roles = [],
  memberRolesMap = {},
  onRolesChanged,
  isOwner = false,
  onKick,
  onBan,
}) {
  const [showChannelModal, setShowChannelModal] = useState(false);
  const [showChannelSettings, setShowChannelSettings] = useState(false);
  const [settingsChannel, setSettingsChannel] = useState(null);
  const safeChannels = Array.isArray(channels) ? channels : [];
  const safeCategories = Array.isArray(categories) ? categories : [];
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [editingCategory, setEditingCategory] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteCategoryConfirm, setDeleteCategoryConfirm] = useState(null);
  const [dragOverCategoryId, setDragOverCategoryId] = useState(null);
  const [scrollContextMenu, setScrollContextMenu] = useState(null);
  const { notify } = useNotification();
  const navigate = useNavigate();

  const MUTE_KEY = `channelMutes_${team?.id}`;
  const [mutedChannels, setMutedChannels] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(`channelMutes_${team?.id}`)) || {};
    } catch { return {}; }
  });

  useEffect(() => {
    try { localStorage.setItem(MUTE_KEY, JSON.stringify(mutedChannels)); } catch {}
  }, [mutedChannels, MUTE_KEY]);

  const isChannelMuted = useCallback((channelId) => {
    const mute = mutedChannels[channelId];
    if (!mute) return false;
    if (mute.until === null) return true;
    if (Date.now() < mute.until) return true;
    return false;
  }, [mutedChannels]);

  const getChannelMuteKey = useCallback((channelId) => {
    const mute = mutedChannels[channelId];
    if (!mute) return null;
    if (mute.until !== null && Date.now() >= mute.until) return null;
    return mute.key || null;
  }, [mutedChannels]);

  const handleMuteChannel = useCallback((channelId, durationMs, key) => {
    setMutedChannels(prev => ({
      ...prev,
      [channelId]: { until: durationMs ? Date.now() + durationMs : null, key: key || 'indefinite' }
    }));
    notify.success('Channel muted');
  }, [notify]);

  const handleUnmuteChannel = useCallback((channelId) => {
    setMutedChannels(prev => {
      const next = { ...prev };
      delete next[channelId];
      return next;
    });
    notify.success('Channel unmuted');
  }, [notify]);

  const handleCreateChannel = useCallback((categoryId) => {
    setSelectedCategoryId(categoryId);
    setShowChannelModal(true);
  }, []);

  const handleOpenChannelSettings = useCallback((channel) => {
    if (isMobile && team?.id && channel?.id) {
      navigate(channelSettingsPath(team, channel));
      return;
    }
    setSettingsChannel(channel);
    setShowChannelSettings(true);
  }, [isMobile, team?.id, navigate]);

  const handleChannelSubmit = useCallback(async (data) => {
    let resolvedCategoryId = data.categoryId ?? data.category_id ?? selectedCategoryId ?? null;
    if (resolvedCategoryId != null) {
      const parsed = parseInt(resolvedCategoryId, 10);
      resolvedCategoryId = Number.isNaN(parsed) ? null : parsed;
    }
    const newChannel = await channelsApi.create(team.id, {
      ...data,
      categoryId: resolvedCategoryId,
      category_id: resolvedCategoryId,
    });
    onChannelsChange?.([...safeChannels, newChannel]);
    setShowChannelModal(false);
    setSelectedCategoryId(null);
    if (isMobile && newChannel?.id) {
      navigate(channelSettingsPath(team, newChannel));
    }
  }, [team.id, safeChannels, selectedCategoryId, onChannelsChange, isMobile, navigate]);

  const handleChannelSettingsSave = useCallback(async (data) => {
    if (!settingsChannel) return;
    await onEditChannel?.(settingsChannel.id, data);
    // Update local channel state so the settings page reflects saved values
    setSettingsChannel(prev => prev ? { ...prev, ...data, name: data.name } : prev);
    if (onChannelsChange) {
      onChannelsChange(safeChannels.map(c => c.id === settingsChannel.id ? { ...c, ...data } : c));
    }
  }, [settingsChannel, onEditChannel, onChannelsChange, safeChannels]);

  const handleRequestDeleteChannel = useCallback((channel) => {
    setDeleteConfirm(channel);
  }, []);

  const handleConfirmDeleteChannel = useCallback(async () => {
    if (!deleteConfirm) return;
    await onDeleteChannel?.(deleteConfirm.id);
    setDeleteConfirm(null);
  }, [deleteConfirm, onDeleteChannel]);

  const handleCopyChannelId = useCallback((id) => {
    navigator.clipboard?.writeText(String(id)).then(
      () => notify.success('Channel ID copied'),
      () => {}
    );
  }, [notify]);

  const handleInviteToChannel = useCallback((channel) => {
    onInvite?.(channel);
  }, [onInvite]);

  const handleCreateCategory = useCallback(async (name) => {
    const newCategory = await servers.createCategory(team.id, name);
    onCategoriesChange?.([...safeCategories, newCategory]);
  }, [team.id, safeCategories, onCategoriesChange]);

  const handleEditCategory = useCallback((category) => {
    setEditingCategory(category);
    setShowCategoryModal(true);
  }, []);

  const handleDeleteCategory = useCallback((category) => {
    setDeleteCategoryConfirm(category);
  }, []);

  const handleConfirmDeleteCategory = useCallback(async () => {
    const category = deleteCategoryConfirm;
    setDeleteCategoryConfirm(null);
    if (!category) return;
    await servers.deleteCategory(team.id, category.id);
    onCategoriesChange?.(safeCategories.filter(c => c && c.id !== category.id));
    onChannelsChange?.(safeChannels.map(c => c && c.category_id === category.id ? { ...c, category_id: null } : c));
  }, [deleteCategoryConfirm, team.id, safeCategories, safeChannels, onCategoriesChange, onChannelsChange]);

  const handleChannelMove = useCallback(async (channelId, targetCategoryId, position) => {
    try {
      const updated = await channelsApi.move(channelId, targetCategoryId ?? undefined, position);
      onChannelsChange?.(safeChannels.map(c => c?.id === channelId ? { ...c, ...updated, category_id: updated.category_id ?? null } : c));
      notify.success('Channel moved');
    } catch (err) {
      console.error(err);
      notify.error(err?.message || 'Failed to move channel');
    }
  }, [onChannelsChange, safeChannels, notify]);

  const sortedCategories = [...safeCategories].filter(c => c && c.id != null).sort((a, b) => (a.position || 0) - (b.position || 0));

  const currentChannel = currentChannelId
    ? safeChannels.find(c => c && String(c.id) === String(currentChannelId))
    : null;

  if (!team || team.id == null) {
    return (
      <div className="channel-sidebar" style={width ? { width, minWidth: width } : undefined}>
        <div className="channel-sidebar-skeleton" />
      </div>
    );
  }

  return (
    <div className={`channel-sidebar${isMobile ? ' channel-sidebar--mobile-discord' : ''}`} style={width ? { width, minWidth: width } : undefined}>
      {onResizeStart && (
        <div
          className="channel-sidebar-resize-handle"
          onMouseDown={onResizeStart}
          role="separator"
          aria-orientation="vertical"
          aria-label="Redimensionner la barre latérale"
        />
      )}
      <div className={`channel-sidebar-top${team?.banner_url ? ' channel-sidebar-top--banner' : ''}`}>
        {team?.banner_url && (
          <ServerBanner bannerUrl={team.banner_url} alt={`${team.name} banner`} />
        )}
        <ServerHeader
          team={team} onOpenSettings={onOpenSettings} onInvite={onInvite}
          onCreateChannel={() => handleCreateChannel(null)}
          onCreateCategory={() => { setEditingCategory(null); setShowCategoryModal(true); }}
          onLeave={onLeave}
          isMobile={isMobile}
          canOpenServerSettings={canOpenServerSettings}
        />
      </div>

      <div className="sidebar-nav-panel">
      {isMobile && (
        <>
          <MobileChannelToolbar onOpenSearch={onOpenSearch} onInvite={onInvite} />
          <MobileBoostGoal team={team} />
        </>
      )}

      {isMobile && currentChannel && (
        <div className="channel-current-banner">
          <span className="channel-current-label">In</span>
          <span className="channel-current-name">
            {currentChannel.channel_type === 'voice' ? '' : '#'}{currentChannel.name}
          </span>
        </div>
      )}

      <div className="channel-list-scroll" onContextMenu={(e) => {
        if (!canManage) return;
        // Only show if right-clicking on the scroll area itself, not on a channel/category
        if (e.target.closest('.channel-item') || e.target.closest('.category-header')) return;
        e.preventDefault();
        setScrollContextMenu({ x: e.clientX, y: e.clientY });
      }}>
        <Category
          category={null} channels={safeChannels} team={team} teamId={team.id}
          currentChannelId={currentChannelId} onCreateChannel={handleCreateChannel}
          canManage={canManage} unreadChannels={unreadChannels}
          onEditChannel={handleOpenChannelSettings} onDeleteChannel={handleRequestDeleteChannel} onCopyChannelId={handleCopyChannelId}
          isChannelMuted={isChannelMuted} getChannelMuteKey={getChannelMuteKey} onMuteChannel={handleMuteChannel} onUnmuteChannel={handleUnmuteChannel}
          onChannelMove={canManage ? handleChannelMove : undefined}
          dragOverCategoryId={dragOverCategoryId} setDragOverCategoryId={setDragOverCategoryId}
          isMobile={isMobile} onActiveChannelClick={onActiveChannelClick}
          onVoiceJoinRequest={onVoiceJoinRequest}
          roles={roles} memberRolesMap={memberRolesMap} onRolesChanged={onRolesChanged}
          isOwner={isOwner} onKick={onKick} onBan={onBan}
        />

        {sortedCategories.map(category => (
          <Category
            key={category.id} category={category} channels={safeChannels} team={team} teamId={team.id}
            currentChannelId={currentChannelId} onCreateChannel={handleCreateChannel}
            onEditCategory={handleEditCategory} onDeleteCategory={handleDeleteCategory}
            canManage={canManage} unreadChannels={unreadChannels}
            onEditChannel={handleOpenChannelSettings} onDeleteChannel={handleRequestDeleteChannel} onCopyChannelId={handleCopyChannelId}
            isChannelMuted={isChannelMuted} getChannelMuteKey={getChannelMuteKey} onMuteChannel={handleMuteChannel} onUnmuteChannel={handleUnmuteChannel}
            onChannelMove={canManage ? handleChannelMove : undefined}
            dragOverCategoryId={dragOverCategoryId} setDragOverCategoryId={setDragOverCategoryId}
            isMobile={isMobile} onActiveChannelClick={onActiveChannelClick}
            onVoiceJoinRequest={onVoiceJoinRequest}
            roles={roles} memberRolesMap={memberRolesMap} onRolesChanged={onRolesChanged}
            isOwner={isOwner} onKick={onKick} onBan={onBan}
          />
        ))}

      </div>

      {isMobile && !hideUserPanel && (
        <MobileSidebarUserBar
          embedded
          notificationCount={notificationCount}
          isNotificationsActive={isNotificationsActive}
          onNotificationsClick={onMobileNotificationsClick}
          pendingFriendsCount={pendingFriendsCount}
        />
      )}
      </div>

      {scrollContextMenu && (
        <ContextMenu
          x={scrollContextMenu.x}
          y={scrollContextMenu.y}
          items={[
            {
              label: 'Create Channel',
              icon: <AppIcon name="plus" size={16} weight="bold" />,
              onClick: () => handleCreateChannel(null),
            },
            {
              label: 'Create Category',
              icon: <AppIcon name="archive" size={16} />,
              onClick: () => { setEditingCategory(null); setShowCategoryModal(true); },
            },
          ]}
          onClose={() => setScrollContextMenu(null)}
        />
      )}

      <ChannelModal
        isOpen={showChannelModal}
        onClose={() => { setShowChannelModal(false); setSelectedCategoryId(null); }}
        onSubmit={handleChannelSubmit}
        onError={(msg) => notify.error(msg)}
        teamId={team.id}
        categories={safeCategories}
        defaultCategoryId={selectedCategoryId}
      />

      {!isMobile && (
        <ChannelSettings
          isOpen={showChannelSettings}
          channel={settingsChannel}
          teamId={team.id}
          categories={safeCategories}
          onClose={() => { setShowChannelSettings(false); setSettingsChannel(null); }}
          onSave={handleChannelSettingsSave}
          onDelete={async (channelId) => {
            await onDeleteChannel?.(channelId);
            setShowChannelSettings(false);
            setSettingsChannel(null);
          }}
        />
      )}

      <CategoryModal
        isOpen={showCategoryModal}
        onClose={() => { setShowCategoryModal(false); setEditingCategory(null); }}
        onSubmit={editingCategory
          ? async (name) => {
              await servers.updateCategory(team.id, editingCategory.id, { name });
              onCategoriesChange?.(safeCategories.map(c => c && c.id === editingCategory.id ? { ...c, name } : c));
            }
          : handleCreateCategory
        }
        initialName={editingCategory?.name}
      />

      <ConfirmModal
        isOpen={!!deleteConfirm}
        title="Delete Channel"
        message={`Are you sure you want to delete #${deleteConfirm?.name}? This cannot be undone.`}
        confirmText="Delete Channel"
        cancelText="Cancel"
        type="danger"
        onConfirm={handleConfirmDeleteChannel}
        onCancel={() => setDeleteConfirm(null)}
      />
      <ConfirmModal
        isOpen={!!deleteCategoryConfirm}
        title="Delete Category"
        message={`Delete category "${deleteCategoryConfirm?.name || 'Category'}"? Channels in this category will be moved to uncategorized.`}
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
        onConfirm={handleConfirmDeleteCategory}
        onCancel={() => setDeleteCategoryConfirm(null)}
      />
    </div>
  );
}
