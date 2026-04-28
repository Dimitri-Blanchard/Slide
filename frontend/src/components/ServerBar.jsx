import React, { useState, useCallback, memo, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Bell, BellOff } from 'lucide-react';
import { AvatarImg } from './Avatar';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { teams as teamsApi, servers as serversApi, friends as friendsApi, direct as directApi } from '../api';
import CreateServerModal from './CreateServerModal';
import CreateYourServerModal from './CreateYourServerModal';
import DiscoverServersModal from './DiscoverServersModal';
import InviteModal from './InviteModal';
import { ShareInviteModal } from './InviteModal';
import ContextMenu from './ContextMenu';
import ConfirmModal from './ConfirmModal';
import './ServerBar.css';

const MUTED_SERVERS_KEY = 'slide_muted_servers';
const SERVER_ORDER_KEY = 'slide_server_order';

function getMutedServers() {
  try {
    const s = localStorage.getItem(MUTED_SERVERS_KEY);
    return s ? JSON.parse(s) : [];
  } catch {
    return [];
  }
}

function toggleMutedServer(teamId) {
  const ids = getMutedServers();
  const id = parseInt(teamId, 10);
  const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
  localStorage.setItem(MUTED_SERVERS_KEY, JSON.stringify(next));
  return next;
}

function getServerOrder() {
  try {
    const s = localStorage.getItem(SERVER_ORDER_KEY);
    return s ? JSON.parse(s) : [];
  } catch {
    return [];
  }
}

function setServerOrder(teamIds) {
  try {
    localStorage.setItem(SERVER_ORDER_KEY, JSON.stringify(teamIds));
  } catch (e) {
    console.warn('Failed to save server order:', e);
  }
}

// Floating invite-friends panel — hover flyout (like "Another account") or click-triggered
const InviteFriendsPanel = ({ team, friends, position, onClose, onInvite, sentIds, asFlyout, panelRef: externalRef, onMouseEnter, onMouseLeave }) => {
  const internalRef = useRef(null);
  const panelRef = externalRef || internalRef;
  const [pos, setPos] = useState(() => {
    if (asFlyout && position?.menuRect) {
      const mr = position.menuRect;
      return { x: mr.right + 8, y: mr.top };
    }
    return { x: (position?.x ?? 0) + 8, y: position?.y ?? 0 };
  });

  useEffect(() => {
    if (asFlyout && position?.menuRect) {
      const mr = position.menuRect;
      let x = mr.right + 8;
      let y = mr.top;
      setPos({ x, y });
      const raf = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (panelRef.current) {
            const rect = panelRef.current.getBoundingClientRect();
            let ax = x, ay = y;
            if (x + rect.width > window.innerWidth - 8) ax = mr.left - rect.width - 8;
            if (y + rect.height > window.innerHeight - 8) ay = window.innerHeight - rect.height - 8;
            setPos({ x: Math.max(8, ax), y: Math.max(8, ay) });
          }
        });
      });
      return () => cancelAnimationFrame(raf);
    } else if (!asFlyout && position) {
      let x = (position.x ?? 0) + 8;
      let y = position.y ?? 0;
      setPos({ x, y });
    }
  }, [position, asFlyout]);

  return createPortal(
    <>
      {!asFlyout && <div className="ifp-backdrop" onClick={onClose} />}
      <div
        className={`ifp-panel ${asFlyout ? 'ifp-panel--flyout' : ''}`}
        ref={panelRef}
        style={{ left: pos.x, top: pos.y }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <div className="ifp-header">
          <div>
            <div className="ifp-title">Inviter dans</div>
            <div className="ifp-server-name">{team.name}</div>
          </div>
          <button className="ifp-close" onClick={onClose} aria-label="Fermer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.4 4L12 10.4L5.6 4L4 5.6L10.4 12L4 18.4L5.6 20L12 13.6L18.4 20L20 18.4L13.6 12L20 5.6L18.4 4Z"/>
            </svg>
          </button>
        </div>
        {friends.length === 0 ? (
          <div className="ifp-empty">Aucun ami pour l'instant</div>
        ) : (
          <div className="ifp-list">
            {friends.map(f => {
              const sent = sentIds.has(f.id);
              const initial = (f.display_name || f.username || '?').charAt(0).toUpperCase();
              return (
                <div key={f.id} className="ifp-friend">
                  <div className="ifp-avatar">
                    {f.avatar_url
                      ? <img src={f.avatar_url} alt={f.display_name || f.username} />
                      : <span>{initial}</span>}
                  </div>
                  <div className="ifp-info">
                    <div className="ifp-name">{f.display_name || f.username}</div>
                    {f.username && f.username !== f.display_name && (
                      <div className="ifp-username">@{f.username}</div>
                    )}
                  </div>
                  <button
                    className={`ifp-invite-btn${sent ? ' sent' : ''}`}
                    onClick={() => !sent && onInvite(f)}
                    disabled={sent}
                  >
                    {sent ? 'Envoyé ✓' : 'Inviter'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>,
    document.body
  );
};

// Portal tooltip - renders at document.body level to avoid overflow clipping
const ServerBarTooltip = ({ text, anchorRef }) => {
  const [pos, setPos] = useState(null);

  useEffect(() => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setPos({
      top: rect.top + rect.height / 2,
      left: rect.right + 12,
    });
  }, []); // run once on mount — anchor is already in DOM when tooltip mounts

  if (!pos || !text) return null;

  return createPortal(
    <div
      className="server-tooltip-portal"
      style={{ top: pos.top, left: pos.left }}
    >
      {text}
    </div>,
    document.body
  );
};

// Server icon component with avatar or initials
const ServerIcon = memo(function ServerIcon({ team, isActive, hasUnread = false, mentionCount = 0, isMuted = false, onContextMenu, onDragStart, onDragOver, onDrop, onDragLeave, onDragEnd, isDragOver, isDragging, hideTooltip = false }) {
  const navigate = useNavigate();
  const didDragRef = useRef(false);
  const [hovered, setHovered] = useState(false);
  const tooltipRef = useRef(null);
  // Get initials from server name (max 2 chars)
  const getInitials = (name) => {
    if (!name) return '?';
    const words = name.trim().split(/\s+/);
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const initials = getInitials(team.name);
  const hasAvatar = team.avatar_url || team.icon_url;
  // Display mention count: max "9+"
  const displayMentionCount = mentionCount > 9 ? '9+' : mentionCount;
  const showUnread = hasUnread && !isMuted;
  const showMention = mentionCount > 0 && !isActive && !isMuted;

  const handleContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu?.(e, team);
  };

  const handleDragStart = (e) => {
    didDragRef.current = true;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(team.id));
    e.dataTransfer.setData('application/x-slide-server-id', String(team.id));
    onDragStart?.(team.id);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    onDragOver?.(team.id);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData('application/x-slide-server-id');
    if (sourceId) onDrop?.(parseInt(sourceId, 10), team.id);
    onDragLeave?.();
  };

  const handleDragLeave = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) onDragLeave?.();
  };

  const canDrag = !!onDragStart;
  const itemClasses = [
    'server-item',
    isDragOver ? 'server-item-drag-over' : '',
    isDragging ? 'server-item-dragging' : '',
  ].filter(Boolean).join(' ');

  return (
    <li
      className={itemClasses}
      onContextMenu={handleContextMenu}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      ref={tooltipRef}
    >
      <div
        className="server-drag-wrapper"
        draggable={canDrag}
        onDragStart={canDrag ? handleDragStart : undefined}
        onDragOver={canDrag ? handleDragOver : undefined}
        onDrop={canDrag ? handleDrop : undefined}
        onDragEnd={canDrag ? (() => { didDragRef.current = false; onDragEnd?.(); }) : undefined}
        onDragLeave={canDrag ? handleDragLeave : undefined}
        onClick={() => {
          if (didDragRef.current) {
            didDragRef.current = false;
            return;
          }
          navigate(`/team/${team.id}`);
        }}
        role="link"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            navigate(`/team/${team.id}`);
          }
        }}
      >
        <div
          className={`server-icon-link ${isActive ? 'active' : ''}`}
          title={team.name}
          style={{ pointerEvents: 'none' }}
        >
          <div 
            className={`server-icon ${isActive ? 'active' : ''} ${isMuted ? 'muted' : ''}`}
          >
            {hasAvatar ? (
              <AvatarImg src={team.avatar_url || team.icon_url} alt={team.name} />
            ) : (
              <span className="server-initials">{initials}</span>
            )}
          </div>
          {/* Active indicator pill (left side) - white for unread messages */}
          <div className={`server-indicator ${isActive ? 'active' : showUnread ? 'unread' : ''}`} />
          {/* Mention badge (red, bottom right) - only for @ mentions */}
          {showMention && (
            <span className="server-badge mention">{displayMentionCount}</span>
          )}
          {/* Muted indicator */}
          {isMuted && (
            <span className="server-badge muted" title="Notifications masquées">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
              </svg>
            </span>
          )}
        </div>
      </div>
      {!hideTooltip && hovered && <ServerBarTooltip text={team.name} anchorRef={tooltipRef} />}
    </li>
  );
});

// Home button (DMs)
const HomeButton = memo(function HomeButton({ isActive, onContextMenu }) {
  const { t } = useLanguage();
  const [hovered, setHovered] = useState(false);
  const tooltipRef = useRef(null);

  const handleContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu?.(e);
  };

  return (
    <li
      className="server-item home-item"
      onContextMenu={handleContextMenu}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      ref={tooltipRef}
    >
      <Link
        to="/channels/@me"
        className={`server-icon-link ${isActive ? 'active' : ''}`}
        title={t('sidebar.directMessages')}
      >
        <div className={`server-icon home-icon ${isActive ? 'active' : ''}`}>
          <img src="/logo.png" alt="Slide" className="home-logo" />
        </div>
        <div className={`server-indicator ${isActive ? 'active' : ''}`} />
      </Link>
      {hovered && <ServerBarTooltip text={t('sidebar.directMessages')} anchorRef={tooltipRef} />}
    </li>
  );
});

// Add server button - opens Create Your Server hub modal
const AddServerButton = memo(function AddServerButton({ onClick }) {
  const [hovered, setHovered] = useState(false);
  const tooltipRef = useRef(null);

  return (
    <li
      className="server-item add-item"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      ref={tooltipRef}
    >
      <button
        type="button"
        className="server-icon-link add-server-btn"
        onClick={onClick}
        title="Add or join a server"
      >
        <div className="server-icon add-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
          </svg>
        </div>
      </button>
      {hovered && <ServerBarTooltip text="Créer un serveur" anchorRef={tooltipRef} />}
    </li>
  );
});

// Discover communities button - navigates to full-screen community page
const DiscoverButton = memo(function DiscoverButton() {
  const { pathname } = useLocation();
  const { t } = useLanguage();
  const [hovered, setHovered] = useState(false);
  const tooltipRef = useRef(null);
  const isActive = pathname === '/community' || pathname.startsWith('/community/');

  return (
    <li
      className="server-item discover-item"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      ref={tooltipRef}
    >
      <Link
        to="/community"
        className={`server-icon-link discover-server-btn${isActive ? ' active' : ''}`}
        title={t('sidebar.discover') || 'Explore Communities'}
      >
        <div className={`server-icon discover-icon ${isActive ? 'active' : ''}`}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
          </svg>
        </div>
        <div className={`server-indicator ${isActive ? 'active' : ''}`} />
      </Link>
      {hovered && <ServerBarTooltip text={t('sidebar.discover') || 'Explore Communities'} anchorRef={tooltipRef} />}
    </li>
  );
});

const ServerBar = memo(function ServerBar({
  teams,
  currentTeamId,
  currentConversationId,
  onTeamsChange,
  onLeaveServer,
  isMobile = false,
}) {
  const [showHubModal, setShowHubModal] = useState(false);
  const [showCreateServer, setShowCreateServer] = useState(false);
  const [friendsList, setFriendsList] = useState([]);
  const [invitePanelData, setInvitePanelData] = useState(null);
  const [inviteSentIds, setInviteSentIds] = useState(new Set());
  const [createServerTemplate, setCreateServerTemplate] = useState(null);
  const [showJoinServer, setShowJoinServer] = useState(false);
  const [showDiscoverServers, setShowDiscoverServers] = useState(false);
  const [hubExiting, setHubExiting] = useState(false);
  const [createExiting, setCreateExiting] = useState(false);
  const [joinExiting, setJoinExiting] = useState(false);
  const [discoverExiting, setDiscoverExiting] = useState(false);
  const transitionRef = useRef(null);
  const serverBarRef = useRef(null);
  const [serverContextMenu, setServerContextMenu] = useState(null);
  const [homeContextMenu, setHomeContextMenu] = useState(null);
  const [inviteTeam, setInviteTeam] = useState(null);
  const [leaveConfirmTeam, setLeaveConfirmTeam] = useState(null);
  const [mutedServers, setMutedServers] = useState(getMutedServers);
  const mutedServersSet = useMemo(() => new Set(mutedServers.map(Number)), [mutedServers]);
  const [dragOverId, setDragOverId] = useState(null);
  const [draggedId, setDraggedId] = useState(null);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user } = useAuth();
  const { notify } = useNotification();
  const { t } = useLanguage();

  const closeServerContextMenu = useCallback(() => {
    setServerContextMenu(null);
    setInvitePanelData(null);
  }, []);

  const inviteFlyoutRef = useRef(null);
  const inviteFlyoutHideTimeoutRef = useRef(null);
  const FLYOUT_DELAY = 150;

  const handleInviteFlyoutHover = useCallback((item, show, menuRect) => {
    if (inviteFlyoutHideTimeoutRef.current) {
      clearTimeout(inviteFlyoutHideTimeoutRef.current);
      inviteFlyoutHideTimeoutRef.current = null;
    }
    const team = item?.flyoutData?.team || serverContextMenu?.team;
    if (show && team && menuRect) {
      setInviteSentIds(new Set());
      setInvitePanelData({
        team,
        menuRect,
        asFlyout: true,
      });
    } else {
      inviteFlyoutHideTimeoutRef.current = setTimeout(() => {
        setInvitePanelData(null);
        inviteFlyoutHideTimeoutRef.current = null;
      }, FLYOUT_DELAY);
    }
  }, [serverContextMenu]);

  const handleInviteFlyoutEnter = useCallback(() => {
    if (inviteFlyoutHideTimeoutRef.current) {
      clearTimeout(inviteFlyoutHideTimeoutRef.current);
      inviteFlyoutHideTimeoutRef.current = null;
    }
  }, []);

  const handleInviteFlyoutLeave = useCallback(() => {
    inviteFlyoutHideTimeoutRef.current = setTimeout(() => {
      setInvitePanelData(null);
      inviteFlyoutHideTimeoutRef.current = null;
    }, FLYOUT_DELAY);
  }, []);

  useEffect(() => {
    return () => {
      if (inviteFlyoutHideTimeoutRef.current) clearTimeout(inviteFlyoutHideTimeoutRef.current);
    };
  }, []);

  const handleServerContextMenu = useCallback((e, team) => {
    setServerContextMenu({ team, x: e.clientX, y: e.clientY });
    friendsApi.list().then((list) => setFriendsList(list || [])).catch(() => {});
  }, []);

  const handleHomeContextMenu = useCallback((e) => {
    setHomeContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const handleInvite = useCallback((team) => {
    closeServerContextMenu();
    setInviteTeam(team);
  }, [closeServerContextMenu]);

  const handleOpenSettings = useCallback((team) => {
    closeServerContextMenu();
    navigate(`/team/${team.id}`);
  }, [closeServerContextMenu, navigate]);

  const handleToggleMute = useCallback((team) => {
    toggleMutedServer(String(team.id));
    setMutedServers(getMutedServers());
  }, []);

  const handleOpenInvitePanel = useCallback((team, position) => {
    closeServerContextMenu();
    setInviteSentIds(new Set());
    setInvitePanelData({ team, position });
  }, [closeServerContextMenu]);

  const handleInviteFriendFromPanel = useCallback(async (team, friend) => {
    try {
      const invite = await serversApi.createInvite(team.id, { maxUses: 1 });
      const conv = await directApi.createConversation(friend.id);
      const convId = conv?.id ?? conv?.conversation_id;
      await directApi.sendMessage(convId, `${window.location.origin}/invite/${invite.code || invite.invite_code}`);
      setInviteSentIds(prev => new Set([...prev, friend.id]));
      notify.success(`Invitation envoyée à ${friend.display_name || friend.username}`);
    } catch (err) {
      notify.error(err?.message || 'Erreur lors de l\'envoi de l\'invitation');
    }
  }, [notify]);

  const handleLeaveClick = useCallback((team) => {
    closeServerContextMenu();
    if (team?.role === 'owner') {
      notify.error(t('server.ownerCannotLeave') || 'You are the owner of this server. Go to Server Settings to delete it.');
      return;
    }
    setLeaveConfirmTeam(team);
  }, [closeServerContextMenu, user?.id, notify, t]);

  const handleConfirmLeave = useCallback(async () => {
    const team = leaveConfirmTeam;
    setLeaveConfirmTeam(null);
    if (!team || !user?.id || !onLeaveServer) return;
    try {
      await teamsApi.removeMember(team.id, user.id);
      onLeaveServer(team.id);
    } catch (err) {
      notify.error(err?.message || 'Erreur');
    }
  }, [leaveConfirmTeam, user?.id, onLeaveServer, notify]);

  const ctxTeam = serverContextMenu?.team;
  const canManageServerFromList =
    ctxTeam?.can_manage_server === true ||
    ctxTeam?.role === 'owner' ||
    ctxTeam?.role === 'admin';

  const serverMenuItems = serverContextMenu ? [
    {
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
        </svg>
      ),
      label: t('server.invitePeople') || 'Inviter des gens',
      hoverFlyout: true,
      flyoutData: { team: serverContextMenu.team },
      onClick: () => {
        closeServerContextMenu();
        setInvitePanelData(null);
        setInviteTeam(serverContextMenu.team);
      },
    },
    { separator: true },
    ...(canManageServerFromList
      ? [
          {
            icon: (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
              </svg>
            ),
            label: t('server.settings') || 'Paramètres du serveur',
            onClick: () => handleOpenSettings(serverContextMenu.team),
          },
        ]
      : []),
    {
      icon: mutedServersSet.has(Number(serverContextMenu.team.id)) ? (
        <Bell size={16} strokeWidth={2} aria-hidden />
      ) : (
        <BellOff size={16} strokeWidth={2} aria-hidden />
      ),
      label: mutedServersSet.has(Number(serverContextMenu.team.id))
        ? (t('server.unmuteServer') || 'Afficher les notifications')
        : (t('server.muteServer') || 'Masquer les notifications'),
      onClick: () => handleToggleMute(serverContextMenu.team),
    },
    ...(serverContextMenu.team?.role === 'owner' ? [] : [
      { separator: true },
      {
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M10.09 15.59L11.5 17l5-5-5-5-1.41 1.41L12.67 11H3v2h9.67l-2.58 2.59zM19 3H5c-1.11 0-2 .9-2 2v4h2V5h14v14H5v-4H3v4c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/>
          </svg>
        ),
        label: t('server.leaveServer') || 'Quitter le serveur',
        onClick: () => handleLeaveClick(serverContextMenu.team),
        danger: true,
      },
    ]),
  ] : [];

  // Home (logo) is active for DMs — not when browsing /community (discover button owns that)
  const isCommunityRoute = pathname === '/community' || pathname.startsWith('/community/');
  const isHomeActiveBase = !currentTeamId && !currentConversationId?.startsWith?.('team');
  const homeButtonActive = !isCommunityRoute && (isHomeActiveBase || !!currentConversationId);

  // Sort teams by saved order (new teams at end)
  const sortedTeams = useMemo(() => {
    const list = teams || [];
    if (list.length <= 1) return list;
    const order = getServerOrder();
    const teamIds = new Set(list.map((t) => Number(t.id)));
    if (!order.length) return list;
    const ordered = order.filter((id) => teamIds.has(id)).map((id) => list.find((x) => Number(x.id) === id)).filter(Boolean);
    const remaining = list.filter((t) => !order.includes(Number(t.id)));
    return [...ordered, ...remaining];
  }, [teams]);

  // Clean saved order when user leaves servers
  useEffect(() => {
    const list = teams || [];
    if (list.length === 0) return;
    const order = getServerOrder();
    const teamIds = new Set(list.map((t) => Number(t.id)));
    const cleaned = order.filter((id) => teamIds.has(id));
    if (cleaned.length !== order.length) setServerOrder(cleaned);
  }, [teams]);

  const handleServerDragStart = useCallback((teamId) => setDraggedId(teamId), []);
  const handleServerDragOver = useCallback((teamId) => setDragOverId(teamId), []);
  const handleServerDragLeave = useCallback(() => setDragOverId(null), []);
  const handleServerDragEnd = useCallback(() => {
    setDraggedId(null);
    setDragOverId(null);
  }, []);
  const handleServerDrop = useCallback(
    (sourceId, targetId) => {
      setDragOverId(null);
      setDraggedId(null);
      if (sourceId === targetId) return;
      const list = [...(teams || [])];
      const si = list.findIndex((t) => Number(t.id) === Number(sourceId));
      const ti = list.findIndex((t) => Number(t.id) === Number(targetId));
      if (si === -1 || ti === -1) return;
      const [removed] = list.splice(si, 1);
      const newTi = list.findIndex((t) => Number(t.id) === Number(targetId));
      list.splice(newTi >= 0 ? newTi : list.length, 0, removed);
      const newOrder = list.map((t) => Number(t.id));
      setServerOrder(newOrder);
      onTeamsChange?.(list);
    },
    [teams, onTeamsChange]
  );

  const MODAL_TRANSITION_MS = 250;

  const closeHubWithTransition = useCallback(() => {
    if (hubExiting) return;
    if (transitionRef.current) clearTimeout(transitionRef.current);
    setHubExiting(true);
    transitionRef.current = setTimeout(() => {
      setShowHubModal(false);
      setHubExiting(false);
      transitionRef.current = null;
    }, MODAL_TRANSITION_MS);
  }, [hubExiting]);

  const transitionHubToCreate = useCallback((template) => {
    if (hubExiting) return;
    if (transitionRef.current) clearTimeout(transitionRef.current);
    setHubExiting(true);
    setCreateServerTemplate(template);
    setShowCreateServer(true);
    transitionRef.current = setTimeout(() => {
      setShowHubModal(false);
      setHubExiting(false);
      transitionRef.current = null;
    }, MODAL_TRANSITION_MS);
  }, [hubExiting]);

  const transitionHubToJoin = useCallback(() => {
    if (hubExiting) return;
    if (transitionRef.current) clearTimeout(transitionRef.current);
    setHubExiting(true);
    setShowJoinServer(true);
    transitionRef.current = setTimeout(() => {
      setShowHubModal(false);
      setHubExiting(false);
      transitionRef.current = null;
    }, MODAL_TRANSITION_MS);
  }, [hubExiting]);

  const transitionCreateToHub = useCallback(() => {
    if (createExiting) return;
    if (transitionRef.current) clearTimeout(transitionRef.current);
    setCreateExiting(true);
    setShowHubModal(true);
    transitionRef.current = setTimeout(() => {
      setShowCreateServer(false);
      setCreateServerTemplate(null);
      setCreateExiting(false);
      transitionRef.current = null;
    }, MODAL_TRANSITION_MS);
  }, [createExiting]);

  const transitionJoinToHub = useCallback(() => {
    if (joinExiting) return;
    if (transitionRef.current) clearTimeout(transitionRef.current);
    setJoinExiting(true);
    setShowHubModal(true);
    transitionRef.current = setTimeout(() => {
      setShowJoinServer(false);
      setJoinExiting(false);
      transitionRef.current = null;
    }, MODAL_TRANSITION_MS);
  }, [joinExiting]);

  const transitionHubToDiscover = useCallback(() => {
    if (hubExiting) return;
    if (transitionRef.current) clearTimeout(transitionRef.current);
    setHubExiting(true);
    setShowDiscoverServers(true);
    transitionRef.current = setTimeout(() => {
      setShowHubModal(false);
      setHubExiting(false);
      transitionRef.current = null;
    }, MODAL_TRANSITION_MS);
  }, [hubExiting]);

  const transitionDiscoverToHub = useCallback(() => {
    if (discoverExiting) return;
    if (transitionRef.current) clearTimeout(transitionRef.current);
    setDiscoverExiting(true);
    setShowHubModal(true);
    transitionRef.current = setTimeout(() => {
      setShowDiscoverServers(false);
      setDiscoverExiting(false);
      transitionRef.current = null;
    }, MODAL_TRANSITION_MS);
  }, [discoverExiting]);

  const closeCreateWithTransition = useCallback(() => {
    if (createExiting) return;
    if (transitionRef.current) clearTimeout(transitionRef.current);
    setCreateExiting(true);
    transitionRef.current = setTimeout(() => {
      setShowCreateServer(false);
      setCreateServerTemplate(null);
      setCreateExiting(false);
      transitionRef.current = null;
    }, MODAL_TRANSITION_MS);
  }, [createExiting]);

  useEffect(() => {
    return () => {
      if (transitionRef.current) clearTimeout(transitionRef.current);
    };
  }, []);

  return (
    <aside
      ref={serverBarRef}
      className="server-bar"
      data-tour-id="tour-servers"
    >
      <nav className="server-bar-nav">
        {/* Home (DMs) button */}
        <ul className="server-list home-section">
          <HomeButton isActive={homeButtonActive} onContextMenu={handleHomeContextMenu} />
        </ul>

        {/* Separator */}
        <div className="server-separator" />

        {/* Server list + add/discover (same column, scrolls together — last rows look like server slots) */}
        <ul className="server-list servers-section">
          {sortedTeams.map((team) => (
            <ServerIcon
              key={team.id}
              team={team}
              isActive={currentTeamId === String(team.id)}
              hasUnread={team.has_unread || team.unread_count > 0}
              mentionCount={team.mention_count || 0}
              isMuted={mutedServersSet.has(Number(team.id))}
              onContextMenu={handleServerContextMenu}
              onDragStart={handleServerDragStart}
              onDragOver={handleServerDragOver}
              onDrop={handleServerDrop}
              onDragLeave={handleServerDragLeave}
              onDragEnd={handleServerDragEnd}
              isDragOver={dragOverId === team.id}
              isDragging={draggedId === team.id}
              hideTooltip={isMobile}
            />
          ))}
          <AddServerButton onClick={() => setShowHubModal(true)} />
          <DiscoverButton />
        </ul>
      </nav>

      {/* Create Your Server hub modal */}
      <CreateYourServerModal
        isOpen={showHubModal}
        onClose={closeHubWithTransition}
        onCreateServer={transitionHubToCreate}
        onJoinServer={transitionHubToJoin}
        onDiscoverServers={transitionHubToDiscover}
        exiting={hubExiting}
      />

      {/* Create Server Modal */}
      <CreateServerModal
        isOpen={showCreateServer}
        onClose={closeCreateWithTransition}
        onServerCreated={(team) => {
          onTeamsChange?.([...(teams || []), team]);
          navigate(`/team/${team.id}`);
        }}
        initialTemplate={createServerTemplate}
        onBackToHub={transitionCreateToHub}
        exiting={createExiting}
      />

      {/* Join Server Modal */}
      <InviteModal
        isOpen={showJoinServer}
        onClose={() => setShowJoinServer(false)}
        onBack={transitionJoinToHub}
        onServerJoined={(team) => {
          onTeamsChange?.([...(teams || []), team]);
        }}
        exiting={joinExiting}
      />

      {/* Discover Servers Modal */}
      <DiscoverServersModal
        isOpen={showDiscoverServers}
        onClose={() => setShowDiscoverServers(false)}
        onBack={transitionDiscoverToHub}
        onServerJoined={(team) => {
          onTeamsChange?.([...(teams || []), team]);
        }}
        exiting={discoverExiting}
      />

      {/* Share Invite Modal (from context menu) */}
      <ShareInviteModal
        isOpen={!!inviteTeam}
        onClose={() => setInviteTeam(null)}
        team={inviteTeam}
      />

      {/* Leave Server Confirm */}
      <ConfirmModal
        isOpen={!!leaveConfirmTeam}
        title={t('server.leaveServer') || 'Quitter le serveur'}
        message={t('server.leaveServerConfirm') || 'Voulez-vous vraiment quitter ce serveur ?'}
        confirmText={t('server.leaveServer') || 'Quitter le serveur'}
        cancelText={t('common.cancel') || 'Annuler'}
        type="danger"
        onConfirm={handleConfirmLeave}
        onCancel={() => setLeaveConfirmTeam(null)}
      />

      {/* Server context menu */}
      {serverContextMenu && (
        <ContextMenu
          x={serverContextMenu.x}
          y={serverContextMenu.y}
          items={serverMenuItems}
          onClose={closeServerContextMenu}
          onHoverFlyout={handleInviteFlyoutHover}
          ignoreClickRefs={invitePanelData?.asFlyout ? [inviteFlyoutRef] : []}
        />
      )}

      {/* Invite Friends Panel — opens on hover of "Inviter des gens" (like Another account) */}
      {invitePanelData && (
        <InviteFriendsPanel
          team={invitePanelData.team}
          friends={friendsList}
          position={invitePanelData.asFlyout ? { menuRect: invitePanelData.menuRect } : { x: invitePanelData.position?.x ?? serverContextMenu?.x, y: invitePanelData.position?.y ?? serverContextMenu?.y }}
          onClose={() => setInvitePanelData(null)}
          onInvite={(f) => handleInviteFriendFromPanel(invitePanelData.team, f)}
          sentIds={inviteSentIds}
          asFlyout={invitePanelData.asFlyout}
          panelRef={inviteFlyoutRef}
          onMouseEnter={invitePanelData.asFlyout ? handleInviteFlyoutEnter : undefined}
          onMouseLeave={invitePanelData.asFlyout ? handleInviteFlyoutLeave : undefined}
        />
      )}

      {/* Home context menu */}
      {homeContextMenu && (
        <ContextMenu
          x={homeContextMenu.x}
          y={homeContextMenu.y}
          items={[
            {
              icon: (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
                </svg>
              ),
              label: t('sidebar.directMessages') || 'Messages directs',
              onClick: () => {
                setHomeContextMenu(null);
                navigate('/channels/@me');
              },
            },
          ]}
          onClose={() => setHomeContextMenu(null)}
        />
      )}
    </aside>
  );
});

export default ServerBar;
