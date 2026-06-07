import React, { useState, useMemo, memo } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { AvatarImg } from './Avatar';
import ClickableAvatar from './ClickableAvatar';
import { makeLocalPrivateRoute } from '../utils/localPrivateChatCrypto';
import { Lock } from 'lucide-react';
import './MobileMessagesView.css';

function getPinnedConversations() {
  try {
    const pinned = localStorage.getItem('slide_pinned_conversations');
    return pinned ? JSON.parse(pinned) : [];
  } catch {
    return [];
  }
}

const MAX_PINNED = 5;

const GroupAvatar = memo(function GroupAvatar({ participants, size = 'medium' }) {
  const avatars = (participants || []).slice(0, 3);
  const sizeMap = { small: 24, medium: 40, large: 48 };
  const px = sizeMap[size] || 40;
  return (
    <div className="mobile-dm-group-avatar" style={{ width: px, height: px }}>
      {avatars.map((u, i) => (
        <div key={u.id} className={`mobile-dm-group-item mobile-dm-group-pos-${i}-of-${Math.min(avatars.length, 3)}`}>
          {u.avatar_url ? (
            <AvatarImg src={u.avatar_url} alt="" />
          ) : (
            <span className="mobile-dm-group-fallback">{(u.display_name || '?').charAt(0).toUpperCase()}</span>
          )}
        </div>
      ))}
    </div>
  );
});

const DMItem = memo(function DMItem({ conversation, isActive, currentConversationId }) {
  const isGroup = !!conversation.is_group;
  const other = conversation.participants?.[0];
  const name = isGroup
    ? (conversation.group_name || conversation.participants?.map(p => p.display_name).join(', ') || 'Group')
    : (other?.display_name || 'Conversation');
  const id = conversation.conversation_id;
  const isLocalPrivate = !!conversation.is_local_private;
  const to = isLocalPrivate ? makeLocalPrivateRoute(conversation.local_private_peer_id || other?.id) : `/channels/@me/${id}`;
  const memberCount = isGroup ? (conversation.participants?.length || 0) : 0;
  const unreadCount = currentConversationId === String(id) ? 0 : (conversation.unread_count || 0);
  const lastPreview = conversation.last_message_preview || '';

  return (
    <Link
      to={to}
      className={`mobile-dm-item ${isActive ? 'active' : ''} ${unreadCount > 0 ? 'has-unread' : ''} ${isLocalPrivate ? 'local-private-dm' : ''}`}
      draggable={false}
    >
      <span className="mobile-dm-avatar-wrap">
        {isGroup ? (
          <GroupAvatar participants={conversation.participants} size="medium" />
        ) : (
          <ClickableAvatar user={other} size="medium" showPresence position="right" suppressProfileOpen />
        )}
      </span>
      <span className="mobile-dm-info">
        <span className="mobile-dm-row">
          <span className="mobile-dm-name">{name}</span>
          {unreadCount > 0 && (
            <span className="mobile-dm-unread-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
          )}
        </span>
        {lastPreview ? (
          <span className="mobile-dm-preview">{lastPreview}</span>
        ) : isLocalPrivate ? (
          <span className="mobile-dm-preview mobile-local-private-preview"><Lock size={12} /> Local sur cet appareil</span>
        ) : isGroup ? (
          <span className="mobile-dm-preview">{memberCount} members</span>
        ) : null}
      </span>
    </Link>
  );
});

export default function MobileMessagesView({
  conversations,
  currentConversationId,
  currentLocalPrivateUserId,
  loading,
  onOpenSearch,
  pendingFriendsCount = 0,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [pinnedIds] = useState(() => getPinnedConversations());

  const allConversations = conversations || [];
  const pinned = useMemo(() => allConversations.filter((c) => pinnedIds.includes(c.conversation_id)), [allConversations, pinnedIds]);
  const unpinned = useMemo(() => allConversations.filter((c) => !pinnedIds.includes(c.conversation_id)), [allConversations, pinnedIds]);

  const filteredPinned = useMemo(() => {
    if (!searchQuery.trim()) return pinned;
    const q = searchQuery.toLowerCase();
    return pinned.filter((c) => {
      const name = c.is_group
        ? (c.group_name || c.participants?.map(p => p.display_name).join(' ') || '')
        : (c.participants?.[0]?.display_name || c.participants?.[0]?.username || '');
      return name.toLowerCase().includes(q);
    });
  }, [pinned, searchQuery]);

  const filteredUnpinned = useMemo(() => {
    if (!searchQuery.trim()) return unpinned;
    const q = searchQuery.toLowerCase();
    return unpinned.filter((c) => {
      const name = c.is_group
        ? (c.group_name || c.participants?.map(p => p.display_name).join(' ') || '')
        : (c.participants?.[0]?.display_name || c.participants?.[0]?.username || '');
      return name.toLowerCase().includes(q);
    });
  }, [unpinned, searchQuery]);

  const showDmSkeleton = loading && allConversations.length === 0;
  const { t } = useLanguage();

  return (
    <div className="mobile-messages-view">
      <div className="mobile-messages-toolbar">
        <Link to="/friends" className="mobile-messages-friends-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
          </svg>
          <span>{t('friends.title')}</span>
          {pendingFriendsCount > 0 && (
            <span className="mobile-messages-friends-badge">{pendingFriendsCount > 99 ? '99+' : pendingFriendsCount}</span>
          )}
        </Link>
        <button className="mobile-messages-search" onClick={onOpenSearch} type="button">
          <span className="mobile-messages-search-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </span>
          <span className="mobile-messages-search-text">{t('mobileMessages.searchMessages')}</span>
        </button>
      </div>

      <div className="mobile-messages-search-inline">
        <input
          type="text"
          placeholder={t('mobileMessages.filterConversations')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="mobile-messages-search-input"
        />
      </div>

      <div className="mobile-messages-list">
        {showDmSkeleton ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={`skeleton-${i}`} className="mobile-dm-skeleton">
              <div className="mobile-dm-skeleton-avatar" />
              <div className="mobile-dm-skeleton-info">
                <div className="mobile-dm-skeleton-name" />
                <div className="mobile-dm-skeleton-preview" />
              </div>
            </div>
          ))
        ) : (
          <>
            {filteredPinned.length > 0 && (
              <div className="mobile-dm-section">
                <span className="mobile-dm-section-label">{t('mobileMessages.sectionPinned')}</span>
                {filteredPinned.map((c) => (
                  <DMItem
                    key={c.conversation_id}
                    conversation={c}
                    isActive={c.is_local_private ? currentLocalPrivateUserId === String(c.local_private_peer_id) : currentConversationId === String(c.conversation_id)}
                    currentConversationId={currentConversationId}
                  />
                ))}
              </div>
            )}
            {filteredUnpinned.length > 0 && (
              <div className="mobile-dm-section">
                <span className="mobile-dm-section-label">{t('mobileMessages.sectionDirectMessages')}</span>
                {filteredUnpinned.map((c) => (
                  <DMItem
                    key={c.conversation_id}
                    conversation={c}
                    isActive={c.is_local_private ? currentLocalPrivateUserId === String(c.local_private_peer_id) : currentConversationId === String(c.conversation_id)}
                    currentConversationId={currentConversationId}
                  />
                ))}
              </div>
            )}
            {filteredPinned.length === 0 && filteredUnpinned.length === 0 && !showDmSkeleton && (
              <div className="mobile-messages-empty">
                <p>{t('mobileMessages.emptyTitle')}</p>
                <span>{t('mobileMessages.emptySubtitle')}</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
