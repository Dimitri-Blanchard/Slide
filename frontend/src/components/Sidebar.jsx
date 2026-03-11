import React, { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { direct as directApi, users as usersApi, conversations as conversationsApi } from '../api';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import Avatar, { AvatarImg } from './Avatar';
import ClickableAvatar from './ClickableAvatar';
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
import { useOrbs } from '../context/OrbsContext';
import UserPanel from './UserPanel';
import { Lock } from 'lucide-react';
import { VoiceStatusBar } from './ChannelList';
import './Sidebar.css';
import './ChannelList.css'; /* for .voice-status-bar */

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

const GroupAvatar = memo(function GroupAvatar({ participants, size = 'medium' }) {
  const avatars = (participants || []).slice(0, 3);
  const sizeMap = { small: 24, medium: 32, large: 40 };
  const px = sizeMap[size] || 32;
  
  return (
    <div className="group-avatar-stack" style={{ width: px, height: px }}>
      {avatars.map((u, i) => (
        <div key={u.id} className={`group-avatar-item group-avatar-pos-${i}-of-${Math.min(avatars.length, 3)}`}>
          {u.avatar_url ? (
            <AvatarImg src={u.avatar_url} alt="" />
          ) : (
            <span className="group-avatar-fallback">
              {(u.display_name || '?').charAt(0).toUpperCase()}
            </span>
          )}
        </div>
      ))}
    </div>
  );
});

const DMItem = memo(function DMItem({ conversation, isActive, onContextMenu, onClose, unreadCount = 0, onPinConversation, isPinned, canPin = true }) {
  const isGroup = conversation.is_group;
  const other = conversation.participants?.[0];
  const { onMouseEnter, onMouseLeave } = usePrefetchOnHover();
  const name = isGroup
    ? (conversation.group_name || conversation.participants?.map(p => p.display_name).join(', ') || 'Group')
    : (other?.display_name || 'Conversation');
  const id = conversation.conversation_id;
  const memberCount = isGroup ? (conversation.participants?.length || 0) : 0;

  const handleContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu?.(e, conversation);
  };

  const handleClose = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClose?.(conversation);
  };

  return (
    <li>
      <Link
        to={`/channels/@me/${id}`}
        className={`dm-item ${isActive ? 'active' : ''} ${unreadCount > 0 ? 'has-unread' : ''}`}
        onContextMenu={handleContextMenu}
        onMouseEnter={!isGroup && other?.id ? () => onMouseEnter(other.id, other) : undefined}
        onMouseLeave={!isGroup ? onMouseLeave : undefined}
        draggable={false}
      >
        <span className="dm-item-avatar-wrap" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }} onContextMenu={(e) => e.stopPropagation()}>
          {isGroup ? (
            <GroupAvatar participants={conversation.participants} size="medium" />
          ) : (
            <ClickableAvatar
              user={other}
              size="medium"
              showPresence
              position="right"
              contextMenuContext={{
                conversationId: id,
                lastMessageId: conversation.last_message_id || null,
                hasUnread: unreadCount > 0,
                isDmList: true,
                onPinConversation,
                isPinned,
                canPin,
              }}
            />
          )}
        </span>
        <span className="dm-item-info">
          <span className="dm-item-name">{name}</span>
          {isGroup ? (
            <span className="dm-item-status">{memberCount} members</span>
          ) : (
            other?.status_message && <span className="dm-item-status">{other.status_message}</span>
          )}
        </span>
        {unreadCount > 0 && (
          <span className="dm-unread-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
        <button className="dm-close-btn" onClick={handleClose} title="Close DM">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.4 4L12 10.4L5.6 4L4 5.6L10.4 12L4 18.4L5.6 20L12 13.6L18.4 20L20 18.4L13.6 12L20 5.6L18.4 4Z"/>
          </svg>
        </button>
      </Link>
    </li>
  );
});

const Sidebar = memo(function Sidebar({
  user,
  conversations,
  currentConversationId,
  onRefreshConversations,
  onAddConversation,
  onRemoveConversation,
  onRestoreConversation,
  loading,
  conversationsLoaded,
  onOpenSearch,
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
  const orbs = useOrbs();
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

  const startDm = useCallback((otherUser) => {
    directApi.createConversation(otherUser.id).then((conv) => {
      const convWithParticipants = { ...conv, participants: conv.participants || [otherUser] };
      onAddConversation?.(convWithParticipants);
      onRefreshConversations();
      setShowNewDM(false);
      setDmSearch('');
      setDmResults([]);
      navigate(`/channels/@me/${conv.conversation_id}`);
    }).catch(console.error);
  }, [onAddConversation, onRefreshConversations, navigate]);

  const handleConversationContextMenu = useCallback((e, conversation) => {
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, conversation });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu({ visible: false, x: 0, y: 0, conversation: null });
  }, []);

  const handleViewProfile = useCallback(() => {
    const other = contextMenu.conversation?.participants?.[0];
    if (other?.id) {
      const virtualAnchor = { getBoundingClientRect: () => ({ top: contextMenu.y, bottom: contextMenu.y, left: contextMenu.x, right: contextMenu.x, width: 0, height: 0 }) };
      setProfileCard({ userId: other.id, anchorEl: virtualAnchor });
    }
    closeContextMenu();
  }, [contextMenu, closeContextMenu]);

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
  }, [currentConversationId, navigate, t, onRemoveConversation, onRestoreConversation, notify]);

  const handleDeleteConversation = useCallback(() => {
    if (contextMenu.conversation) handleCloseConversation(contextMenu.conversation);
    closeContextMenu();
  }, [contextMenu.conversation, handleCloseConversation, closeContextMenu]);

  const conv = contextMenu.conversation;
  const isGroup = conv?.is_group;
  const otherUser = conv?.participants?.[0];
  const convId = conv?.conversation_id;
  const dmCallUsers = convId ? (voiceUsers[`dm_${convId}`] || []) : [];
  const othersInCall = dmCallUsers.filter(u => u.id !== authUser?.id);
  const userContext = {
    conversationId: convId,
    lastMessageId: conv?.last_message_id || null,
    hasUnread: (conv?.unread_count || 0) > 0,
    isDmList: true,
    isInCallWaiting: convId && voiceConversationId === convId && othersInCall.length === 0,
    onPinConversation: convId ? () => { togglePinConversation(convId); closeContextMenu(); } : undefined,
    isPinned: convId ? pinnedIds.includes(convId) : false,
    canPin: pinnedIds.length < MAX_PINNED,
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
    <aside className="sidebar" data-tour-id="tour-dms">
      {/* Search bar at top (Discord style) */}
      <button className="sidebar-search-btn" onClick={onOpenSearch} data-tour-id="tour-search">
        <span>Find or start a conversation</span>
      </button>

      <nav className="sidebar-nav">
        <div className="sidebar-top-nav">
          <Link to="/channels/@me" className={`sidebar-nav-item ${isFriendsActive ? 'active' : ''}`} draggable={false}>
            <svg className="sidebar-nav-icon" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
            </svg>
            <span>{t('sidebar.friends')}</span>
          </Link>

          <Link to="/security" className={`sidebar-nav-item sidebar-nav-btn ${location.pathname === '/security' ? 'active' : ''}`} draggable={false}>
            <svg className="sidebar-nav-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <span>{t('sidebar.securityDashboard')}</span>
          </Link>

          <Link to="/nitro" className={`sidebar-nav-item sidebar-nav-btn ${location.pathname === '/nitro' ? 'active' : ''}`} draggable={false}>
            <svg className="sidebar-nav-icon" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 8.5L12 2l9.99 6.5L12 15 2.01 8.5zM12 4.31l6.22 4.04L12 12.69 5.78 8.35 12 4.31zM2 15.5l10 6.5 10-6.5-1.5-1-8.5 5.5-8.5-5.5-1.5 1z"/>
              <path d="M2 11.5l10 6.5 10-6.5-1.5-1L12 16.5 3.5 10.5 2 11.5z"/>
            </svg>
            <span>{t('sidebar.nitro')}</span>
          </Link>

          <Link to="/shop" className={`sidebar-nav-item sidebar-nav-btn ${location.pathname === '/shop' ? 'active' : ''}`} draggable={false}>
            <svg className="sidebar-nav-icon" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18 6h-2c0-2.21-1.79-4-4-4S8 3.79 8 6H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6-2c1.1 0 2 .9 2 2h-4c0-1.1.9-2 2-2zm6 14H6V8h2v2c0 .55.45 1 1 1s1-.45 1-1V8h4v2c0 .55.45 1 1 1s1-.45 1-1V8h2v10z"/>
            </svg>
            <span>{t('sidebar.shop')}</span>
            {orbs > 0 ? <span className="sidebar-nav-badge sidebar-orbs-badge">{orbs}</span> : null}
          </Link>

          <Link to="/quests" className={`sidebar-nav-item sidebar-nav-btn ${location.pathname === '/quests' ? 'active' : ''}`} draggable={false}>
            <svg className="sidebar-nav-icon" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-5.5-2.5l7.51-3.49L17.5 6.5 9.99 9.99 6.5 17.5zm5.5-6.6c.61 0 1.1.49 1.1 1.1s-.49 1.1-1.1 1.1-1.1-.49-1.1-1.1.49-1.1 1.1-1.1z"/>
            </svg>
            <span>{t('sidebar.quests')}</span>
          </Link>
        </div>

        {/* DM section header */}
        <div className="sidebar-section-header">
          <span>{t('sidebar.directMessages')}</span>
          <div className="sidebar-section-actions">
            <button
              type="button"
              className="sidebar-add"
              onClick={() => setShowCreateGroup(true)}
              title="Create Group"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
                <path d="M20 15v-3h-2v3h-3v2h3v3h2v-3h3v-2h-3z"/>
              </svg>
            </button>
            <button
              type="button"
              className="sidebar-add"
              onClick={() => setShowNewDM(true)}
              title={t('sidebar.newConversation')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
              </svg>
            </button>
          </div>
        </div>

        {/* New DM search */}
        {showNewDM && (
          <div className="sidebar-dm-search">
            <input
              type="text"
              value={dmSearch}
              onChange={(e) => handleDmSearch(e.target.value)}
              placeholder={t('common.search')}
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
            <button type="button" className="sidebar-close-dm" onClick={() => { setShowNewDM(false); setDmSearch(''); setDmResults([]); }}>
              {t('common.close')}
            </button>
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
                  isActive={currentConversationId === String(c.conversation_id)}
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
                  isActive={currentConversationId === String(c.conversation_id)}
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
        {/* Admin button */}
        {user?.role === 'admin' && (
          <div className="sidebar-admin-btn-wrap">
            <Link to="/admin" className="sidebar-admin-btn" draggable={false}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
              </svg>
              <span>Administration</span>
            </Link>
          </div>
        )}
      </nav>

      <VoiceStatusBar />
      <UserPanel />

      {contextMenu.visible && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} items={getContextMenuItems()} onClose={closeContextMenu} />
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
