import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { teams as teamsApi, direct as directApi, localPrivate as localPrivateApi, invalidateCache } from '../api';
import { bindFriendsSyncSocket } from '../utils/friendsSync';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useSettings } from '../context/SettingsContext';
import { useSounds } from '../context/SoundContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useOffline } from '../context/OfflineContext';
import { useScene } from '../context/SceneContext';
import { useNotification } from '../context/NotificationContext';
import { usePlatform } from '../context/PlatformContext';
import { useViewportShellTransition } from '../hooks/useViewportShellTransition';
import { useSettingsUi } from '../context/SettingsUiContext';
import MobileAppLayoutShell from './MobileAppLayoutShell';
import DesktopAppLayoutShell from './DesktopAppLayoutShell';
import NotFound from '../pages/NotFound';
import Settings from '../pages/Settings';
import { isAuthenticatedAppPath, isSettingsRoute } from './appPaths';
import {
  getLocalPrivateChat,
  getLocalPrivateChats,
  LOCAL_PRIVATE_CHATS_CHANGED_EVENT,
  toLocalPrivateConversation,
  upsertLocalPrivateChat,
} from '../utils/localPrivateChatCrypto';
import usePendingFriendsCount from '../hooks/usePendingFriendsCount';
import './AppLayout.css';
import './panel-junctions.css';

// ═══════════════════════════════════════════════════════════
// CACHE SYSTEM - Silent background sync
// ═══════════════════════════════════════════════════════════
const SYNC_INTERVAL_MS = 10000; // 10s - cache + socket keep data fresh, no refresh needed

function dmReturnKey(userId) {
  return userId != null ? `slide_last_dm_u${userId}` : 'slide_last_dm';
}

function cacheKeyConversations(userId) {
  return userId != null ? `slide_conversations_cache_u${userId}` : 'slide_conversations_cache';
}

function cacheKeyTeams(userId) {
  return userId != null ? `slide_teams_cache_u${userId}` : 'slide_teams_cache';
}

function getCachedConversations(userId) {
  if (userId == null) return null;
  try {
    const cached = localStorage.getItem(cacheKeyConversations(userId));
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      // Cache valid for 24 hours max
      if (Date.now() - timestamp < 24 * 60 * 60 * 1000) {
        return data;
      }
    }
  } catch (e) {
    console.warn('Cache read error:', e);
  }
  return null;
}

function setCachedConversations(userId, conversations) {
  if (userId == null) return;
  try {
    localStorage.setItem(cacheKeyConversations(userId), JSON.stringify({
      data: conversations,
      timestamp: Date.now()
    }));
  } catch (e) {
    console.warn('Cache write error:', e);
  }
}

function getCachedTeams(userId) {
  if (userId == null) return null;
  try {
    const cached = localStorage.getItem(cacheKeyTeams(userId));
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < 24 * 60 * 60 * 1000) {
        return data;
      }
    }
  } catch (e) {
    console.warn('Cache read error:', e);
  }
  return null;
}

function setCachedTeams(userId, teams) {
  if (userId == null) return;
  try {
    localStorage.setItem(cacheKeyTeams(userId), JSON.stringify({
      data: sanitizeTeamsList(teams),
      timestamp: Date.now()
    }));
  } catch (e) {
    console.warn('Cache write error:', e);
  }
}

function sanitizeTeamsList(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((team) => team && team.id != null);
}

function normalizeLocalPrivateRequest(request, currentUserId) {
  const requester =
    request?.requester ||
    request?.fromUser ||
    request?.from_user ||
    request?.sender ||
    null;
  const recipient =
    request?.recipient ||
    request?.toUser ||
    request?.to_user ||
    request?.targetUser ||
    null;
  const requesterId =
    request?.requester_id ??
    request?.requesterId ??
    request?.from_user_id ??
    request?.fromUserId ??
    requester?.id ??
    null;
  const recipientId =
    request?.recipient_id ??
    request?.recipientId ??
    request?.to_user_id ??
    request?.toUserId ??
    request?.target_user_id ??
    request?.targetUserId ??
    recipient?.id ??
    null;
  const initiatedByMe = String(requesterId) === String(currentUserId);
  const peer = initiatedByMe
    ? (recipient || { id: recipientId })
    : (requester || { id: requesterId });
  if (!peer?.id) return null;
  return {
    peer,
    initiatedByMe,
    accepted: request?.accepted === true || request?.status === 'accepted',
    createdAt: request?.created_at || request?.createdAt || new Date().toISOString(),
  };
}

function applyViewingUnreadClear(convos, activeConversationId) {
  if (!Array.isArray(convos) || !activeConversationId) return convos;
  const cid = parseInt(activeConversationId, 10);
  if (Number.isNaN(cid)) return convos;
  return convos.map((c) => (c.conversation_id === cid ? { ...c, unread_count: 0 } : c));
}

function applyViewingTeamUnreadClear(teams, activeTeamId) {
  if (!Array.isArray(teams) || !activeTeamId) return teams;
  const tid = parseInt(activeTeamId, 10);
  if (Number.isNaN(tid)) return teams;
  return teams.map((t) => (
    t.id === tid ? { ...t, unread_count: 0, mention_count: 0, has_unread: false } : t
  ));
}

function useAppParams() {
  const { pathname } = useLocation();
  return useMemo(() => {
    const teamMatch = pathname.match(/^\/channels\/(\d+)/);
    const channelSettingsMatch = pathname.match(/^\/channels\/\d+\/(\d+)\/settings/);
    const channelMatch = pathname.match(/^\/channels\/\d+\/(\d+)(?:\/|$|\?)/);
    const localPrivateMatch = pathname.match(/\/channels\/@me\/private-local\/([^/]+)/);
    const dmMatch = pathname.match(/\/channels\/@me\/(\d+)/);
    const isSettings = isSettingsRoute(pathname);
    return {
      teamId: teamMatch?.[1] || null,
      channelId: channelSettingsMatch?.[1] || channelMatch?.[1] || null,
      conversationId: localPrivateMatch ? null : (dmMatch?.[1] || null),
      localPrivateUserId: localPrivateMatch ? decodeURIComponent(localPrivateMatch[1]) : null,
      isSettings,
    };
  }, [pathname]);
}

const SIDEBAR_STORAGE_KEY = 'slide_sidebar_width';
const SIDEBAR_DEFAULT_W = 300;
const SIDEBAR_MIN_W = 260;
const SIDEBAR_MAX_W = 480;

function useSidebarWidth() {
  const [width, setWidth] = useState(() => {
    try { const v = parseInt(localStorage.getItem(SIDEBAR_STORAGE_KEY), 10); return v >= SIDEBAR_MIN_W && v <= SIDEBAR_MAX_W ? v : SIDEBAR_DEFAULT_W; }
    catch { return SIDEBAR_DEFAULT_W; }
  });
  const widthRef = useRef(width);
  widthRef.current = width;

  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = widthRef.current;
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyUserSelect = document.body.style.userSelect;
    const prevBodyCursor = document.body.style.cursor;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ew-resize';
    const onMove = (ev) => {
      ev.preventDefault();
      const next = Math.min(SIDEBAR_MAX_W, Math.max(SIDEBAR_MIN_W, startW + (ev.clientX - startX)));
      setWidth(next);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.userSelect = prevBodyUserSelect;
      document.body.style.cursor = prevBodyCursor;
      try { localStorage.setItem(SIDEBAR_STORAGE_KEY, String(widthRef.current)); } catch {}
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  return { width, handleResizeStart };
}

function AppLayout() {
  const { user } = useAuth();

  const [teams, setTeams] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [localPrivateConversations, setLocalPrivateConversations] = useState([]);
  const [conversationsLoaded, setConversationsLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showSearch, setShowSearch] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [showCreateServer, setShowCreateServer] = useState(false);
  const [lastDmConversationId, setLastDmConversationId] = useState(null);
  // Mobile bottom nav tab: home (DMs + servers) | notifications | profile
  const [mobileTab, setMobileTab] = useState('home');
  const { inboxItems } = useNotification();
  const socket = useSocket();
  const { registerKeybindHandler, shouldNotify, settings } = useSettings();
  const { playNotification, playPing } = useSounds();
  const {
    openSettings,
    closeSettings,
    settingsUseModal,
    desktopSettingsOpen,
    desktopInitialSection,
    desktopQuery,
    isMobileSettingsRoute,
  } = useSettingsUi();
  const navigate = useNavigate();
  const params = useAppParams();
  const { pathname, state: locationState } = useLocation();
  const { isMobileShellViewport: isMobile } = usePlatform();
  const { shellMobile, phase: shellPhase } = useViewportShellTransition(isMobile);
  const isFriendsView = (
    (pathname === '/channels/@me' && !params.conversationId && !params.localPrivateUserId) ||
    pathname === '/friends'
  );
  const pendingFriendsCount = usePendingFriendsCount(isFriendsView);
  const syncIntervalRef = useRef(null);
  const mutationSyncTimeoutRef = useRef(null);
  const swipeRef = useRef({ startX: 0, tracking: false });
  const isWindowFocusedRef = useRef(true);
  const recentMentionTeamRef = useRef(null);
  const activeRouteRef = useRef({ conversationId: null, teamId: null, channelId: null });
  useEffect(() => {
    activeRouteRef.current = {
      conversationId: params.conversationId,
      teamId: params.teamId,
      channelId: params.channelId,
    };
  }, [params.conversationId, params.teamId, params.channelId]);

  useEffect(() => {
    if (!user?.id) {
      setLastDmConversationId(null);
      setLocalPrivateConversations([]);
      return;
    }
    try {
      const saved = localStorage.getItem(dmReturnKey(user.id));
      setLastDmConversationId(saved || null);
    } catch {
      setLastDmConversationId(null);
    }
  }, [user?.id]);

  const refreshLocalPrivateConversations = useCallback(() => {
    if (!user?.id) {
      setLocalPrivateConversations([]);
      return;
    }
    const localConvos = getLocalPrivateChats(user.id)
      .map(toLocalPrivateConversation)
      .filter(Boolean);
    setLocalPrivateConversations(localConvos);
  }, [user?.id]);

  useEffect(() => {
    refreshLocalPrivateConversations();
    window.addEventListener(LOCAL_PRIVATE_CHATS_CHANGED_EVENT, refreshLocalPrivateConversations);
    return () => window.removeEventListener(LOCAL_PRIVATE_CHATS_CHANGED_EVENT, refreshLocalPrivateConversations);
  }, [refreshLocalPrivateConversations]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    localPrivateApi.requests()
      .then((requests) => {
        if (cancelled) return;
        const list = Array.isArray(requests)
          ? requests
          : (Array.isArray(requests?.requests) ? requests.requests : []);
        for (const request of list) {
          const normalized = normalizeLocalPrivateRequest(request, user.id);
          if (!normalized) continue;
          upsertLocalPrivateChat(user.id, normalized.peer, {
            last_message_preview: normalized.accepted
              ? 'Chat privé local accepté'
              : normalized.initiatedByMe
              ? 'Demande privée locale envoyée'
              : 'Demande privée locale à accepter',
            last_message_at: normalized.createdAt,
            initiated_by_me: normalized.initiatedByMe,
            accepted: normalized.accepted,
          });
        }
      })
      .catch((err) => {
        // Older servers may not expose this yet; local socket flow still works.
        console.warn('Local private chat requests sync failed:', err);
      });
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    const onInvite = () => {
      if (shouldNotify('dm')) playNotification();
    };
    window.addEventListener('slide:local-private-invite', onInvite);
    return () => window.removeEventListener('slide:local-private-invite', onInvite);
  }, [playNotification, shouldNotify]);

  // Block access to local private routes that do not belong to the active account.
  useEffect(() => {
    if (!params.localPrivateUserId) return;
    if (!user?.id) {
      navigate('/channels/@me', { replace: true });
      return;
    }
    if (!getLocalPrivateChat(user.id, params.localPrivateUserId)) {
      navigate('/channels/@me', { replace: true });
    }
  }, [navigate, params.localPrivateUserId, user?.id]);

  useEffect(() => {
    if (!params.conversationId) return;
    setLastDmConversationId(params.conversationId);
    if (!user?.id) return;
    try {
      localStorage.setItem(dmReturnKey(user.id), params.conversationId);
    } catch {}
  }, [params.conversationId, user?.id]);

  // Swipe from left edge to open server list (mobile) - low threshold for easy trigger
  const handleTouchStart = useCallback((e) => {
    if (!isMobile) return;
    const x = e.touches[0]?.clientX ?? 0;
    swipeRef.current = { startX: x, tracking: true };
  }, [isMobile]);

  const handleTouchMove = useCallback((e) => {
    if (!isMobile || !swipeRef.current.tracking) return;
    const x = e.touches[0]?.clientX ?? 0;
    const delta = x - swipeRef.current.startX;
    if (delta > 25) {
      setMobileNavOpen(true);
      swipeRef.current.tracking = false;
    } else if (delta < -15) {
      swipeRef.current.tracking = false;
    }
  }, [isMobile]);

  const handleTouchEnd = useCallback((e) => {
    if (!isMobile || !swipeRef.current.tracking) return;
    const touch = e.changedTouches?.[0];
    if (touch) {
      const delta = touch.clientX - swipeRef.current.startX;
      if (delta > 20) setMobileNavOpen(true);
    }
    swipeRef.current.tracking = false;
  }, [isMobile]);

  // Swipe left on overlay to close (mobile)
  const overlaySwipeRef = useRef({ startX: 0 });
  const handleOverlayTouchStart = useCallback((e) => {
    if (!isMobile || !mobileNavOpen) return;
    overlaySwipeRef.current.startX = e.touches[0]?.clientX ?? 0;
  }, [isMobile, mobileNavOpen]);
  const handleOverlayTouchMove = useCallback((e) => {
    if (!isMobile || !mobileNavOpen) return;
    const x = e.touches[0]?.clientX ?? 0;
    if (overlaySwipeRef.current.startX - x > 50) {
      setMobileNavOpen(false);
    }
  }, [isMobile, mobileNavOpen]);
  
  // ═══════════════════════════════════════════════════════════
  // REGISTER KEYBOARD SHORTCUTS
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    // Register search shortcut
    const unregisterSearch = registerKeybindHandler('search', () => {
      setShowSearch(prev => !prev);
    });

    // Register mark as read shortcut (close modals/menus with Escape)
    const unregisterMarkAsRead = registerKeybindHandler('markAsRead', () => {
      setShowSearch(false);
    });

    // Extra shortcuts not in settings keybinds
    const handleExtraKeys = (e) => {
      // Escape → close search (handle first so it never triggers settings)
      if (e.key === 'Escape') {
        setShowSearch(false);
        return;
      }

      const ctrlOrMeta = e.ctrlKey || e.metaKey;

      // Ctrl+, → Settings (only on explicit comma key, never on Escape)
      if (ctrlOrMeta && e.key === ',') {
        e.preventDefault();
        openSettings();
        return;
      }

      // Alt+ArrowUp / Alt+ArrowDown → cycle servers
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('slide:cycle-server', { detail: { direction: e.key === 'ArrowUp' ? -1 : 1 } }));
      }
    };

    window.addEventListener('keydown', handleExtraKeys);

    return () => {
      unregisterSearch();
      unregisterMarkAsRead();
      window.removeEventListener('keydown', handleExtraKeys);
    };
  }, [registerKeybindHandler, openSettings]);

  // Silent background sync — fetch teams and conversations in parallel.
  // Set loading false as soon as conversations arrive so sidebar appears progressively.
  const silentSync = useCallback((onConversationsReady) => {
    if (!user?.id) return Promise.resolve();
    const uid = user.id;
    const teamsPromise = teamsApi.list()
      .then((teamsList) => {
        if (Array.isArray(teamsList)) {
          const safeTeams = sanitizeTeamsList(teamsList);
          const { teamId } = activeRouteRef.current;
          const clearedTeams = applyViewingTeamUnreadClear(safeTeams, teamId);
          setTeams(clearedTeams);
          setCachedTeams(uid, clearedTeams);
        }
      })
      .catch((err) => { console.warn('Teams sync failed:', err); });

    const convosPromise = directApi.conversations()
      .then((convos) => {
        if (Array.isArray(convos)) {
          const { conversationId } = activeRouteRef.current;
          setConversations(applyViewingUnreadClear(convos, conversationId));
          setConversationsLoaded(true);
        }
        setLoading(false);
        onConversationsReady?.();
      })
      .catch((err) => {
        console.warn('Conversations sync failed:', err);
        setLoading(false);
        onConversationsReady?.();
      });

    return Promise.allSettled([teamsPromise, convosPromise]);
  }, [user?.id]);

  // Per-account hydrate from localStorage + background sync (never mix users in sidebar cache)
  useEffect(() => {
    if (!user?.id) {
      setTeams([]);
      setConversations([]);
      setConversationsLoaded(false);
      setLoading(false);
      return;
    }

    const uid = user.id;
    const teamsFromLs = sanitizeTeamsList(getCachedTeams(uid));
    const convFromLs = getCachedConversations(uid);
    setTeams(teamsFromLs);
    if (convFromLs != null) {
      setConversations(Array.isArray(convFromLs) ? convFromLs : []);
      setConversationsLoaded(true);
      setLoading(false);
    } else {
      setConversations([]);
      setConversationsLoaded(false);
      setLoading(true);
    }

    const safetyTimeout = setTimeout(() => setLoading(false), 20000);
    silentSync(() => clearTimeout(safetyTimeout));
    const intervalId = setInterval(() => silentSync(), SYNC_INTERVAL_MS);

    return () => {
      clearTimeout(safetyTimeout);
      clearInterval(intervalId);
    };
  }, [user?.id, silentSync]);

  useEffect(() => {
    if (!user?.id || !conversationsLoaded) return;
    setCachedConversations(user.id, conversations);
  }, [conversations, conversationsLoaded, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    setCachedTeams(user.id, sanitizeTeamsList(teams));
  }, [teams, user?.id]);

  // Electron: sync OS taskbar badge (red 1–9+ overlay on Windows)
  useEffect(() => {
    if (!window.electron?.setBadgeCount) return;
    const convList = Array.isArray(conversations) ? conversations : [];
    const teamList = Array.isArray(teams) ? teams : [];
    const dmUnread = convList.reduce((n, c) => n + (c.unread_count || 0), 0);
    const serverUnread = teamList.reduce((n, t) => {
      const unread = t.unread_count || 0;
      const mentions = t.mention_count || 0;
      return n + Math.max(unread, mentions);
    }, 0);
    const total = dmUnread + serverUnread + pendingFriendsCount;
    window.electron.setBadgeCount(total);
  }, [conversations, teams, pendingFriendsCount]);

  // Electron: track window focus so we know when to fire native notifications
  useEffect(() => {
    if (!window.electron?.onFocusChange) return;
    return window.electron.onFocusChange((focused) => {
      isWindowFocusedRef.current = focused;
    });
  }, []);

  // Join all team rooms to receive server_updated (icon, name, etc.) for sidebar
  useEffect(() => {
    if (!socket || teams.length === 0) return;
    teams.forEach((t) => {
      if (t?.id == null) return;
      socket.emit('join_team', t.id);
    });
    const syncVoice = () => socket.emit('voice_sync');
    if (socket.connected) syncVoice();
    socket.on('connect', syncVoice);
    return () => {
      socket.off('connect', syncVoice);
      teams.forEach((t) => t?.id != null && socket.emit('leave_team', t.id));
    };
  }, [socket, teams]);

  // Listen to real-time team events
  useEffect(() => {
    if (!socket) return;

    // Team created (when current user creates a team)
    const onTeamCreated = ({ team }) => {
      if (!team || team.id == null) return;
      setTeams((prev) => {
        const safePrev = sanitizeTeamsList(prev);
        if (safePrev.some((t) => t.id === team.id)) return safePrev;
        return [...safePrev, { ...team, unread_count: 0, mention_count: 0, has_unread: false }];
      });
    };

    // Team updated (name/description changed) or server_updated (icon, settings)
    const onTeamUpdated = ({ team }) => {
      if (!team || team.id == null) return;
      setTeams((prev) => sanitizeTeamsList(prev).map((t) => (t.id === team.id ? { ...t, ...team } : t)));
    };
    const onServerUpdated = ({ team }) => {
      if (!team || team.id == null) return;
      setTeams((prev) => sanitizeTeamsList(prev).map((t) => (t.id === team.id ? { ...t, ...team } : t)));
    };

    // Added to a team by someone else
    const onAddedToTeam = ({ team }) => {
      if (!team || team.id == null) return;
      setTeams((prev) => {
        const safePrev = sanitizeTeamsList(prev);
        if (safePrev.some((t) => t.id === team.id)) return safePrev;
        return [...safePrev, { ...team, unread_count: 0, mention_count: 0, has_unread: false }];
      });
    };

    // Joined a team via invite link (we initiated the join)
    const onJoinedTeam = ({ team }) => {
      if (!team || team.id == null) return;
      setTeams((prev) => {
        const safePrev = sanitizeTeamsList(prev);
        if (safePrev.some((t) => t.id === team.id)) return safePrev;
        return [...safePrev, { ...team, unread_count: 0, mention_count: 0, has_unread: false }];
      });
    };

    // Removed from a team
    const onRemovedFromTeam = ({ teamId }) => {
      setTeams((prev) => sanitizeTeamsList(prev).filter((t) => t.id !== teamId));
      // If we were viewing this team, navigate away
      if (params.teamId === String(teamId)) {
        navigate('/channels/@me');
      }
    };

    // Team unread update (new message in a team channel)
    const onTeamUnreadUpdate = ({ teamId, hasUnread }) => {
      // Don't increment if we're currently viewing this team
      if (params.teamId === String(teamId)) return;

      setTeams((prev) => prev.map((t) => {
        if (t?.id === teamId) {
          return {
            ...t,
            has_unread: hasUnread,
            unread_count: (t.unread_count || 0) + 1
          };
        }
        return t;
      }));

      if (settings.enable_notifications) {
        const recentMention = recentMentionTeamRef.current;
        const mentionJustPlayed = recentMention?.teamId === teamId && Date.now() - recentMention.at < 400;
        if (!mentionJustPlayed) playNotification();
      }

      // Native notification when window is not focused
      if (!isWindowFocusedRef.current) {
        window.electron?.showNotification?.({ title: 'Slide', body: 'Nouveau message dans un serveur' });
        window.electron?.flashFrame?.();
      }
    };

    // Team mention update (user was mentioned in a team channel)
    const onTeamMentionUpdate = ({ teamId, hasMention }) => {
      // Don't increment if we're currently viewing this team
      if (params.teamId === String(teamId)) return;
      
      setTeams((prev) => prev.map((t) => {
        if (t?.id === teamId) {
          return {
            ...t,
            has_unread: true,
            mention_count: (t.mention_count || 0) + 1
          };
        }
        return t;
      }));
      if (shouldNotify('channel', true)) {
        recentMentionTeamRef.current = { teamId, at: Date.now() };
        playPing();
      }
    };

    // Team deleted by owner
    const onTeamDeleted = ({ teamId }) => {
      setTeams((prev) => sanitizeTeamsList(prev).filter((t) => t.id !== teamId));
      if (params.teamId === String(teamId)) {
        navigate('/channels/@me');
      }
    };

    socket.on('team_created', onTeamCreated);
    socket.on('team_updated', onTeamUpdated);
    socket.on('server_updated', onServerUpdated);
    socket.on('added_to_team', onAddedToTeam);
    socket.on('joined_team', onJoinedTeam);
    socket.on('removed_from_team', onRemovedFromTeam);
    socket.on('team_deleted', onTeamDeleted);
    socket.on('team_unread_update', onTeamUnreadUpdate);
    socket.on('team_mention_update', onTeamMentionUpdate);

    return () => {
      socket.off('team_created', onTeamCreated);
      socket.off('team_updated', onTeamUpdated);
      socket.off('server_updated', onServerUpdated);
      socket.off('added_to_team', onAddedToTeam);
      socket.off('joined_team', onJoinedTeam);
      socket.off('removed_from_team', onRemovedFromTeam);
      socket.off('team_deleted', onTeamDeleted);
      socket.off('team_unread_update', onTeamUnreadUpdate);
      socket.off('team_mention_update', onTeamMentionUpdate);
    };
  }, [socket, params.teamId, navigate, settings.enable_notifications, shouldNotify, playNotification, playPing]);

  // Listen to real-time conversation events
  useEffect(() => {
    if (!socket) return;

    // New conversation created (someone started a DM with us)
    const onConversationCreated = ({ conversation }) => {
      setConversations((prev) => {
        if (prev.some((c) => c.conversation_id === conversation.conversation_id)) return prev;
        return [conversation, ...prev];
      });
    };

    const onConversationUpdated = ({ conversationId, lastMessagePreview, lastMessageAt, updatedAt, senderId }) => {
      const isCurrentlyViewing = params.conversationId === String(conversationId);
      const isOwnMessage = senderId != null && user?.id != null && Number(senderId) === Number(user.id);
      const shouldIncrementUnread = !isCurrentlyViewing && !isOwnMessage;

      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.conversation_id === conversationId);
        if (idx === -1) return prev;
        const conv = prev[idx];
        const updated = {
          ...conv,
          last_message_preview: lastMessagePreview,
          last_message_at: lastMessageAt,
          updated_at: updatedAt,
          unread_count: shouldIncrementUnread ? (conv.unread_count || 0) + 1 : (conv.unread_count || 0)
        };
        const rest = prev.filter((_, i) => i !== idx);
        return [updated, ...rest];
      });

      // Native notification when window is not focused
      if (shouldIncrementUnread && shouldNotify('dm')) {
        playNotification();
      }
      if (shouldIncrementUnread && !isWindowFocusedRef.current) {
        window.electron?.showNotification?.({
          title: 'Slide',
          body: lastMessagePreview || 'Nouveau message',
        });
        window.electron?.flashFrame?.();
      }
    };

    const onGroupMemberAdded = ({ conversationId, participants }) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.conversation_id === conversationId ? { ...c, participants } : c
        )
      );
    };

    const onGroupMemberRemoved = ({ conversationId, userId, participants }) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.conversation_id === conversationId ? { ...c, participants } : c
        )
      );
    };

    const onGroupRemoved = ({ conversationId }) => {
      setConversations((prev) => prev.filter((c) => c.conversation_id !== conversationId));
      if (params.conversationId === String(conversationId)) {
        navigate('/channels/@me');
      }
    };

    socket.on('conversation_created', onConversationCreated);
    socket.on('conversation_updated', onConversationUpdated);
    socket.on('group_member_added', onGroupMemberAdded);
    socket.on('group_member_removed', onGroupMemberRemoved);
    socket.on('group_removed', onGroupRemoved);

    return () => {
      socket.off('conversation_created', onConversationCreated);
      socket.off('conversation_updated', onConversationUpdated);
      socket.off('group_member_added', onGroupMemberAdded);
      socket.off('group_member_removed', onGroupMemberRemoved);
      socket.off('group_removed', onGroupRemoved);
    };
  }, [socket, params.conversationId, user?.id, shouldNotify, playNotification]);

  // Close mobile nav when route changes
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  // Sync mobileTab: from navigation state, or when returning from chat
  const prevParamsRef = useRef(params);
  useEffect(() => {
    const targetTab = locationState?.mobileTab;
    if (targetTab && ['home', 'notifications', 'profile'].includes(targetTab)) {
      setMobileTab(targetTab);
      return;
    }
    const wasInConv = !!prevParamsRef.current.conversationId;
    const wasInTeam = !!prevParamsRef.current.teamId;
    const nowHome = !params.conversationId && !params.localPrivateUserId && !params.teamId && pathname !== '/community';
    if (nowHome && (wasInConv || wasInTeam) && !locationState?.mobileTab) {
      setMobileTab('home');
    }
    prevParamsRef.current = params;
  }, [pathname, params.conversationId, params.localPrivateUserId, params.teamId, locationState?.mobileTab]);

  useEffect(() => {
    if (params.conversationId) {
      const cid = parseInt(params.conversationId, 10);
      setConversations((prev) => {
        const target = prev.find((c) => c.conversation_id === cid);
        if (!target || !target.unread_count) return prev;
        return prev.map((c) => c.conversation_id === cid ? { ...c, unread_count: 0 } : c);
      });
    }
  }, [params.conversationId]);

  useEffect(() => {
    if (params.teamId) {
      const tid = parseInt(params.teamId, 10);
      setTeams((prev) => {
        const target = prev.find((t) => t.id === tid);
        if (!target || (!target.unread_count && !target.mention_count && !target.has_unread)) return prev;
        return prev.map((t) => t.id === tid ? { ...t, unread_count: 0, mention_count: 0, has_unread: false } : t);
      });
    }
  }, [params.teamId, params.channelId]);

  const refreshConversations = useCallback(() => {
    if (!user?.id) return;
    directApi.conversations()
      .then((convos) => {
        if (Array.isArray(convos)) {
          const { conversationId } = activeRouteRef.current;
          const cleared = applyViewingUnreadClear(convos, conversationId);
          setConversations(cleared);
          setCachedConversations(user.id, cleared);
          setConversationsLoaded(true);
        }
      })
      .catch((err) => {
        console.error('Erreur refresh conversations:', err);
      });
  }, [user?.id]);

  const refreshTeams = useCallback(() => {
    if (!user?.id) return;
    teamsApi.list()
      .then((teamsList) => {
        if (Array.isArray(teamsList)) {
          const safeTeams = sanitizeTeamsList(teamsList);
          const { teamId } = activeRouteRef.current;
          const clearedTeams = applyViewingTeamUnreadClear(safeTeams, teamId);
          setTeams(clearedTeams);
          setCachedTeams(user.id, clearedTeams);
        }
      })
      .catch((err) => {
        console.error('Erreur refresh teams:', err);
      });
  }, [user?.id]);

  const handleTeamsChange = useCallback((nextTeamsOrUpdater) => {
    if (typeof nextTeamsOrUpdater === 'function') {
      setTeams((prev) => {
        const safePrev = sanitizeTeamsList(prev);
        return sanitizeTeamsList(nextTeamsOrUpdater(safePrev));
      });
      return;
    }
    setTeams(sanitizeTeamsList(nextTeamsOrUpdater));
  }, []);

  // Keep DM participant names synced when friend relations change.
  useEffect(() => {
    const handleFriendsChanged = () => {
      refreshConversations();
    };
    window.addEventListener('slide:friends-changed', handleFriendsChanged);
    return () => window.removeEventListener('slide:friends-changed', handleFriendsChanged);
  }, [refreshConversations]);

  // Always-on friends + pending sync — runs even when FriendsPage is unmounted.
  useEffect(() => {
    bindFriendsSyncSocket(socket, {
      onFriendAccepted: (data) => {
        if (data?.conversation) {
          setConversations((prev) => {
            if (prev.some((c) => c.conversation_id === data.conversation.conversation_id)) return prev;
            return [{ ...data.conversation, unread_count: 0 }, ...prev];
          });
        }
      },
    });
    return () => bindFriendsSyncSocket(null);
  }, [socket]);

  // Global revalidation after any mutation API call.
  useEffect(() => {
    const handleDataMutated = (event) => {
      const endpoint = String(event?.detail?.endpoint || '');
      if (mutationSyncTimeoutRef.current) {
        clearTimeout(mutationSyncTimeoutRef.current);
      }
      mutationSyncTimeoutRef.current = setTimeout(() => {
        if (endpoint.includes('/direct') || endpoint.includes('/friends')) {
          refreshConversations();
        }
        if (endpoint.includes('/teams') || endpoint.includes('/servers') || endpoint.includes('/channels')) {
          refreshTeams();
        }
      }, 120);
    };
    window.addEventListener('slide:data-mutated', handleDataMutated);
    return () => {
      window.removeEventListener('slide:data-mutated', handleDataMutated);
      if (mutationSyncTimeoutRef.current) {
        clearTimeout(mutationSyncTimeoutRef.current);
      }
    };
  }, [refreshConversations, refreshTeams]);

  // Stale-while-revalidate: when background fetch completes, sync state (no refresh needed)
  useEffect(() => {
    const handleCacheUpdated = () => {
      silentSync();
    };
    window.addEventListener('slide:cache-updated', handleCacheUpdated);
    return () => window.removeEventListener('slide:cache-updated', handleCacheUpdated);
  }, [silentSync]);

  // Re-sync when app becomes active again.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        silentSync();
      }
    };
    const handleFocus = () => {
      silentSync();
    };
    const handleOnline = () => {
      silentSync();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
    };
  }, [silentSync]);

  const addConversation = useCallback((newConv) => {
    setConversations((prev) => {
      if (prev.some((c) => c.conversation_id === newConv.conversation_id)) {
        return prev;
      }
      return [newConv, ...prev];
    });
  }, []);

  const removeConversationLocal = useCallback((conversationId) => {
    if (!conversationId) return;
    setConversations((prev) => prev.filter((c) => c.conversation_id !== conversationId));
  }, []);

  const restoreConversationLocal = useCallback((conversation) => {
    if (!conversation?.conversation_id) return;
    setConversations((prev) => {
      if (prev.some((c) => c.conversation_id === conversation.conversation_id)) {
        return prev;
      }
      const next = [conversation, ...prev];
      return next.sort((a, b) => new Date(b.last_message_at || b.created_at) - new Date(a.last_message_at || a.created_at));
    });
  }, []);

  // Remove team from list when user leaves (and update cache) - avoids stale server in bar
  const onLeaveServer = useCallback((teamId) => {
    setTeams((prev) => {
      const next = sanitizeTeamsList(prev).filter((t) => t.id !== parseInt(teamId, 10));
      setCachedTeams(next);
      return next;
    });
    navigate('/channels/@me');
  }, [navigate]);

  // Hooks must run on every render - never after a conditional return
  const isOnline = useOnlineStatus();
  const { queuedCount, processing } = useOffline();
  const scene = useScene();
  const { width: sidebarWidth, handleResizeStart: handleSidebarResizeStart } = useSidebarWidth();
  const displayedConversations = useMemo(() => {
    return [...localPrivateConversations, ...conversations].sort((a, b) =>
      new Date(b.last_message_at || b.updated_at || b.created_at) - new Date(a.last_message_at || a.updated_at || a.created_at)
    );
  }, [conversations, localPrivateConversations]);
  const showSettings = settingsUseModal ? desktopSettingsOpen : isMobileSettingsRoute;
  const settingsOverlay = showSettings ? (
    <Settings
      presentation={settingsUseModal ? 'modal' : 'fullscreen'}
      onRequestClose={settingsUseModal ? closeSettings : undefined}
      initialSection={settingsUseModal ? desktopInitialSection : null}
      initialQuery={settingsUseModal ? desktopQuery : ''}
    />
  ) : null;

  if (!isAuthenticatedAppPath(pathname)) {
    return <NotFound />;
  }

  const shellClass = `layout-viewport-shell layout-viewport-shell--${shellPhase}`;

  if (shellMobile) {
    return (
      <>
        <div className={shellClass}>
          <MobileAppLayoutShell
          pathname={pathname}
          params={params}
          scene={scene}
          isOnline={isOnline}
          queuedCount={queuedCount}
          processing={processing}
          teams={teams}
          conversations={displayedConversations}
          setConversations={setConversations}
          loading={loading}
          user={user}
          lastDmConversationId={lastDmConversationId}
          handleTeamsChange={handleTeamsChange}
          onLeaveServer={onLeaveServer}
          mobileTab={mobileTab}
          setMobileTab={setMobileTab}
          showSearch={showSearch}
          setShowSearch={setShowSearch}
          showCreateServer={showCreateServer}
          setShowCreateServer={setShowCreateServer}
          setTeams={setTeams}
          inboxItems={inboxItems}
          pendingFriendsCount={pendingFriendsCount}
          onRemoveConversation={removeConversationLocal}
          onRestoreConversation={restoreConversationLocal}
        />
        </div>
        {settingsOverlay}
      </>
    );
  }

  const showSidebar = !params.teamId && pathname !== '/community';

  return (
    <>
      <div className={shellClass}>
        <DesktopAppLayoutShell
        params={params}
        scene={scene}
        isMobile={isMobile}
        mobileNavOpen={mobileNavOpen}
        setMobileNavOpen={setMobileNavOpen}
        handleOverlayTouchStart={handleOverlayTouchStart}
        handleOverlayTouchMove={handleOverlayTouchMove}
        isOnline={isOnline}
        queuedCount={queuedCount}
        processing={processing}
        teams={teams}
        user={user}
        conversations={displayedConversations}
        setConversations={setConversations}
        lastDmConversationId={lastDmConversationId}
        handleTeamsChange={handleTeamsChange}
        onLeaveServer={onLeaveServer}
        showSidebar={showSidebar}
        sidebarWidth={sidebarWidth}
        handleSidebarResizeStart={handleSidebarResizeStart}
        refreshConversations={refreshConversations}
        addConversation={addConversation}
        removeConversationLocal={removeConversationLocal}
        restoreConversationLocal={restoreConversationLocal}
        loading={loading}
        conversationsLoaded={conversationsLoaded}
        setShowSearch={setShowSearch}
        showSearch={showSearch}
        handleTouchStart={handleTouchStart}
        handleTouchMove={handleTouchMove}
        handleTouchEnd={handleTouchEnd}
        pendingFriendsCount={pendingFriendsCount}
      />
      </div>
      {settingsOverlay}
    </>
  );
}

export default AppLayout;
