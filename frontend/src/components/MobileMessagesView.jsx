import React, { useMemo, memo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { AvatarImg } from './Avatar';
import ClickableAvatar from './ClickableAvatar';
import ContextMenu from './ContextMenu';
import ProfileCard from './ProfileCard';
import AddNoteModal from './AddNoteModal';
import FriendNicknameModal from './FriendNicknameModal';
import { makeLocalPrivateRoute } from '../utils/localPrivateChatCrypto';
import { dmPath } from '../utils/appRoutes';
import { useCompactTouchUi } from '../hooks/useCompactTouchUi';
import { useLongPress } from '../hooks/useLongPress';
import { useDmConversationContextMenu } from '../hooks/useDmConversationContextMenu';
import { hapticImpact } from '../utils/nativeHaptics';
import { Lock } from 'lucide-react';
import './Sidebar.css';
import './MobileMessagesView.css';

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

const DMItem = memo(function DMItem({
  conversation,
  isActive,
  currentConversationId,
  onContextMenu,
  onPinConversation,
  isPinned,
  canPin,
}) {
  const compactTouchUi = useCompactTouchUi();
  const isGroup = !!conversation.is_group;
  const other = conversation.participants?.[0];
  const name = isGroup
    ? (conversation.group_name || conversation.participants?.map((p) => p.display_name).join(', ') || 'Group')
    : (other?.display_name || 'Conversation');
  const id = conversation.conversation_id;
  const isLocalPrivate = !!conversation.is_local_private;
  const to = isLocalPrivate ? makeLocalPrivateRoute(conversation.local_private_peer_id || other?.id) : dmPath(conversation);
  const memberCount = isGroup ? (conversation.participants?.length || 0) : 0;
  const unreadCount = currentConversationId === String(id) ? 0 : (conversation.unread_count || 0);
  const lastPreview = conversation.last_message_preview || '';

  const handleContextMenu = useCallback((e) => {
    e.preventDefault?.();
    e.stopPropagation?.();
    onContextMenu?.(e, conversation);
  }, [conversation, onContextMenu]);

  const { longPressProps, shouldSkipClick } = useLongPress(
    useCallback((e) => {
      hapticImpact('Medium');
      onContextMenu?.(e, conversation);
    }, [conversation, onContextMenu]),
    { disabled: !compactTouchUi, delay: 420 },
  );

  const handleLinkClick = useCallback((e) => {
    if (shouldSkipClick()) e.preventDefault();
  }, [shouldSkipClick]);

  const stopAvatarPointer = useCallback((e) => {
    if (!compactTouchUi) return;
    e.stopPropagation();
  }, [compactTouchUi]);

  return (
    <Link
      to={to}
      className={`mobile-dm-item ${isActive ? 'active' : ''} ${unreadCount > 0 ? 'has-unread' : ''} ${isLocalPrivate ? 'local-private-dm' : ''}`}
      draggable={false}
      onContextMenu={compactTouchUi ? longPressProps.onContextMenu : handleContextMenu}
      onPointerDown={compactTouchUi ? longPressProps.onPointerDown : undefined}
      onPointerMove={compactTouchUi ? longPressProps.onPointerMove : undefined}
      onPointerUp={compactTouchUi ? longPressProps.onPointerUp : undefined}
      onPointerCancel={compactTouchUi ? longPressProps.onPointerCancel : undefined}
      onClick={compactTouchUi ? handleLinkClick : undefined}
    >
      <span
        className="mobile-dm-avatar-wrap"
        onPointerDown={stopAvatarPointer}
        onPointerMove={stopAvatarPointer}
        onPointerUp={stopAvatarPointer}
      >
        {isGroup ? (
          <GroupAvatar participants={conversation.participants} size="medium" />
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
  onRemoveConversation,
  onRestoreConversation,
}) {
  const { t } = useLanguage();

  const {
    pinnedIds,
    togglePinConversation,
    handleConversationContextMenu,
    closeContextMenu,
    contextMenu,
    getContextMenuItems,
    contextMenuTitle,
    filterVisibleConversations,
    profileCard,
    setProfileCard,
    nicknameModalUser,
    setNicknameModalUser,
    noteModalUser,
    setNoteModalUser,
  } = useDmConversationContextMenu({
    currentConversationId,
    onRemoveConversation,
    onRestoreConversation,
  });

  const allConversations = filterVisibleConversations(conversations);
  const pinned = useMemo(() => allConversations.filter((c) => pinnedIds.includes(c.conversation_id)), [allConversations, pinnedIds]);
  const unpinned = useMemo(() => allConversations.filter((c) => !pinnedIds.includes(c.conversation_id)), [allConversations, pinnedIds]);

  const showDmSkeleton = loading && allConversations.length === 0;

  const renderDmItem = (c, isPinnedRow) => (
    <DMItem
      key={c.conversation_id}
      conversation={c}
      isActive={c.is_local_private ? currentLocalPrivateUserId === String(c.local_private_peer_id) : currentConversationId === String(c.conversation_id)}
      currentConversationId={currentConversationId}
      onContextMenu={handleConversationContextMenu}
      onPinConversation={() => togglePinConversation(c.conversation_id)}
      isPinned={isPinnedRow}
      canPin={pinnedIds.length < 5}
    />
  );

  return (
    <div className="mobile-messages-view">
      <button className="sidebar-search-btn" onClick={onOpenSearch} type="button">
        <span>{t('mobileMessages.searchMessages')}</span>
      </button>

      <div className="sidebar-nav-panel">
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
            {pinned.length > 0 && (
              <div className="mobile-dm-section">
                <span className="mobile-dm-section-label">{t('mobileMessages.sectionPinned')}</span>
                {pinned.map((c) => renderDmItem(c, true))}
              </div>
            )}
            {unpinned.length > 0 && (
              <div className="mobile-dm-section">
                <span className="mobile-dm-section-label">{t('mobileMessages.sectionDirectMessages')}</span>
                {unpinned.map((c) => renderDmItem(c, false))}
              </div>
            )}
            {pinned.length === 0 && unpinned.length === 0 && !showDmSkeleton && (
              <div className="mobile-messages-empty">
                <p>{t('mobileMessages.emptyTitle')}</p>
                <span>{t('mobileMessages.emptySubtitle')}</span>
              </div>
            )}
          </>
        )}
      </div>
      </div>

      {contextMenu.visible && (
        <ContextMenu
          title={contextMenuTitle}
          items={getContextMenuItems()}
          onClose={closeContextMenu}
        />
      )}

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
    </div>
  );
}
