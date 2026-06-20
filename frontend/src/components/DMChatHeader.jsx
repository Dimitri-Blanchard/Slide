import React, { useState, useRef, useMemo, useCallback, useEffect, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Phone,
  PhoneOff,
  PhoneIncoming,
  Pin,
  Users,
  ChevronLeft,
  Video,
  VideoOff,
  UserPlus,
  Contact,
  Search,
} from 'lucide-react';
import ClickableAvatar from './ClickableAvatar';
import Avatar from './Avatar';
import PinnedMessages from './PinnedMessages';
import { useLanguage } from '../context/LanguageContext';

function stripInvisible(value) {
  return String(value || '').replace(/[\u200B-\u200D\uFEFF]/g, '');
}

function normalizeHandle(value) {
  return stripInvisible(value)
    .replace(/(\s+|#)0*\s*$/, '')
    .replace(/(?<![0-9])0\s*$/, '')
    .replace(/([^\d])0+\s*$/, '$1')
    .trim();
}

function getMessageSender(msg) {
  if (msg?.sender) return msg.sender;
  return {
    id: msg?.sender_id,
    display_name: msg?.sender_name || '',
    avatar_url: msg?.sender_avatar,
  };
}

const DMChatHeader = memo(function DMChatHeader({
  isMobile,
  showPlaceholder,
  isGroup,
  other,
  otherUsers,
  title,
  conversationId,
  messages,
  pinnedMessageIds,
  pinnedMessages,
  showPinnedPanel,
  onTogglePinnedPanel,
  onScrollToMessage,
  isInCall,
  canJoinCall,
  onVoiceCall,
  isCameraOn,
  onVideoCall,
  showProfileSidebar,
  onToggleProfileSidebar,
  profileSidebarDocked = true,
  onOpenProfile,
  showGroupMembers,
  onToggleGroupMembers,
  onOpenCreateGroup,
  headerInfoRef,
  onPrefetchEnter,
  onPrefetchLeave,
  lastMessageId,
  isInCallWaiting,
}) {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const pinnedAnchorRef = useRef(null);
  const searchRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  const username = !isGroup
    ? normalizeHandle(other?.username || other?.email?.split('@')[0] || '')
    : null;

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 1 || !messages?.length) return [];
    return messages
      .filter((m) => {
        if (!['text', 'reply'].includes(m.type)) return false;
        const text = (m.content || m.caption || '').toLowerCase();
        return text.includes(q);
      })
      .slice(-20)
      .reverse()
      .slice(0, 8);
  }, [searchQuery, messages]);

  const showSearchDropdown = searchFocused && searchQuery.trim().length > 0;

  useEffect(() => {
    if (!showSearchDropdown) return;
    const onDown = (e) => {
      if (!searchRef.current?.contains(e.target)) {
        setSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showSearchDropdown]);

  const handleSearchSelect = useCallback((messageId) => {
    onScrollToMessage?.(messageId);
    setSearchQuery('');
    setSearchFocused(false);
  }, [onScrollToMessage]);

  const searchLabel = username
    ? (t('dmHeader.searchUser', { username }) || `Search ${username}`)
    : (t('dmHeader.searchConversation') || 'Search conversation');
  const searchPlaceholder = t('dmHeader.searchShort') || 'Search';

  return (
    <header className="chat-header chat-header-dm">
      {isMobile && (
        <button className="dc-mobile-back" onClick={() => navigate('/channels/@me')} aria-label={t('common.back') || 'Back'}>
          <ChevronLeft size={22} strokeWidth={2} />
        </button>
      )}

      {showPlaceholder ? (
        <>
          <div className="chat-header-skeleton-avatar" />
          <div className="chat-header-info">
            <div className="chat-header-skeleton-title" />
          </div>
        </>
      ) : isGroup ? (
        <div className="group-header-icon" onClick={onToggleGroupMembers}>
          <Users size={18} strokeWidth={2} />
        </div>
      ) : (
        <ClickableAvatar
          user={other}
          size="medium"
          showPresence
          position="bottom"
          contextMenuContext={{
            conversationId,
            lastMessageId,
            hasUnread: false,
            isInCallWaiting,
          }}
        />
      )}

      {!showPlaceholder && (
        <>
          <div
            ref={headerInfoRef}
            className="chat-header-info dm-header-identity"
            onMouseEnter={!isGroup && other?.id ? onPrefetchEnter : undefined}
            onMouseLeave={!isGroup ? onPrefetchLeave : undefined}
          >
            <div className="dm-header-name-wrap">
              <h1 className="chat-header-title">{title}</h1>
              {!isGroup && username && username.toLowerCase() !== String(title || '').toLowerCase() && (
                <div className="dm-header-username-tooltip" role="tooltip">
                  {username}
                </div>
              )}
            </div>
          </div>

          <div className="dm-header-toolbar">
            <div className="dm-header-actions">
              <button
                type="button"
                className={`dm-action-btn ${isInCall ? 'active' : ''} ${canJoinCall ? 'join-call' : ''}`}
                onClick={onVoiceCall}
                title={
                  isInCall
                    ? t('call.endCall', 'End Call')
                    : canJoinCall
                      ? t('call.joinCall', 'Join Call')
                      : t('call.startCall', 'Start Voice Call')
                }
              >
                {isInCall ? (
                  <PhoneOff size={18} strokeWidth={2} />
                ) : canJoinCall ? (
                  <PhoneIncoming size={18} strokeWidth={2} />
                ) : (
                  <Phone size={18} strokeWidth={2} />
                )}
              </button>

              {!isGroup && (
                <button
                  type="button"
                  className={`dm-action-btn ${isCameraOn ? 'active' : ''}`}
                  onClick={onVideoCall}
                  title={t('dmHeader.videoCall') || 'Start Video Call'}
                >
                  {isCameraOn ? <VideoOff size={18} strokeWidth={2} /> : <Video size={18} strokeWidth={2} />}
                </button>
              )}

              <div className="pinned-messages-anchor" ref={pinnedAnchorRef}>
                <button
                  type="button"
                  className={`dm-action-btn ${showPinnedPanel ? 'active' : ''}`}
                  onClick={onTogglePinnedPanel}
                  title={t('pinned.viewPinned')}
                >
                  <Pin size={18} strokeWidth={2} />
                  {pinnedMessageIds.length > 0 && (
                    <span className="dm-action-badge">{pinnedMessageIds.length}</span>
                  )}
                </button>
                {showPinnedPanel && (
                  <PinnedMessages
                    pinnedMessages={pinnedMessages}
                    onClose={() => onTogglePinnedPanel(false)}
                    onScrollToMessage={onScrollToMessage}
                    anchorRef={pinnedAnchorRef}
                  />
                )}
              </div>

              {!isGroup && (
                <button
                  type="button"
                  className="dm-action-btn"
                  onClick={onOpenCreateGroup}
                  title={t('dmHeader.addToGroup') || 'Add friends to DM'}
                >
                  <UserPlus size={18} strokeWidth={2} />
                </button>
              )}

              {!isGroup && !isMobile && (
                <button
                  type="button"
                  className={`dm-action-btn${profileSidebarDocked && showProfileSidebar ? ' active' : ''}`}
                  onClick={profileSidebarDocked ? onToggleProfileSidebar : onOpenProfile}
                  aria-label={
                    profileSidebarDocked
                      ? (showProfileSidebar
                        ? (t('dmHeader.hideProfile') || 'Hide profile')
                        : (t('dmHeader.showProfile') || 'Show profile'))
                      : (t('dmHeader.viewProfile') || 'View profile')
                  }
                  aria-pressed={profileSidebarDocked ? showProfileSidebar : undefined}
                >
                  <Contact size={18} strokeWidth={2} />
                </button>
              )}

              {isGroup && (
                <button
                  type="button"
                  className={`dm-action-btn ${showGroupMembers ? 'active' : ''}`}
                  onClick={onToggleGroupMembers}
                  title={t('dmHeader.members') || 'Members'}
                >
                  <Users size={18} strokeWidth={2} />
                </button>
              )}
            </div>

            <div className={`dm-header-search${searchFocused ? ' dm-header-search--focused' : ''}`} ref={searchRef}>
              <input
                type="text"
                className="dm-header-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                placeholder={searchPlaceholder}
                aria-label={searchLabel}
              />
              <Search size={13} strokeWidth={2.25} className="dm-header-search-icon" aria-hidden />
              {showSearchDropdown && (
                <div className="dm-header-search-panel" role="listbox">
                  <div className="dm-header-search-panel-scroll">
                    {searchResults.length === 0 ? (
                      <div className="dm-header-search-empty">
                        {t('dmHeader.noResults') || 'No messages found'}
                      </div>
                    ) : (
                      <>
                        <div className="dm-header-search-section">
                          {t('dmHeader.searchResults') || 'Messages'}
                        </div>
                        {searchResults.map((msg) => {
                          const sender = getMessageSender(msg);
                          const preview = (msg.content || msg.caption || '').slice(0, 140);
                          return (
                            <button
                              key={msg.id}
                              type="button"
                              role="option"
                              className="dm-header-search-result"
                              onClick={() => handleSearchSelect(msg.id)}
                            >
                              <Avatar user={sender} size="small" />
                              <span className="dm-header-search-result-body">
                                <span className="dm-header-search-result-author">
                                  {sender.display_name || t('chat.someone') || 'Someone'}
                                </span>
                                <span className="dm-header-search-result-text">{preview}</span>
                              </span>
                            </button>
                          );
                        })}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </header>
  );
});

export default DMChatHeader;
