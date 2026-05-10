import React, { useState, useCallback, memo, useRef, useEffect, useMemo, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, Mic, MicOff, Headphones, HeadphoneOff, Monitor, PhoneOff } from 'lucide-react';
import { channels as channelsApi, servers } from '../api';
import { useLanguage } from '../context/LanguageContext';
import { useNotification } from '../context/NotificationContext';
import { useVoice, sameUserId, coercePositiveInt, getRemoteStreamForUser } from '../context/VoiceContext';
import { useSettings } from '../context/SettingsContext';
import { useMediaDevices } from '../hooks/useMediaDevices';
import { useModalEnterAnimation } from '../hooks/useModalEnterAnimation';
import { useCompactTouchUi } from '../hooks/useCompactTouchUi';
import { useAuth } from '../context/AuthContext';
import ConfirmModal from './ConfirmModal';
import ClickableAvatar from './ClickableAvatar';
import ChannelSettings from './ChannelSettings';
import ContextMenu from './ContextMenu';
import { ScreenShareVolumeControl } from './ScreenShareVolumeControl';
import './ChannelList.css';

const channelIcons = {
  text: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" opacity="0.7">
      <path d="M5.88657 21C5.57547 21 5.3399 20.7189 5.39427 20.4126L6.00001 17H2.59511C2.28449 17 2.04905 16.7198 2.10259 16.4138L2.27759 15.4138C2.31946 15.1746 2.52722 15 2.77011 15H6.35001L7.41001 9H4.00511C3.69449 9 3.45905 8.71977 3.51259 8.41381L3.68759 7.41381C3.72946 7.17456 3.93722 7 4.18011 7H7.76001L8.39677 3.41262C8.43914 3.17391 8.64664 3 8.88907 3H9.87344C10.1845 3 10.4201 3.28107 10.3657 3.58738L9.76001 7H15.76L16.3968 3.41262C16.4391 3.17391 16.6466 3 16.8891 3H17.8734C18.1845 3 18.4201 3.28107 18.3657 3.58738L17.76 7H21.1649C21.4755 7 21.711 7.28023 21.6574 7.58619L21.4824 8.58619C21.4406 8.82544 21.2328 9 20.9899 9H17.41L16.35 15H19.7549C20.0655 15 20.301 15.2802 20.2474 15.5862L20.0724 16.5862C20.0306 16.8254 19.8228 17 19.5799 17H16L15.3632 20.5874C15.3209 20.8261 15.1134 21 14.8709 21H13.8866C13.5755 21 13.3399 20.7189 13.3943 20.4126L14 17H8.00001L7.36325 20.5874C7.32088 20.8261 7.11337 21 6.87094 21H5.88657ZM9.41001 9L8.35001 15H14.35L15.41 9H9.41001Z" />
    </svg>
  ),
  voice: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" opacity="0.7">
      <path d="M11.383 3.07904C11.009 2.92504 10.579 3.01004 10.293 3.29604L6.586 7.00304H3C2.45 7.00304 2 7.45304 2 8.00304V16.003C2 16.553 2.45 17.003 3 17.003H6.586L10.293 20.71C10.579 20.996 11.009 21.082 11.383 20.927C11.757 20.772 12 20.407 12 20.003V4.00304C12 3.59904 11.757 3.23404 11.383 3.07904Z" />
      <path d="M14 9.00304C14 9.00304 16 10.003 16 12.003C16 14.003 14 15.003 14 15.003" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M17 7.00304C17 7.00304 20 9.00304 20 12.003C20 15.003 17 17.003 17 17.003" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  announcement: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" opacity="0.7">
      <path d="M3.9 8.26H2V15.2941H3.9V8.26Z" />
      <path d="M19.1 4V5.12659L4.85 8.26447V18.1176C4.85 18.5496 5.1464 18.9252 5.5701 19.0315L9.3701 19.9727C9.4461 19.9906 9.524 20 9.6 20C9.89545 20 10.1776 19.8468 10.3347 19.5765L12.0282 16.5741L19.1 18.2894V19.4H21V4H19.1ZM10.4112 17.9082L6.65 17.0576V16.1576L11.4476 17.2167L10.4112 17.9082ZM19.1 16.1374L5.85 13.0957V10.4898L19.1 7.27429V16.1374Z" />
    </svg>
  ),
  stage: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" opacity="0.7">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
    </svg>
  ),
  forum: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" opacity="0.7">
      <path d="M4.79805 3C3.80445 3 2.99805 3.8052 2.99805 4.8V15.6C2.99805 16.5936 3.80445 17.4 4.79805 17.4H7.49805V21L11.098 17.4H19.198C20.1924 17.4 20.998 16.5936 20.998 15.6V4.8C20.998 3.8052 20.1924 3 19.198 3H4.79805Z"/>
    </svg>
  ),
};

const ServerHeader = memo(function ServerHeader({ team, onOpenSettings, onInvite, onCreateChannel, onCreateCategory, onLeave }) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const { t } = useLanguage();

  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [dropdownOpen]);

  if (!team) return null;

  return (
    <div className="server-header" ref={dropdownRef}>
      <button className={`server-header-btn ${dropdownOpen ? 'open' : ''}`} onClick={() => setDropdownOpen(!dropdownOpen)}>
        <span className="server-header-name">{team.name}</span>
        {team?.boost_level > 0 && (
          <span className="boost-badge" title={`Server Boost Level ${team.boost_level}`}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8.47 3.812a3.5 3.5 0 0 1 7.06 0L17 8h3.5a1.5 1.5 0 0 1 1.064 2.56L18 14l1.054 4.209a1.5 1.5 0 0 1-2.256 1.636L12 17l-4.799 2.845a1.5 1.5 0 0 1-2.256-1.636L6 14 2.437 10.56A1.5 1.5 0 0 1 3.5 8H7l1.47-4.188Z"/>
            </svg>
            Level {team.boost_level}
          </span>
        )}
        {dropdownOpen ? (
          <svg className="server-header-chevron" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.4 4L12 10.4L5.6 4L4 5.6L10.4 12L4 18.4L5.6 20L12 13.6L18.4 20L20 18.4L13.6 12L20 5.6L18.4 4Z"/></svg>
        ) : (
          <svg className="server-header-chevron" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z" /></svg>
        )}
      </button>
      {dropdownOpen && (
        <div className="server-dropdown">
          <button className="server-dropdown-item accent" onClick={() => { onInvite?.(); setDropdownOpen(false); }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
            <span>{t('server.invitePeople') || 'Invite People'}</span>
          </button>
          <div className="server-dropdown-separator" />
          <button className="server-dropdown-item" onClick={() => { onOpenSettings?.(); setDropdownOpen(false); }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
            <span>{t('server.settings') || 'Server Settings'}</span>
          </button>
          <button className="server-dropdown-item" onClick={() => { onCreateChannel?.(); setDropdownOpen(false); }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
            <span>{t('server.createChannel') || 'Create Channel'}</span>
          </button>
          <button className="server-dropdown-item" onClick={() => { onCreateCategory?.(); setDropdownOpen(false); }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-1 8h-3v3h-2v-3h-3v-2h3V9h2v3h3v2z"/></svg>
            <span>{t('server.createCategory') || 'Create Category'}</span>
          </button>
          {team?.role !== 'owner' && (<>
          <div className="server-dropdown-separator" />
          <button className="server-dropdown-item danger" onClick={() => { onLeave?.(); setDropdownOpen(false); }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M10.09 15.59L11.5 17l5-5-5-5-1.41 1.41L12.67 11H3v2h9.67l-2.58 2.59zM19 3H5c-1.11 0-2 .9-2 2v4h2V5h14v14H5v-4H3v4c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/></svg>
            <span>{t('server.leave') || 'Leave Server'}</span>
          </button>
          </>)}
        </div>
      )}
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

const checkIcon = <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>;

const bellIcon = <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z"/></svg>;
const bellMutedIcon = <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 18.69L7.84 6.14 5.27 3.49 4 4.76l2.8 2.8v.01c-.52.99-.8 2.16-.8 3.42v5l-2 2v1h13.73l2 2L21 19.72l-1-1.03zM12 22c1.11 0 2-.89 2-2h-4c0 1.11.89 2 2 2zm6-7.32V11c0-3.08-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68c-.15.03-.29.08-.42.12-.1.03-.2.07-.3.11h-.01c-.01 0-.01 0-.02.01-.23.09-.46.2-.68.31 0 0-.01 0-.01.01L18 14.68z"/></svg>;

const ChannelContextMenu = memo(function ChannelContextMenu({ x, y, channel, teamId, onClose, canManage, onEdit, onDelete, onCopyId, isMuted, muteKey, onMute, onUnmute }) {
  const items = [];

  items.push(
    {
      label: 'Copy Link',
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>,
      onClick: () => {
        const link = `${window.location.origin}/team/${teamId}/channel/${channel.id}`;
        navigator.clipboard?.writeText(link).then(() => {}, () => {});
      },
    },
    {
      label: 'Copy Channel ID',
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>,
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
        label: 'Edit Channel',
        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>,
        onClick: () => onEdit?.(channel),
      },
      {
        label: 'Channel Settings',
        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58z"/></svg>,
        onClick: () => onEdit?.(channel),
      },
      { separator: true },
      {
        label: 'Delete Channel',
        danger: true,
        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>,
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
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>,
      onClick: () => onEdit?.(category),
    },
    {
      label: 'Create Channel',
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>,
      onClick: () => onCreate?.(category?.id),
    },
    { separator: true },
    {
      label: 'Delete Category',
      danger: true,
      icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>,
      onClick: () => onDelete?.(category),
    },
  ];
  return <ContextMenu x={x} y={y} items={items} onClose={onClose} />;
});

// ═══════════════════════════════════════════════════════════
// CATEGORY
// ═══════════════════════════════════════════════════════════
const Category = memo(function Category({
  category, channels, teamId, currentChannelId,
  onCreateChannel, onEditCategory, onDeleteCategory, canManage,
  unreadChannels, onEditChannel, onDeleteChannel, onCopyChannelId,
  isChannelMuted, getChannelMuteKey, onMuteChannel, onUnmuteChannel,
  onChannelMove, dragOverCategoryId, setDragOverCategoryId,
  isMobile, onActiveChannelClick,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [ctxMenu, setCtxMenu] = useState(null);
  const [dropIndicatorTop, setDropIndicatorTop] = useState(null);
  const [dropIndicatorPosition, setDropIndicatorPosition] = useState(null);
  const listRef = useRef(null);
  const targetCategoryId = category?.id ?? null;
  const { voiceChannelId } = useVoice();

  const handleContextMenu = (e) => {
    if (!canManage || !category) return;
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  };

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
        onContextMenu={handleContextMenu}
        onDragOver={handleCategoryHeaderDragOver}
        onDrop={handleCategoryHeaderDrop}
      >
        <span
          className={`collapse-arrow-wrap${collapsed ? ' is-collapsed' : ''}`}
          aria-hidden
        >
          <svg className="collapse-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              className="collapse-arrow-path"
              d="M6 9l6 6 6-6"
              stroke="currentColor"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className="category-name">{category?.name || 'CHANNELS'}</span>
        {canManage && (
          <button className="add-channel-btn" onClick={(e) => { e.stopPropagation(); onCreateChannel?.(category?.id); }} title="Create Channel">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
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
const VoiceUserItem = memo(function VoiceUserItem({ voiceUser, isSpeaking, isScreenSharing, stream, onLiveClick, channelId, teamId }) {
  const [showHoverPreview, setShowHoverPreview] = React.useState(false);
  const hoverTimeoutRef = React.useRef(null);
  const hideTimeoutRef = React.useRef(null);
  const itemRef = React.useRef(null);

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

  return (
    <div
      ref={itemRef}
      className={`voice-sidebar-user ${isSpeaking ? 'speaking' : ''} ${isScreenSharing ? 'has-live' : ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className={`voice-sidebar-avatar ${isSpeaking ? 'speaking' : ''}`}>
        <ClickableAvatar
          user={voiceUser}
          size="small"
          showPresence={false}
          position="right"
          contextMenuContext={{ channelId, teamId }}
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
      {voiceUser.muted && (
        <svg className="voice-sidebar-status muted" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
          <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
          <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      )}
      {voiceUser.deafened && (
        <svg className="voice-sidebar-status deafened" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 1c-4.97 0-9 4.03-9 9v7c0 1.66 1.34 3 3 3h3v-8H5v-2c0-3.87 3.13-7 7-7s7 3.13 7 7v2h-4v8h3c1.66 0 3-1.34 3-3v-7c0-4.97-4.03-9-9-9z"/>
          <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
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
  );
});

// ═══════════════════════════════════════════════════════════
// CHANNEL ITEM with context menu & hover actions
// ═══════════════════════════════════════════════════════════
const ChannelItem = memo(function ChannelItem({ channel, teamId, isActive, hasUnread, canManage, onEdit, onDelete, onCopyId, isMuted, muteKey, onMute, onUnmute, onChannelMove, onDragEnd, onDragOverAtPosition, categoryId, position, channelCount, dropIndicatorPosition, isDragOverCategory, isMobile, onActiveChannelClick }) {
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
      if ('vibrate' in navigator) {
        try { navigator.vibrate(12); } catch (_) { /* ignore */ }
      }
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

  const { voiceUsers, speakingUsers, voiceChannelId, remoteVideoStreams, screenSharingUserIds, isScreenSharing, ownScreenStream, setExpandedLiveView } = useVoice();
  const navigate = useNavigate();

  const channelVoiceUsers = isVoice
    ? (voiceUsers[channel.id] || voiceUsers[coercePositiveInt(channel.id)] || [])
    : [];
  const isConnected = isVoice && voiceChannelId === channel.id;

  const handleContextMenu = (e) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  };

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
    navigate(`/team/${teamId}/channel/${channel.id}`);
  };

  const showUnread = hasUnread && !isMuted;

  const channelLinkContent = (
    <>
      <span className="channel-icon">{icon}</span>
      {!!isPrivate && (
        <svg className="channel-lock" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" opacity="0.5">
          <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
        </svg>
      )}
      <span className="channel-name">{channel.name}</span>
      {!!channel.nsfw && <span className="channel-nsfw">18+</span>}
      {isMuted && (
        <svg className="channel-muted-icon" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" opacity="0.4">
          <path d="M20 18.69L7.84 6.14 5.27 3.49 4 4.76l2.8 2.8v.01c-.52.99-.8 2.16-.8 3.42v5l-2 2v1h13.73l2 2L21 19.72l-1-1.03zM12 22c1.11 0 2-.89 2-2h-4c0 1.11.89 2 2 2zm6-7.32V11c0-3.08-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68c-.15.03-.29.08-.42.12-.1.03-.2.07-.3.11h-.01c-.01 0-.01 0-.02.01-.23.09-.46.2-.68.31 0 0-.01 0-.01.01L18 14.68z"/>
        </svg>
      )}
      {showUnread && <span className="channel-unread-dot" />}
    </>
  );

  return (
    <li
      className={`channel-item ${isActive ? 'active' : ''} ${showUnread ? 'unread' : ''} ${isVoice ? 'voice-channel' : ''} ${isConnected ? 'voice-connected' : ''} ${canManage ? 'channel-item-draggable' : ''} ${isDragOverCategory && dropIndicatorPosition != null && position >= dropIndicatorPosition ? 'channel-item-shift-down' : ''}`}
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
          to={`/team/${teamId}/channel/${channel.id}`}
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
          onClick={(ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            const r = ev.currentTarget.getBoundingClientRect();
            setCtxMenu({ x: r.left, y: r.bottom + 4 });
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <circle cx="12" cy="5" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="12" cy="19" r="2" />
          </svg>
        </button>
      )}
      {canManage && (
        <div className="channel-actions">
          <button className="channel-action-btn" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onEdit?.(channel); }} title="Edit Channel">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58z"/></svg>
          </button>
        </div>
      )}
      {isVoice && channelVoiceUsers.length > 0 && (
        <div className="voice-sidebar-users">
          {channelVoiceUsers.map(u => (
            <VoiceUserItem
              key={u.id}
              voiceUser={u}
              isSpeaking={u.id != null && speakingUsers.has(String(u.id))}
              isScreenSharing={!!getRemoteStreamForUser(remoteVideoStreams, u.id) || screenSharingUserIds?.has?.(u.id) || (sameUserId(u.id, user?.id) && isScreenSharing)}
              stream={sameUserId(u.id, user?.id) ? ownScreenStream : getRemoteStreamForUser(remoteVideoStreams, u.id)}
              onLiveClick={() => setExpandedLiveView({ userId: u.id, displayName: u.display_name })}
              channelId={channel.id}
              teamId={teamId}
            />
          ))}
        </div>
      )}
      {ctxMenu && (
        <ChannelContextMenu
          x={ctxMenu.x} y={ctxMenu.y} channel={channel} teamId={teamId}
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
const ChannelModal = ({ isOpen, onClose, onSubmit, onError, teamId, categories, initialData, defaultCategoryId }) => {
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
      setName(initialData?.name || '');
      setType(initialData?.channel_type || 'text');
      const catId = initialData?.category_id ?? defaultCategoryId ?? '';
      setCategoryId(catId !== '' && catId != null ? String(catId) : '');
      setTopic(initialData?.topic || '');
      setIsPrivate(initialData?.is_private || false);
      setSlowmode(initialData?.slowmode_seconds || 0);
      setNsfw(initialData?.nsfw || false);
    }
  }, [isOpen, initialData, defaultCategoryId]);

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
          <h3>{initialData ? 'Edit Channel' : 'Create Channel'}</h3>
          <p className="channel-modal-sub">{initialData ? 'Update this channel\'s settings' : 'in ' + (categories?.find(c => String(c.id) === String(categoryId || ''))?.name || 'your server')}</p>
          <button className="modal-close-btn" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {!initialData && (
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
          )}

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
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" opacity="0.7"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
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
              {loading ? (initialData ? 'Saving...' : 'Creating...') : initialData ? 'Save Changes' : 'Create Channel'}
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
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
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
const MicIcon = ({ muted }) =>
  muted ? <MicOff size={18} strokeWidth={2} /> : <Mic size={18} strokeWidth={2} />;

const HeadphoneIcon = ({ deafened }) =>
  deafened ? <HeadphoneOff size={18} strokeWidth={2} /> : <Headphones size={18} strokeWidth={2} />;

export const VoiceStatusBar = memo(function VoiceStatusBar() {
  const { voiceChannelId, voiceChannelName, voiceConversationId, voiceConversationName, connectionState, isMuted, isDeafened, isScreenSharing, toggleMute, toggleDeafen, startScreenShare, stopScreenShare, leaveVoice, leaveVoiceDM, switchAudioInput, switchAudioOutput } = useVoice();
  const { settings } = useSettings();
  const { inputs, outputs } = useMediaDevices();
  const [openDropdown, setOpenDropdown] = useState(null);
  const [popoverRect, setPopoverRect] = useState(null);
  const [showVoiceDetails, setShowVoiceDetails] = useState(false);
  const [voiceStats, setVoiceStats] = useState({ ping: 0, avgPing: 0, packetLoss: 0, server: 'c-mxp03-ff-032875', pingHistory: [] });
  const voiceDetailsRef = useRef(null);
  const voiceDetailsTriggerRef = useRef(null);
  const [vdmPosition, setVdmPosition] = useState(null);
  const pingCanvasRef = useRef(null);
  const dropdownRef = useRef(null);
  const micGroupRef = useRef(null);
  const outputGroupRef = useRef(null);

  const isInVoice = voiceChannelId || voiceConversationId;
  const displayName = voiceChannelId ? (voiceChannelName || 'Voice Channel') : (voiceConversationName || 'DM Call');

  useLayoutEffect(() => {
    if (!openDropdown) {
      setPopoverRect(null);
      return;
    }
    const el = openDropdown === 'mic' ? micGroupRef.current : outputGroupRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      setPopoverRect({
        left: rect.left + rect.width / 2,
        bottom: window.innerHeight - rect.top + 20,
      });
    }
  }, [openDropdown]);

  useEffect(() => {
    const onClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

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
    if (voiceChannelId) {
      leaveVoice();
      window.dispatchEvent(new CustomEvent('slide:voice-channel-disconnect'));
    } else {
      leaveVoiceDM();
    }
  };

  return (
    <div className="voice-status-bar">
      <div className="vsb-info">
        <div className={`vsb-status${showVoiceDetails ? ' vsb-status--active' : ''}`} ref={voiceDetailsTriggerRef} onClick={() => setShowVoiceDetails(v => !v)} title={connectionState === 'connected' ? 'Secure connection — Voice is encrypted (DTLS-SRTP)' : connectionState === 'connecting' ? 'Establishing secure connection...' : 'Connection interrupted'}>
          <div className="vsb-status-cube">
            <div className="vsb-status-face vsb-status-face--front">
              <div className={`vsb-signal ${connectionState}`} />
              <span className="vsb-label">
                {connectionState === 'connecting' ? 'Connecting...' : 'Connected'}
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
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2z"/></svg>
                <span>End-to-end encrypted</span>
              </div>
            </div>,
            document.body
          )}
        </div>
        <span className="vsb-channel">{displayName}</span>
      </div>
      <div className="vsb-controls" ref={dropdownRef}>
        {/* Microphone — split: icon | chevron for device selection */}
        <div ref={micGroupRef} className="vsb-ctrl-group">
          <div className={`vsb-ctrl-split ${isMuted ? 'active' : ''}`}>
            <button className="vsb-ctrl-main" onClick={toggleMute} title={isMuted ? 'Unmute' : 'Mute'}>
              <MicIcon muted={isMuted} />
            </button>
            <span className="vsb-ctrl-divider" />
            <button className="vsb-ctrl-dropdown" onClick={() => setOpenDropdown(openDropdown === 'mic' ? null : 'mic')} title="Select microphone" data-open={openDropdown === 'mic'} aria-expanded={openDropdown === 'mic'}>
              <ChevronDown size={14} strokeWidth={2.5} />
            </button>
          </div>
          {openDropdown === 'mic' && popoverRect && createPortal(
            <div className="vsb-device-popover vsb-device-popover-portal" style={{ left: popoverRect.left, bottom: popoverRect.bottom, transform: 'translateX(-50%)' }}>
              {inputs.map((d) => (
                <button key={d.value} onClick={() => { switchAudioInput(d.value); setOpenDropdown(null); }} data-selected={settings?.input_device === d.value} title={d.label}>
                  {d.label}
                </button>
              ))}
            </div>,
            document.body
          )}
        </div>

        {/* Headphones — split: icon | chevron for device selection */}
        <div ref={outputGroupRef} className="vsb-ctrl-group">
          <div className={`vsb-ctrl-split ${isDeafened ? 'active' : ''}`}>
            <button className="vsb-ctrl-main" onClick={toggleDeafen} title={isDeafened ? 'Undeafen' : 'Deafen'}>
              <HeadphoneIcon deafened={isDeafened} />
            </button>
            <span className="vsb-ctrl-divider" />
            <button className="vsb-ctrl-dropdown" onClick={() => setOpenDropdown(openDropdown === 'output' ? null : 'output')} title="Select audio output" data-open={openDropdown === 'output'} aria-expanded={openDropdown === 'output'}>
              <ChevronDown size={14} strokeWidth={2.5} />
            </button>
          </div>
          {openDropdown === 'output' && popoverRect && createPortal(
            <div className="vsb-device-popover vsb-device-popover-portal" style={{ left: popoverRect.left, bottom: popoverRect.bottom, transform: 'translateX(-50%)' }}>
              {outputs.map((d) => (
                <button key={d.value} onClick={() => { switchAudioOutput(d.value); setOpenDropdown(null); }} data-selected={settings?.output_device === d.value} title={d.label}>
                  {d.label}
                </button>
              ))}
            </div>,
            document.body
          )}
        </div>

        {voiceChannelId && (
          <>
            <button
              className={`vsb-btn ${isScreenSharing ? 'active' : ''}`}
              onClick={isScreenSharing ? stopScreenShare : startScreenShare}
              title={isScreenSharing ? 'Arrêter le partage' : 'Partager l\'écran'}
            >
              <Monitor size={18} strokeWidth={2} />
            </button>
            <ScreenShareVolumeControl variant="vsb" />
          </>
        )}
        <button
          className="vsb-btn disconnect"
          onClick={handleDisconnect}
          title="Disconnect"
        >
          <PhoneOff size={18} strokeWidth={2} />
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
  canManage = false, unreadChannels,
  onEditChannel, onDeleteChannel,
  hideUserPanel = false,
  isMobile = false,
  onActiveChannelClick,
  width,
  onResizeStart,
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

  const handleOpenEditChannel = useCallback((channel) => {
    setSettingsChannel(channel);
    setShowChannelSettings(true);
  }, []);

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
  }, [team.id, safeChannels, selectedCategoryId, onChannelsChange]);

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
    <div className="channel-sidebar" style={width ? { width, minWidth: width } : undefined}>
      {onResizeStart && <div className="channel-sidebar-resize-handle" onMouseDown={onResizeStart} />}
      <ServerHeader
        team={team} onOpenSettings={onOpenSettings} onInvite={onInvite}
        onCreateChannel={() => handleCreateChannel(null)}
        onCreateCategory={() => { setEditingCategory(null); setShowCategoryModal(true); }}
        onLeave={onLeave}
      />

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
          category={null} channels={safeChannels} teamId={team.id}
          currentChannelId={currentChannelId} onCreateChannel={handleCreateChannel}
          canManage={canManage} unreadChannels={unreadChannels}
          onEditChannel={handleOpenEditChannel} onDeleteChannel={handleRequestDeleteChannel} onCopyChannelId={handleCopyChannelId}
          isChannelMuted={isChannelMuted} getChannelMuteKey={getChannelMuteKey} onMuteChannel={handleMuteChannel} onUnmuteChannel={handleUnmuteChannel}
          onChannelMove={canManage ? handleChannelMove : undefined}
          dragOverCategoryId={dragOverCategoryId} setDragOverCategoryId={setDragOverCategoryId}
          isMobile={isMobile} onActiveChannelClick={onActiveChannelClick}
        />

        {sortedCategories.map(category => (
          <Category
            key={category.id} category={category} channels={safeChannels} teamId={team.id}
            currentChannelId={currentChannelId} onCreateChannel={handleCreateChannel}
            onEditCategory={handleEditCategory} onDeleteCategory={handleDeleteCategory}
            canManage={canManage} unreadChannels={unreadChannels}
            onEditChannel={handleOpenEditChannel} onDeleteChannel={handleRequestDeleteChannel} onCopyChannelId={handleCopyChannelId}
            isChannelMuted={isChannelMuted} getChannelMuteKey={getChannelMuteKey} onMuteChannel={handleMuteChannel} onUnmuteChannel={handleUnmuteChannel}
            onChannelMove={canManage ? handleChannelMove : undefined}
            dragOverCategoryId={dragOverCategoryId} setDragOverCategoryId={setDragOverCategoryId}
            isMobile={isMobile} onActiveChannelClick={onActiveChannelClick}
          />
        ))}

      </div>

      {scrollContextMenu && (
        <ContextMenu
          x={scrollContextMenu.x}
          y={scrollContextMenu.y}
          items={[
            {
              label: 'Create Channel',
              icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>,
              onClick: () => handleCreateChannel(null),
            },
            {
              label: 'Create Category',
              icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z"/></svg>,
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
        initialData={null}
        defaultCategoryId={selectedCategoryId}
      />

      <ChannelSettings
        isOpen={showChannelSettings}
        channel={settingsChannel}
        teamId={team.id}
        categories={safeCategories}
        onClose={() => { setShowChannelSettings(false); setSettingsChannel(null); }}
        onSave={handleChannelSettingsSave}
      />

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
