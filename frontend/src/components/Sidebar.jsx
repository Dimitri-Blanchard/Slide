import React, { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { direct as directApi, users as usersApi, conversations as conversationsApi, localPrivate as localPrivateApi } from '../api';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import Avatar from './Avatar';
import ClickableAvatar from './ClickableAvatar';
import GroupAvatar from './GroupAvatar';
import ContextMenu, { Icons } from './ContextMenu';
import ProfileCard from './ProfileCard';
import CreateGroupModal from './CreateGroupModal';
import AddNoteModal from './AddNoteModal';
import FriendNicknameModal from './FriendNicknameModal';
import { undoToast } from './UndoToast';
import { useNotification } from '../context/NotificationContext';
import { useVoice } from '../context/VoiceContext';
import { useUserContextMenuItems } from '../hooks/useUserContextMenuItems';
import { usePrefetchOnHover } from '../context/PrefetchContext';
import { prefetchDmMessages } from '../utils/dmCache';
import { useCompactTouchUi } from '../hooks/useCompactTouchUi';
import { useLongPress } from '../hooks/useLongPress';
import { hapticImpact } from '../utils/nativeHaptics';
import { makeLocalPrivateRoute, removeLocalPrivateChat } from '../utils/localPrivateChatCrypto';
import AppIcon from './icons/AppIcon';
import './Sidebar.css';

const MAX_PINNED = 5;

function getPinnedConversations() {
  try {
    const pinned = localStorage.getItem('slide_pinned_conversations');
    return pinned ? JSON.parse(pinned) : [];
  } catch {
    return [];
  }
}

function savePinnedConversations(pinnedIds) {
  localStorage.setItem('slide_pinned_conversations', JSON.stringify(pinnedIds));
}

function useDebounce(callback, delay) {
  const timeoutRef = useRef(null);
  const debouncedFn = useCallback((...args) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => callback(...args), delay);
  }, [callback, delay]);
  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);
  return debouncedFn;
}

const DMItem = memo(function DMItem({ conversation, isActive, onContextMenu, onClose, unreadCount = 0, onPinConversation, isPinned, canPin = true }) {
  const isGroup = !!conversation.is_group;
  const other = conversation.participants?.[0];
  const { onMouseEnter, onMouseLeave } = usePrefetchOnHover();
  const compactTouchUi = useCompactTouchUi();
  const name = isGroup
    ? (conversation.group_name || conversation.participants?.map(p => p.display_name).join(', ') || 'Group')
    : (other?.display_name || 'Conversation');
  const id = conversation.conversation_id;
  const isLocalPrivate = !!conversation.is_local_private;
  const to = isLocalPrivate ? makeLocalPrivateRoute(conversation.local_private_peer_id || other?.id) : `/channels/@me/${id}`;
  const memberCount = isGroup ? (conversation.participants?.length || 0) : 0;

  const handleContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu?.(e, conversation);
  };

  const { longPressProps, shouldSkipClick } = useLongPress(
    useCallback((e) => {
      hapticImpact('Medium');
      onContextMenu?.(e, conversation);
    }, [conversation, onContextMenu]),
    { disabled: !compactTouchUi },
  );

  const handleLinkClick = useCallback((e) => {
    if (shouldSkipClick()) {
      e.preventDefault();
    }
  }, [shouldSkipClick]);

  const handleClose = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClose?.(conversation);
  };

  const handleAvatarContextMenu = (e) => {
    if (isGroup) {
      handleContextMenu(e);
      return;
    }
    e.stopPropagation();
  };

  return (
    <li>
      <Link
        to={to}
        className={`dm-item ${isActive ? 'active' : ''} ${unreadCount > 0 ? 'has-unread' : ''} ${isLocalPrivate ? 'local-private-dm' : ''}`}
        onContextMenu={compactTouchUi ? longPressProps.onContextMenu : handleContextMenu}
        onPointerDown={compactTouchUi ? longPressProps.onPointerDown : undefined}
        onPointerMove={compactTouchUi ? longPressProps.onPointerMove : undefined}
        onPointerUp={compactTouchUi ? longPressProps.onPointerUp : undefined}
        onPointerCancel={compactTouchUi ? longPressProps.onPointerCancel : undefined}
        onClick={compactTouchUi ? handleLinkClick : undefined}
        onMouseEnter={other?.id || !isLocalPrivate ? () => {
          if (!isGroup && other?.id) onMouseEnter(other.id, other);
          if (!isLocalPrivate) prefetchDmMessages(id);
        } : undefined}
        onMouseLeave={!isGroup ? onMouseLeave : undefined}
        draggable={false}
      >
        <span className="dm-item-avatar-wrap" onContextMenu={handleAvatarContextMenu}>
          {isGroup ? (
            <GroupAvatar participants={conversation.participants} size="medium" onContextMenu={handleAvatarContextMenu} />
          ) : (
            <ClickableAvatar
              user={other}
              size="medium"
              showPresence
              position="right"
              suppressProfileOpen
              suppressContextMenu={compactTouchUi}
              contextMenuContext={{
                conversationId: isLocalPrivate ? null : id,
                lastMessageId: isLocalPrivate ? null : (conversation.last_message_id || null),
                hasUnread: unreadCount > 0,
                isDmList: !isLocalPrivate,
                onPinConversation: isLocalPrivate ? undefined : onPinConversation,
                isPinned: isLocalPrivate ? false : isPinned,
                canPin: isLocalPrivate ? false : canPin,
              }}
            />
          )}
        </span>
        <span className="dm-item-info">
          <span className="dm-item-name">{name}</span>
          {isGroup ? (
            <span className="dm-item-status">{memberCount} members</span>
          ) : isLocalPrivate ? (
            <span className="dm-item-status local-private-dm-status"><AppIcon name="lock" size={12} /> Local sur cet appareil</span>
          ) : (
            other?.status_message && <span className="dm-item-status">{other.status_message}</span>
          )}
        </span>
        {unreadCount > 0 && (
          <span className="dm-unread-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
        <button className="dm-close-btn" onClick={handleClose} title="Close DM">
          <AppIcon name="close" size={16} weight="bold" />
        </button>
      </Link>
    </li>
  );
});

const Sidebar = memo(function Sidebar({
  user,
  conversations,
  currentConversationId,
  currentLocalPrivateUserId,
  onRefreshConversations,
  onAddConversation,
  onRemoveConversation,
  onRestoreConversation,
  loading,
  conversationsLoaded,
  onOpenSearch,
  width,
  onResizeStart,
  pendingFriendsCount = 0,
}) {
  const [showNewDM, setShowNewDM] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [dmSearch, setDmSearch] = useState('');
  const [dmResults, setDmResults] = useState([]);
  const [dmSearching, setDmSearching] = useState(false);
  const [conversationsWithPresence, setConversationsWithPresence] = useState([]);
  const [hiddenConversationIds, setHiddenConversationIds] = useState([]);
  const [pinnedIds, setPinnedIds] = useState(() => getPinnedConversations());
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, conversation: null });
  const [profileCard, setProfileCard] = useState({ userId: null, anchorEl: null });
  const [nicknameModalUser, setNicknameModalUser] = useState(null);
  const [noteModalUser, setNoteModalUser] = useState(null);
  const socket = useSocket();
  const { user: authUser } = useAuth();
  const { voiceConversationId, voiceUsers } = useVoice();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();
  const { notify } = useNotification();

  useEffect(() => {
    const hiddenSet = new Set(hiddenConversationIds);
    setConversationsWithPresence((conversations || []).filter((c) => !hiddenSet.has(c.conversation_id)));
  }, [conversations, hiddenConversationIds]);

  const performSearch = useCallback((q) => {
    if (q.length < 2) { setDmResults([]); setDmSearching(false); return; }
    setDmSearching(true);
    usersApi.search(q).then(setDmResults).catch(() => setDmResults([])).finally(() => setDmSearching(false));
  }, []);

  const debouncedSearch = useDebounce(performSearch, 300);

  const handleDmSearch = useCallback((q) => {
    setDmSearch(q);
    if (q.length < 2) { setDmResults([]); return; }
    debouncedSearch(q);
  }, [debouncedSearch]);

  const closeDmSearch = useCallback(() => {
    setShowNewDM(false);
    setDmSearch('');
    setDmResults([]);
  }, []);

  const startDm = useCallback((otherUser) => {
    directApi.createConversation(otherUser.id).then((conv) => {
      const convWithParticipants = { ...conv, participants: conv.participants || [otherUser] };
      onAddConversation?.(convWithParticipants);
      onRefreshConversations();
      closeDmSearch();
      navigate(`/channels/@me/${conv.conversation_id}`);
    }).catch(console.error);
  }, [onAddConversation, onRefreshConversations, navigate, closeDmSearch]);

  useEffect(() => {
    if (!showNewDM) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') closeDmSearch();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showNewDM, closeDmSearch]);

  const handleConversationContextMenu = useCallback((e, conversation) => {
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, conversation });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu({ visible: false, x: 0, y: 0, conversation: null });
  }, []);

  const handleViewProfile = useCallback(() => {
    const conversation = contextMenu.conversation;
    if (!conversation) return;

    if (conversation.is_group) {
      navigate(`/channels/@me/${conversation.conversation_id}`);
      closeContextMenu();
      return;
    }

    const other = conversation.participants?.[0];
    if (other?.id) {
      const virtualAnchor = { getBoundingClientRect: () => ({ top: contextMenu.y, bottom: contextMenu.y, left: contextMenu.x, right: contextMenu.x, width: 0, height: 0 }) };
      setProfileCard({ userId: other.id, anchorEl: virtualAnchor });
    }
    closeContextMenu();
  }, [contextMenu, closeContextMenu, navigate]);

  const togglePinConversation = useCallback((convId) => {
    if (!convId) return;
    setPinnedIds((prev) => {
      const isPinned = prev.includes(convId);
      let newPinned;
      if (isPinned) { newPinned = prev.filter((id) => id !== convId); }
      else { if (prev.length >= MAX_PINNED) return prev; newPinned = [...prev, convId]; }
      savePinnedConversations(newPinned);
      return newPinned;
    });
  }, []);

  const handlePinConversation = useCallback(() => {
    const convId = contextMenu.conversation?.conversation_id;
    togglePinConversation(convId);
  }, [contextMenu.conversation, togglePinConversation]);

  const handleCloseConversation = useCallback((conv) => {
    const convId = conv?.conversation_id;
    if (!convId) return;
    setHiddenConversationIds((prev) => (prev.includes(convId) ? prev : [...prev, convId]));
    setPinnedIds((prev) => {
      const next = prev.filter((id) => id !== convId);
      if (next.length !== prev.length) savePinnedConversations(next);
      return next;
    });
    setConversationsWithPresence((prev) => prev.filter((c) => c.conversation_id !== convId));
    if (conv.is_local_private) {
      if (!conv.accepted) {
        localPrivateApi.declineRequest(conv.local_private_peer_id).catch(() => {});
      }
      removeLocalPrivateChat(authUser?.id || user?.id, conv.local_private_peer_id);
      if (location.pathname === makeLocalPrivateRoute(conv.local_private_peer_id)) navigate('/channels/@me');
      return;
    }
    onRemoveConversation?.(convId);
    if (currentConversationId === String(convId)) navigate('/channels/@me');
    undoToast.show(
      t('sidebar.conversationDeleted'),
      async () => {
        try {
          await conversationsApi.delete(convId);
        } catch (err) {
          console.error('Failed to persist conversation deletion:', err);
          setHiddenConversationIds((prev) => prev.filter((id) => id !== convId));
          setConversationsWithPresence((prev) => {
            if (prev.some((c) => c.conversation_id === convId)) return prev;
            return [...prev, conv].sort((a, b) => new Date(b.last_message_at || b.created_at) - new Date(a.last_message_at || a.created_at));
          });
          onRestoreConversation?.(conv);
          notify.error('Failed to delete conversation. Please try again.');
        }
      },
      () => {
        setHiddenConversationIds((prev) => prev.filter((id) => id !== convId));
        setConversationsWithPresence((prev) => [...prev, conv].sort((a, b) => new Date(b.last_message_at || b.created_at) - new Date(a.last_message_at || a.created_at)));
        onRestoreConversation?.(conv);
      }
    );
  }, [authUser?.id, currentConversationId, location.pathname, navigate, onRemoveConversation, onRestoreConversation, notify, t, user?.id]);

  const handleDeleteConversation = useCallback(() => {
    if (contextMenu.conversation) handleCloseConversation(contextMenu.conversation);
    closeContextMenu();
  }, [contextMenu.conversation, handleCloseConversation, closeContextMenu]);

  const conv = contextMenu.conversation;
  const isGroup = !!conv?.is_group;
  const isLocalPrivate = !!conv?.is_local_private;
  const otherUser = conv?.participants?.[0];
  const convId = conv?.conversation_id;
  const dmCallUsers = convId ? (voiceUsers[`dm_${convId}`] || []) : [];
  const othersInCall = dmCallUsers.filter(u => u.id !== authUser?.id);
  const userContext = {
    conversationId: isLocalPrivate ? null : convId,
    lastMessageId: conv?.last_message_id || null,
    hasUnread: (conv?.unread_count || 0) > 0,
    isDmList: true,
    isInCallWaiting: convId && voiceConversationId === convId && othersInCall.length === 0,
    onPinConversation: convId ? () => { togglePinConversation(convId); closeContextMenu(); } : undefined,
    isPinned: convId ? pinnedIds.includes(convId) : false,
    canPin: !isLocalPrivate && pinnedIds.length < MAX_PINNED,
    onOpenNicknameModal: (u) => {
      setNicknameModalUser(u);
      closeContextMenu();
    },
    onOpenNoteModal: (u) => {
      setNoteModalUser(u);
      closeContextMenu();
    },
  };
  const getUserMenuItems = useUserContextMenuItems(otherUser || {}, userContext);

  const getContextMenuItems = useCallback(() => {
    if (!isGroup && otherUser) {
      return getUserMenuItems();
    }
    const isPinned = pinnedIds.includes(convId);
    const canPin = !isPinned && pinnedIds.length >= MAX_PINNED;
    return [
      { icon: Icons.profile, label: t('friends.message'), onClick: handleViewProfile },
      { separator: true },
      { icon: isPinned ? Icons.unpin : Icons.pin, label: isPinned ? t('chat.unpin') : t('chat.pin'), onClick: handlePinConversation, disabled: canPin },
      { separator: true },
      { icon: Icons.delete, label: t('chat.delete'), onClick: handleDeleteConversation, danger: true },
    ];
  }, [isGroup, otherUser, getUserMenuItems, convId, pinnedIds, handleViewProfile, handlePinConversation, handleDeleteConversation, t]);

  const isFriendsActive = location.pathname === '/channels/@me' && !currentConversationId;

  const allConversations = conversationsWithPresence || [];
  const pinned = useMemo(() => allConversations.filter((c) => pinnedIds.includes(c.conversation_id)), [allConversations, pinnedIds]);
  const unpinned = useMemo(() => allConversations.filter((c) => !pinnedIds.includes(c.conversation_id)), [allConversations, pinnedIds]);
  const showDmSkeleton = loading && allConversations.length === 0;

  return (
    <aside className="sidebar" data-tour-id="tour-dms" style={width ? { width, minWidth: width } : undefined}>
      {onResizeStart && (
        <div
          className="sidebar-resize-handle"
          onMouseDown={onResizeStart}
          role="separator"
          aria-orientation="vertical"
          aria-label="Redimensionner la barre latérale"
        />
      )}
      {/* Search bar at top (Discord style) */}
      <button className="sidebar-search-btn" onClick={onOpenSearch} data-tour-id="tour-search">
        <span>Find or start a conversation</span>
      </button>

      <nav className="sidebar-nav">
        <div className="sidebar-top-nav">
          <Link to="/channels/@me" className={`sidebar-nav-item ${isFriendsActive ? 'active' : ''}`} draggable={false}>
            <AppIcon name="friends" size={24} className="sidebar-nav-icon" />
            <span>{t('sidebar.friends')}</span>
            {pendingFriendsCount > 0 && (
              <span className="sidebar-friends-badge">{pendingFriendsCount > 99 ? '99+' : pendingFriendsCount}</span>
            )}
          </Link>

          <Link to="/security" className={`sidebar-nav-item sidebar-nav-btn ${location.pathname === '/security' ? 'active' : ''}`} draggable={false}>
            <AppIcon name="security" size={24} className="sidebar-nav-icon" />
            <span>{t('sidebar.securityDashboard')}</span>
          </Link>

          <Link to="/nitro" className={`sidebar-nav-item sidebar-nav-btn ${location.pathname === '/nitro' ? 'active' : ''}`} draggable={false}>
            <AppIcon name="nitro" size={24} className="sidebar-nav-icon" />
            <span>{t('sidebar.nitro')}</span>
          </Link>

          <Link to="/quests" className={`sidebar-nav-item sidebar-nav-btn ${location.pathname === '/quests' ? 'active' : ''}`} draggable={false}>
            <AppIcon name="quests" size={24} className="sidebar-nav-icon" />
            <span>{t('sidebar.quests')}</span>
          </Link>
        </div>

        <div className="sidebar-dm-panel">
        {/* DM section header */}
        <div className="sidebar-section-header">
          <span>{t('sidebar.directMessages')}</span>
          <div className="sidebar-section-actions">
            <button
              type="button"
              className="sidebar-add"
              onClick={() => setShowCreateGroup(true)}
              title={t('sidebar.createGroup')}
              aria-label={t('sidebar.createGroup')}
            >
              <AppIcon name="friends" size={16} />
            </button>
            <button
              type="button"
              className={`sidebar-add ${showNewDM ? 'active' : ''}`}
              onClick={() => (showNewDM ? closeDmSearch() : setShowNewDM(true))}
              title={t('sidebar.newConversation')}
              aria-label={t('sidebar.newConversation')}
              aria-expanded={showNewDM}
            >
              <AppIcon name="plus" size={16} />
            </button>
          </div>
        </div>

        {/* New DM search */}
        {showNewDM && (
          <div className="sidebar-dm-search">
            <input
              type="text"
              className="sidebar-dm-search-input"
              value={dmSearch}
              onChange={(e) => handleDmSearch(e.target.value)}
              placeholder={t('sidebar.searchUsers')}
              autoFocus
            />
            {dmSearching && (
              <div className="sidebar-dm-skeleton">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="sidebar-dm-skeleton-row">
                    <div className="sidebar-dm-skeleton-avatar" />
                    <div className="sidebar-dm-skeleton-info">
                      <div className="sidebar-dm-skeleton-name" />
                      <div className="sidebar-dm-skeleton-username" />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {dmResults.length > 0 && (
              <ul className="sidebar-dm-results">
                {dmResults.map((u) => (
                  <li key={u.id}>
                    <button type="button" onClick={() => startDm(u)}>
                      <ClickableAvatar user={u} size="small" showPresence />
                      <span className="sidebar-dm-result-info">
                        <span className="sidebar-dm-result-name">{u.display_name}</span>
                        {u.username && <span className="sidebar-dm-result-username">@{u.username}</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* DM list */}
        <ul className="sidebar-dm-list">
          {showDmSkeleton ? (
            Array.from({ length: 4 }).map((_, i) => (
              <li key={`skeleton-${i}`} className="sidebar-dm-skeleton-item">
                <div className="sidebar-dm-skeleton-avatar" />
                <div className="sidebar-dm-skeleton-info">
                  <div className="sidebar-dm-skeleton-line sidebar-dm-skeleton-name" />
                  <div className="sidebar-dm-skeleton-line sidebar-dm-skeleton-status" />
                </div>
              </li>
            ))
          ) : (
            <>
              {pinned.map((c) => (
                <DMItem
                  key={c.conversation_id}
                  conversation={c}
                  isActive={c.is_local_private ? currentLocalPrivateUserId === String(c.local_private_peer_id) : currentConversationId === String(c.conversation_id)}
                  onContextMenu={handleConversationContextMenu}
                  onClose={handleCloseConversation}
                  unreadCount={currentConversationId === String(c.conversation_id) ? 0 : (c.unread_count || 0)}
                  onPinConversation={() => togglePinConversation(c.conversation_id)}
                  isPinned={true}
                />
              ))}
              {unpinned.map((c) => (
                <DMItem
                  key={c.conversation_id}
                  conversation={c}
                  isActive={c.is_local_private ? currentLocalPrivateUserId === String(c.local_private_peer_id) : currentConversationId === String(c.conversation_id)}
                  onContextMenu={handleConversationContextMenu}
                  onClose={handleCloseConversation}
                  unreadCount={currentConversationId === String(c.conversation_id) ? 0 : (c.unread_count || 0)}
                  onPinConversation={() => togglePinConversation(c.conversation_id)}
                  isPinned={false}
                  canPin={pinnedIds.length < MAX_PINNED}
                />
              ))}
            </>
          )}
        </ul>
        </div>
        {/* Admin button */}
        {user?.role === 'admin' && (
          <div className="sidebar-admin-btn-wrap">
            <Link to="/admin" className="sidebar-admin-btn" draggable={false}>
              <AppIcon name="admin" size={18} />
              <span>Administration</span>
            </Link>
          </div>
        )}
      </nav>


      {contextMenu.visible && (
        <ContextMenu
          title={!isGroup && otherUser ? (otherUser.display_name || otherUser.username) : (isGroup ? (conv?.group_name || 'Group') : undefined)}
          x={contextMenu.x}
          y={contextMenu.y}
          items={getContextMenuItems()}
          onClose={closeContextMenu}
        />
      )}

      <CreateGroupModal
        isOpen={showCreateGroup}
        onClose={() => setShowCreateGroup(false)}
        currentUser={authUser || user}
        onGroupCreated={(conv) => {
          onAddConversation?.(conv);
          onRefreshConversations?.();
          navigate(`/channels/@me/${conv.conversation_id}`);
        }}
      />

      <ProfileCard
        userId={profileCard.userId}
        isOpen={!!profileCard.userId}
        onClose={() => setProfileCard({ userId: null, anchorEl: null })}
        anchorEl={profileCard.anchorEl}
        position="right"
      />

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
    </aside>
  );
});

export default Sidebar;
