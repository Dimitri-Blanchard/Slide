import React, { useState, useCallback, memo, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { AvatarImg } from './Avatar';
import AppIcon from './icons/AppIcon';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { teams as teamsApi, servers as serversApi, friends as friendsApi, direct as directApi } from '../api';
import ServerCreationFlow from './ServerCreationFlow';
import { ShareInviteModal } from './InviteModal';
import ContextMenu from './ContextMenu';
import ConfirmModal from './ConfirmModal';
import { useCompactTouchUi } from '../hooks/useCompactTouchUi';
import { hapticImpact } from '../utils/nativeHaptics';
import SlideLogo from './SlideLogo';
import { makeLocalPrivateRoute } from '../utils/localPrivateChatCrypto';
import { dmPath } from '../utils/appRoutes';
import { invitePublicUrl } from '../utils/publicSiteUrl';
import './ServerBar.css';

function getDisplayInitials(name) {
  if (!name) return '?';
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function isConversationActive(conversation, currentConversationId, currentLocalPrivateUserId) {
  if (conversation.is_local_private) {
    const peerId = conversation.local_private_peer_id || conversation.participants?.[0]?.id;
    return peerId != null && String(peerId) === String(currentLocalPrivateUserId);
  }
  return currentConversationId === String(conversation.conversation_id);
}

const MUTED_SERVERS_KEY = 'slide_muted_servers';

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
            <AppIcon name="close" size={14} weight="bold" />
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
const ServerBarTooltip = ({ team, text, anchorRef, isActive = false }) => {
  const [pos, setPos] = useState(null);

  useEffect(() => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setPos({
      top: rect.top + rect.height / 2,
      left: rect.right + 12,
    });
  }, [anchorRef]);

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
  const compactTouchUi = useCompactTouchUi();
  const didDragRef = useRef(false);
  const longPressTimerRef = useRef(null);
  const longPressStartRef = useRef(null);
  const longPressFiredRef = useRef(false);
  const [hovered, setHovered] = useState(false);
  const tooltipRef = useRef(null);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressStartRef.current = null;
  }, []);

  const onServerPointerDown = useCallback((e) => {
    if (!compactTouchUi) return;
    if (e.button !== 0) return;
    longPressFiredRef.current = false;
    longPressStartRef.current = { x: e.clientX, y: e.clientY };
    const cx = e.clientX;
    const cy = e.clientY;
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      longPressStartRef.current = null;
      longPressFiredRef.current = true;
      hapticImpact('Medium');
      onContextMenu?.({ clientX: cx, clientY: cy, preventDefault: () => {}, stopPropagation: () => {} }, team);
    }, 480);
  }, [compactTouchUi, team, onContextMenu]);

  const onServerPointerMove = useCallback((e) => {
    if (!longPressStartRef.current) return;
    const dx = e.clientX - longPressStartRef.current.x;
    const dy = e.clientY - longPressStartRef.current.y;
    if (dx * dx + dy * dy > 100) clearLongPress();
  }, [clearLongPress]);

  const onServerPointerUp = useCallback(() => {
    clearLongPress();
  }, [clearLongPress]);
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
    clearLongPress();
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
        onPointerDown={onServerPointerDown}
        onPointerMove={onServerPointerMove}
        onPointerUp={onServerPointerUp}
        onPointerCancel={onServerPointerUp}
        onClick={() => {
          if (didDragRef.current) {
            didDragRef.current = false;
            return;
          }
          if (longPressFiredRef.current) {
            longPressFiredRef.current = false;
            return;
          }
          navigate(serverPath(team));
        }}
        role="link"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            navigate(serverPath(team));
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
              // gifAnimate={isActive}: server you're currently in keeps its
              // GIF playing without needing hover. Hover still animates
              // others (built-in to AvatarImg).
              <AvatarImg src={team.avatar_url || team.icon_url} alt={team.name} gifAnimate={isActive} />
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
              <AppIcon name="bellOff" size={10} />
            </span>
          )}
        </div>
      </div>
      {!hideTooltip && hovered && (
        <ServerBarTooltip team={team} text={team.name} anchorRef={tooltipRef} isActive={isActive} />
      )}
    </li>
  );
});

// Unread DM shortcut — avatar styled like a server icon
const DmUnreadIcon = memo(function DmUnreadIcon({ conversation, isActive, hideTooltip = false }) {
  const [hovered, setHovered] = useState(false);
  const tooltipRef = useRef(null);

  const isGroup = !!conversation.is_group;
  const other = conversation.participants?.[0];
  const isLocalPrivate = !!conversation.is_local_private;
  const id = conversation.conversation_id;
  const to = isLocalPrivate
    ? makeLocalPrivateRoute(conversation.local_private_peer_id || other?.id)
    : dmPath(conversation);
  const name = isGroup
    ? (conversation.group_name || conversation.participants?.map((p) => p.display_name).join(', ') || 'Group')
    : (other?.display_name || 'Conversation');
  const unreadCount = conversation.unread_count || 0;
  const displayCount = unreadCount > 9 ? '9+' : unreadCount;
  const avatarUrl = other?.avatar_url;

  return (
    <li
      className="server-item dm-unread-item"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      ref={tooltipRef}
    >
      <Link
        to={to}
        className={`server-icon-link ${isActive ? 'active' : ''}`}
        title={name}
        draggable={false}
      >
        <div className={`server-icon ${isActive ? 'active' : ''}`}>
          {avatarUrl ? (
            <AvatarImg src={avatarUrl} alt={name} />
          ) : (
            <span className="server-initials">{getDisplayInitials(name)}</span>
          )}
        </div>
        <div className={`server-indicator ${isActive ? 'active' : ''}`} />
        <span className="dm-server-unread-badge">{displayCount}</span>
      </Link>
      {!hideTooltip && hovered && <ServerBarTooltip text={name} anchorRef={tooltipRef} />}
    </li>
  );
});

// Home button (DMs)
const HomeButton = memo(function HomeButton({ isActive, onContextMenu, homeTarget, pendingFriendsCount = 0, onHomeClick, hideTooltip = false }) {
  const { t } = useLanguage();
  const compactTouchUi = useCompactTouchUi();
  const [hovered, setHovered] = useState(false);
  const tooltipRef = useRef(null);
  const longPressTimerRef = useRef(null);
  const longPressStartRef = useRef(null);
  const longPressFiredRef = useRef(false);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressStartRef.current = null;
  }, []);

  const handleContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    clearLongPress();
    onContextMenu?.(e);
  };

  const onHomePointerDown = useCallback((e) => {
    setHovered(false);
    if (!compactTouchUi) return;
    if (e.button !== 0) return;
    longPressFiredRef.current = false;
    longPressStartRef.current = { x: e.clientX, y: e.clientY };
    const cx = e.clientX;
    const cy = e.clientY;
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      longPressStartRef.current = null;
      longPressFiredRef.current = true;
      hapticImpact('Medium');
      onContextMenu?.({ clientX: cx, clientY: cy, preventDefault: () => {}, stopPropagation: () => {} });
    }, 480);
  }, [compactTouchUi, onContextMenu]);

  const onHomePointerMove = useCallback((e) => {
    if (!longPressStartRef.current) return;
    const dx = e.clientX - longPressStartRef.current.x;
    const dy = e.clientY - longPressStartRef.current.y;
    if (dx * dx + dy * dy > 100) clearLongPress();
  }, [clearLongPress]);

  const onHomePointerUp = useCallback(() => {
    clearLongPress();
  }, [clearLongPress]);

  return (
    <li
      className="server-item home-item"
      onContextMenu={handleContextMenu}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      ref={tooltipRef}
    >
      <Link
        to={homeTarget}
        className={`server-icon-link ${isActive ? 'active' : ''}`}
        title={hideTooltip ? undefined : t('sidebar.directMessages')}
        onClick={(e) => {
          if (longPressFiredRef.current) {
            e.preventDefault();
            longPressFiredRef.current = false;
            return;
          }
          setHovered(false);
          onHomeClick?.();
        }}
        onPointerDown={onHomePointerDown}
        onPointerMove={onHomePointerMove}
        onPointerUp={onHomePointerUp}
        onPointerCancel={onHomePointerUp}
      >
        <div className={`server-icon home-icon ${isActive ? 'active' : ''}`}>
          <SlideLogo className="home-logo" />
        </div>
        <div className={`server-indicator ${isActive ? 'active' : ''}`} />
        {pendingFriendsCount > 0 && (
          <span className="home-friends-badge">
            {pendingFriendsCount > 9 ? '9+' : pendingFriendsCount}
          </span>
        )}
      </Link>
      {!hideTooltip && hovered && <ServerBarTooltip text={t('sidebar.directMessages')} anchorRef={tooltipRef} />}
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
          <AppIcon name="plus" size={22} weight="bold" />
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
          <AppIcon name="compass" size={20} />
        </div>
        <div className={`server-indicator ${isActive ? 'active' : ''}`} />
      </Link>
      {hovered && <ServerBarTooltip text={t('sidebar.discover') || 'Explore Communities'} anchorRef={tooltipRef} />}
    </li>
  );
});

const ServerBar = memo(function ServerBar({
  teams,
  conversations = [],
  currentTeamId,
  currentConversationId,
  currentLocalPrivateUserId,
  lastDmConversationId,
  onTeamsChange,
  onLeaveServer,
  isMobile = false,
  pendingFriendsCount = 0,
  onHomeClick,
}) {
  const [showServerCreationFlow, setShowServerCreationFlow] = useState(false);
  const [friendsList, setFriendsList] = useState([]);
  const [invitePanelData, setInvitePanelData] = useState(null);
  const [inviteSentIds, setInviteSentIds] = useState(new Set());
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
    navigate(serverPath(team));
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
      await directApi.sendMessage(convId, invitePublicUrl(invite.code || invite.invite_code));
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
  const canManageServerFromList = ctxTeam?.can_manage_server === true;

  const serverMenuItems = serverContextMenu ? [
    {
      icon: <AppIcon name="userPlus" size={16} />,
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
    {
      icon: <AppIcon name="copy" size={16} />,
      label: t('server.copyServerId') || 'Copy Server ID',
      onClick: () => {
        const id = String(serverContextMenu.team.id);
        closeServerContextMenu();
        const w = navigator.clipboard?.writeText(id);
        if (!w) {
          notify.error(t('common.copyFailed'));
          return;
        }
        w.then(() => {
          notify.success(t('common.copied') || 'Copied!');
        }).catch(() => {
          notify.error(t('common.copyFailed'));
        });
      },
    },
    ...(canManageServerFromList
      ? [
          { separator: true },
          {
            icon: <AppIcon name="settings" size={16} />,
            label: t('server.settings') || 'Paramètres du serveur',
            onClick: () => handleOpenSettings(serverContextMenu.team),
          },
        ]
      : []),
    {
      icon: mutedServersSet.has(Number(serverContextMenu.team.id)) ? (
        <AppIcon name="bell" size={16} />
      ) : (
        <AppIcon name="bellOff" size={16} />
      ),
      label: mutedServersSet.has(Number(serverContextMenu.team.id))
        ? (t('server.unmuteServer') || 'Afficher les notifications')
        : (t('server.muteServer') || 'Masquer les notifications'),
      onClick: () => handleToggleMute(serverContextMenu.team),
    },
    ...(serverContextMenu.team?.role === 'owner' ? [] : [
      { separator: true },
      {
        icon: <AppIcon name="signOut" size={16} />,
        label: t('server.leaveServer') || 'Quitter le serveur',
        onClick: () => handleLeaveClick(serverContextMenu.team),
        danger: true,
      },
    ]),
  ] : [];

  // Home (logo) is active for DMs — not when browsing /community (discover button owns that)
  const isCommunityRoute = pathname === '/community' || pathname.startsWith('/community/');
  const isFriendsRoute = pathname === '/friends' || pathname.startsWith('/friends/');
  const isHomeActiveBase = !currentTeamId && !currentConversationId?.startsWith?.('team');
  const homeButtonActive = !isCommunityRoute && (
    isFriendsRoute || isHomeActiveBase || !!currentConversationId
  );
  const lastDmConversation = lastDmConversationId
    ? (conversations || []).find((c) => String(c.conversation_id) === String(lastDmConversationId))
    : null;
  const homeTarget = isMobile
    ? '/channels/@me'
    : (lastDmConversation ? dmPath(lastDmConversation) : '/channels/@me');

  // Backend already returns teams in the persisted user order.
  const sortedTeams = useMemo(() => {
    return teams || [];
  }, [teams]);

  const unreadDmConversations = useMemo(() => {
    return (conversations || [])
      .filter((c) => {
        if (!(c.unread_count > 0)) return false;
        return !isConversationActive(c, currentConversationId, currentLocalPrivateUserId);
      })
      .sort((a, b) => new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0));
  }, [conversations, currentConversationId, currentLocalPrivateUserId]);

  const handleServerDragStart = useCallback((teamId) => setDraggedId(teamId), []);
  const handleServerDragOver = useCallback((teamId) => setDragOverId(teamId), []);
  const handleServerDragLeave = useCallback(() => setDragOverId(null), []);
  const handleServerDragEnd = useCallback(() => {
    setDraggedId(null);
    setDragOverId(null);
  }, []);
  const handleServerDrop = useCallback(
    async (sourceId, targetId) => {
      setDragOverId(null);
      setDraggedId(null);
      if (sourceId === targetId) return;
      const list = [...sortedTeams];
      const si = list.findIndex((t) => Number(t.id) === Number(sourceId));
      const ti = list.findIndex((t) => Number(t.id) === Number(targetId));
      if (si === -1 || ti === -1) return;
      const [removed] = list.splice(si, 1);
      const newTi = list.findIndex((t) => Number(t.id) === Number(targetId));
      list.splice(newTi >= 0 ? newTi : list.length, 0, removed);
      const newOrder = list.map((t) => Number(t.id));
      const previous = sortedTeams;
      onTeamsChange?.(list); // Optimistic UI
      try {
        await teamsApi.saveOrder(newOrder);
      } catch (err) {
        onTeamsChange?.(previous);
        notify.error(err?.message || 'Impossible de sauvegarder l’ordre des serveurs');
      }
    },
    [sortedTeams, onTeamsChange, notify]
  );

  return (
    <aside
      ref={serverBarRef}
      className="server-bar"
      data-tour-id="tour-servers"
    >
      <nav className="server-bar-nav">
        {/* Home (DMs) button */}
        <ul className="server-list home-section">
          <HomeButton
            isActive={homeButtonActive}
            onContextMenu={handleHomeContextMenu}
            homeTarget={homeTarget}
            pendingFriendsCount={pendingFriendsCount}
            onHomeClick={onHomeClick}
            hideTooltip={isMobile}
          />
          {unreadDmConversations.map((conversation) => (
            <DmUnreadIcon
              key={conversation.conversation_id ?? conversation.local_private_peer_id}
              conversation={conversation}
              isActive={isConversationActive(conversation, currentConversationId, currentLocalPrivateUserId)}
              hideTooltip={isMobile}
            />
          ))}
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
          <AddServerButton onClick={() => setShowServerCreationFlow(true)} />
          <DiscoverButton />
        </ul>
      </nav>

      <ServerCreationFlow
        isOpen={showServerCreationFlow}
        onClose={() => setShowServerCreationFlow(false)}
        teams={teams}
        onTeamsChange={onTeamsChange}
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
              icon: <AppIcon name="home" size={16} />,
              label: t('sidebar.directMessages') || 'Messages directs',
              onClick: () => {
                setHomeContextMenu(null);
                navigate(homeTarget);
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
