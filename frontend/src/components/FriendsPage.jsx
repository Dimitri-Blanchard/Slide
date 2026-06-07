import React, { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import ProfileCard from './ProfileCard';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { friends as friendsApi, direct as directApi } from '../api';
import useFriendsSync from '../hooks/useFriendsSync';
import { notifyFriendsChanged, isFriendRequestDuplicateError, refreshFriendsSyncNow } from '../utils/friendsSync';
import { useOnlineUsers } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useNotification } from '../context/NotificationContext';
import Avatar from './Avatar';
import ClickableAvatar from './ClickableAvatar';
import OnboardingTour, { hasSeenOnboarding } from './OnboardingTour';
import { useSettings } from '../context/SettingsContext';
import { usePlatform } from '../context/PlatformContext';
import FriendsActiveNowSidebar from './FriendsActiveNowSidebar';
import AppIcon from './icons/AppIcon';
import { countIncomingFriendRequests } from '../hooks/usePendingFriendsCount';
import './FriendsPage.css';


function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= breakpoint);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const onChange = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [breakpoint]);
  return isMobile;
}

const FriendCard = memo(function FriendCard({
  friend,
  actions,
  isPending,
  highlightOnline,
  statusText,
  isOnline,
  t,
  moreMenuItems,
}) {
  const cardRef = useRef(null);
  const nameRef = useRef(null);
  const [showProfile, setShowProfile] = useState(false);
  const [profileAnchor, setProfileAnchor] = useState(null);

  const openProfileAt = useCallback((anchorEl) => {
    if (!anchorEl) return;
    setProfileAnchor(anchorEl);
    setShowProfile(true);
  }, []);

  const openProfileFromName = useCallback((e) => {
    e.stopPropagation();
    openProfileAt(nameRef.current);
  }, [openProfileAt]);

  const openProfileFromAvatar = useCallback((e) => {
    e.stopPropagation();
    openProfileAt(cardRef.current?.querySelector('.clickable-avatar'));
  }, [openProfileAt]);

  const closeProfile = useCallback(() => {
    setShowProfile(false);
  }, []);

  const onlineClass = !isPending && highlightOnline
    ? ` ${isOnline ? 'online' : 'offline'}`
    : '';

  return (
    <>
      <div
        ref={cardRef}
        className={`friend-card${isPending ? ' friend-card-pending' : ''}${onlineClass}`}
      >
        <div className="friend-card-info">
          <ClickableAvatar
            user={friend}
            size="medium"
            showPresence={!isPending}
            contextMenuItems={moreMenuItems}
            suppressProfileOpen
            onClick={openProfileFromAvatar}
          />
          <div className="friend-card-text">
            <span
              ref={nameRef}
              className="friend-card-name"
              role="button"
              tabIndex={0}
              onClick={openProfileFromName}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openProfileFromName(e);
                }
              }}
            >
              {friend.display_name || friend.username}
            </span>
            <span className="friend-card-status">
              {isPending
                ? statusText
                : isOnline
                  ? friend.status_message || t('friends.online')
                  : 'Offline'}
            </span>
          </div>
        </div>
        <div className="friend-card-actions" onClick={(e) => e.stopPropagation()}>
          {actions}
        </div>
      </div>
      <ProfileCard
        userId={friend.id}
        user={friend}
        isOpen={showProfile}
        onClose={closeProfile}
        anchorEl={profileAnchor}
        position="right"
      />
    </>
  );
});

export default function FriendsPage({ mobileStandalone = false }) {
  const [activeTab, setActiveTab] = useState('online');
  const { friends: friendsList, pending: pendingList, ready: friendsReady } = useFriendsSync();
  const [searchQuery, setSearchQuery] = useState('');
  const [addFriendInput, setAddFriendInput] = useState('');
  const [addFriendStatus, setAddFriendStatus] = useState(null);
  const [sending, setSending] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const { isUserOnline } = useOnlineUsers();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { developerMode } = useSettings();
  const { notify } = useNotification();
  const navigate = useNavigate();
  const { isMobileDevice } = usePlatform();
  const isMobileViewport = useIsMobile();
  const isMobile = isMobileDevice || isMobileViewport || mobileStandalone;
  const FUME_START_DELAY_MS = 3200;
  const FUME_STEP_DELAY_MS = 40;
  const FUME_CHAR_DURATION_MS = 650;
  const loading = !friendsReady;


  useEffect(() => {
    if (!hasSeenOnboarding(user)) setShowOnboarding(true);
  }, [user]);

  const onlineFriends = useMemo(
    () => friendsList.filter(f => isUserOnline(f.id)),
    [friendsList, isUserOnline]
  );

  const tabs = useMemo(() => ['online', 'all', 'pending'], []);
  const incomingPendingCount = useMemo(
    () => countIncomingFriendRequests(pendingList),
    [pendingList]
  );

  // If user was on pending and all requests are cleared, switch to online
  useEffect(() => {
    if (activeTab === 'pending' && pendingList.length === 0) setActiveTab('online');
  }, [activeTab, pendingList.length]);

  // Auto-clear playful info messages after the dissolve animation completes.
  useEffect(() => {
    if (addFriendStatus?.type !== 'info' || !addFriendStatus.message) return undefined;
    const charCount = Array.from(addFriendStatus.message).length;
    const totalDuration = FUME_START_DELAY_MS + (charCount * FUME_STEP_DELAY_MS) + FUME_CHAR_DURATION_MS;
    const timer = window.setTimeout(() => setAddFriendStatus(null), totalDuration);
    return () => window.clearTimeout(timer);
  }, [addFriendStatus, FUME_CHAR_DURATION_MS, FUME_START_DELAY_MS, FUME_STEP_DELAY_MS]);

  const filteredFriends = useMemo(() => {
    const q = searchQuery.toLowerCase();
    const source = activeTab === 'online' ? onlineFriends : friendsList;
    if (!q) return source;
    return source.filter(f =>
      (f.display_name || '').toLowerCase().includes(q) ||
      (f.username || '').toLowerCase().includes(q)
    );
  }, [activeTab, friendsList, onlineFriends, searchQuery]);

  const handleSendRequest = async (e) => {
    e.preventDefault();
    if (!addFriendInput.trim() || sending) return;
    setSending(true);
    setAddFriendStatus(null);
    try {
      await friendsApi.sendRequest(addFriendInput.trim());
      setAddFriendStatus({ type: 'success', message: t('friends.requestSent').replace('{name}', addFriendInput.trim()) });
      setAddFriendInput('');
      notifyFriendsChanged({ action: 'request_sent' });
    } catch (err) {
      const errorMessage = err.message || '';
      if (isFriendRequestDuplicateError(errorMessage)) {
        notifyFriendsChanged();
      }
      const isSelfAddError = /add yourself|yourself as a friend|cannot add yourself|can't add yourself/i.test(errorMessage);
      let msg;
      if (isSelfAddError) {
        msg = t('friends.cannotAddSelfPlayful');
      } else if (/already friends/i.test(errorMessage)) {
        msg = t('friends.errorAlreadyFriends');
      } else if (/already pending|already sent|request already sent|friendship request already/i.test(errorMessage)) {
        msg = t('friends.errorAlreadyPending');
      } else if (/unable to send request/i.test(errorMessage)) {
        msg = t('friends.errorBlocked');
      } else if (/user not found/i.test(errorMessage)) {
        msg = t('friends.errorUserNotFound');
      } else {
        msg = errorMessage.includes('Endpoint') ? t('friends.requestError') : (errorMessage || t('friends.requestError'));
      }
      setAddFriendStatus({ type: isSelfAddError ? 'info' : 'error', message: msg });
    } finally {
      setSending(false);
    }
  };

  const handleAccept = async (requestId, otherUser) => {
    notifyFriendsChanged({
      action: 'accepted',
      requestId,
      userId: otherUser?.id,
    });
    try {
      await friendsApi.acceptRequest(requestId);
      await refreshFriendsSyncNow();
      if (otherUser?.id) {
        const conv = await directApi.createConversation(otherUser.id);
        navigate(`/channels/@me/${conv.conversation_id}`);
      }
    } catch (err) {
      notify.error(err.message);
      await refreshFriendsSyncNow();
    }
  };

  const handleDecline = async (requestId) => {
    notifyFriendsChanged({ action: 'request_declined', requestId });
    try {
      await friendsApi.declineRequest(requestId);
      await refreshFriendsSyncNow();
    } catch (err) {
      notify.error(err.message);
      await refreshFriendsSyncNow();
    }
  };

  const handleRemove = async (userId) => {
    try {
      await friendsApi.removeFriend(userId);
      notifyFriendsChanged({ userId, action: 'removed' });
    } catch (err) {
      notify.error(err.message);
    }
  };

  const handleBlock = async (userId) => {
    try {
      await friendsApi.block(userId);
      notifyFriendsChanged({ userId, action: 'blocked' });
    } catch (err) {
      notify.error(err.message);
    }
  };

  const handleMessage = async (friend) => {
    try {
      const conv = await directApi.createConversation(friend.id);
      navigate(`/channels/@me/${conv.conversation_id}`);
    } catch (err) {
      notify.error(err.message);
    }
  };

  const [openMoreFor, setOpenMoreFor] = useState(null);
  const moreDropdownRef = useRef(null);
  const moreButtonRef = useRef(null);
  const dropdownRectRef = useRef(null);

  useEffect(() => {
    if (!openMoreFor) return;
    const handler = (e) => {
      if (moreDropdownRef.current && !moreDropdownRef.current.contains(e.target) &&
          moreButtonRef.current && !moreButtonRef.current.contains(e.target)) {
        setOpenMoreFor(null);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [openMoreFor]);

  const renderEmptyState = (message) => (
    <div className="friends-empty">
      <svg className="friends-empty-illustration" width="376" height="162" viewBox="0 0 376 162" fill="none" aria-hidden>
        <rect x="48" y="20" width="280" height="122" rx="8" fill="currentColor" opacity="0.12"/>
        <circle cx="108" cy="60" r="24" fill="currentColor" opacity="0.25" />
        <rect x="148" y="50" width="120" height="12" rx="6" fill="currentColor" opacity="0.25" />
        <rect x="148" y="68" width="80" height="10" rx="5" fill="currentColor" opacity="0.15"/>
        <circle cx="108" cy="110" r="24" fill="currentColor" opacity="0.25" />
        <rect x="148" y="100" width="140" height="12" rx="6" fill="currentColor" opacity="0.25" />
        <rect x="148" y="118" width="60" height="10" rx="5" fill="currentColor" opacity="0.15"/>
      </svg>
      <p className="friends-empty-text">{message}</p>
    </div>
  );

  const renderFriendCard = (friend, actions, { moreMenuItems, highlightOnline = true, variant, statusText } = {}) => (
    <FriendCard
      key={friend.id}
      friend={friend}
      actions={actions}
      isPending={variant === 'pending'}
      highlightOnline={highlightOnline}
      statusText={statusText}
      isOnline={isUserOnline(friend.id)}
      t={t}
      moreMenuItems={moreMenuItems}
    />
  );

  const renderContent = () => {
    if (activeTab === 'addFriend') {
      return (
        <div className="friends-add-section">
          <h2 className="friends-add-title">{t('friends.addFriend').toUpperCase()}</h2>
          <p className="friends-add-description">{t('friends.addFriendDescription')}</p>
          <form className="friends-add-form" onSubmit={handleSendRequest}>
            <div className={`friends-add-input-wrap ${addFriendStatus?.type === 'success' ? 'success' : addFriendStatus?.type === 'error' ? 'error' : addFriendStatus?.type === 'info' ? 'info' : ''}`}>
              <input
                type="text"
                value={addFriendInput}
                onChange={e => setAddFriendInput(e.target.value)}
                placeholder={t('friends.addFriendPlaceholder')}
                className="friends-add-input"
              />
              <button
                type="submit"
                className="friends-add-btn"
                disabled={!addFriendInput.trim() || sending}
              >
                {t('friends.sendRequest')}
              </button>
            </div>
            {addFriendStatus && (
              <p className={`friends-add-status ${addFriendStatus.type}`}>
                {addFriendStatus.type === 'info' ? (
                  <span className="friends-fume-text" aria-label={addFriendStatus.message}>
                    {Array.from(addFriendStatus.message).map((char, index, chars) => (
                      <span
                        key={`${char}-${index}`}
                        className="friends-fume-char"
                        style={{ '--char-delay': `${(chars.length - 1 - index) * FUME_STEP_DELAY_MS}ms` }}
                      >
                        {char === ' ' ? '\u00A0' : char}
                      </span>
                    ))}
                  </span>
                ) : addFriendStatus.message}
              </p>
            )}
          </form>
        </div>
      );
    }

    if (loading) {
      if (activeTab === 'online') {
        return renderEmptyState(t('friends.noOnline'));
      }
      return (
        <div className="friends-list">
          <div className="friends-list-header">
            {t('friends.all').toUpperCase()} — …
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={`skeleton-${i}`} className="friend-card friend-card-skeleton">
              <div className="friend-card-info">
                <div className="friend-card-skeleton-avatar" />
                <div className="friend-card-text">
                  <div className="friend-card-skeleton-name" />
                  <div className="friend-card-skeleton-status" />
                </div>
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (activeTab === 'pending') {
      if (pendingList.length === 0) return renderEmptyState(t('friends.noPending'));
      return (
        <div className="friends-list">
          <div className="friends-list-header">
            {t('friends.pending').toUpperCase()} — {pendingList.length}
          </div>
          {pendingList.map(req =>
            renderFriendCard(req.user || req, (
              <>
                {req.type === 'incoming' && (
                  <button
                    type="button"
                    className="friend-action-btn accept"
                    onClick={() => handleAccept(req.id, req.user || req)}
                    title={t('friends.accept')}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>
                  </button>
                )}
                <button
                  type="button"
                  className="friend-action-btn decline"
                  onClick={() => handleDecline(req.id)}
                  title={req.type === 'incoming' ? t('friends.decline') : t('friends.cancelRequest')}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/></svg>
                </button>
              </>
            ), {
              variant: 'pending',
              statusText: req.type === 'incoming'
                ? t('friends.incomingRequest')
                : t('friends.outgoingRequest'),
            })
          )}
        </div>
      );
    }

    // Online or All tab
    const list = filteredFriends;
    const count = activeTab === 'online' ? onlineFriends.length : friendsList.length;
    const emptyMsg = activeTab === 'online' ? t('friends.noOnline') : t('friends.noFriends');

    if (list.length === 0 && !searchQuery) return renderEmptyState(emptyMsg);

    return (
      <div className="friends-list">
        <div className="friends-search-bar">
          <div className="friends-search-field">
            <svg className="friends-search-icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
            </svg>
            <input
              type="search"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t('common.search')}
              className="friends-search-input"
              aria-label={t('common.search')}
            />
          </div>
        </div>
        <div className="friends-list-header">
          {(activeTab === 'online' ? t('friends.online') : t('friends.all')).toUpperCase()} — {count}
        </div>
        {list.length === 0 && searchQuery ? (
          <div className="friends-no-results">No results found</div>
        ) : (
          list.map(friend => {
            const moreMenuItems = [
              { label: t('friends.message'), icon: null, onClick: () => handleMessage(friend) },
              { label: t('friends.removeFriend') || 'Remove Friend', icon: null, onClick: () => handleRemove(friend.id), danger: true },
              { label: t('friends.block') || 'Block', icon: null, onClick: () => handleBlock(friend.id), danger: true },
            ];
            return renderFriendCard(
              friend,
              (
                <>
                  <button className="friend-action-btn" onClick={() => handleMessage(friend)} title={t('friends.message')}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
                  </button>
                  <div className="friend-more-wrap">
                    <button
                      className={`friend-action-btn ${openMoreFor === friend.id ? 'active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (openMoreFor === friend.id) {
                          setOpenMoreFor(null);
                          moreButtonRef.current = null;
                          dropdownRectRef.current = null;
                        } else {
                          const btn = e.currentTarget;
                          moreButtonRef.current = btn;
                          dropdownRectRef.current = btn.getBoundingClientRect();
                          setOpenMoreFor(friend.id);
                        }
                      }}
                      title={t('common.more') || 'More'}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
                    </button>
                    {/* dropdown rendered via portal in document.body */}
                  </div>
                </>
              ),
              { moreMenuItems }
            );
          })
        )}
      </div>
    );
  };

  const showActiveNowSidebar = !isMobile && activeTab !== 'addFriend' && activeTab !== 'pending';

  return (
    <div className={`friends-page ${isMobile ? 'friends-page-mobile' : ''}`}>
      <div className="friends-page-main">
      <div className="friends-header" data-tour-id="tour-friends">
        <div className="friends-header-left">
          {mobileStandalone && (
            <button
              type="button"
              className="friends-mobile-back dc-mobile-back"
              onClick={() => navigate('/channels/@me')}
              aria-label={t('common.back')}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
              </svg>
            </button>
          )}
          <div className="friends-header-brand">
            <AppIcon name="friends" size={24} className="friends-header-icon" />
            <h1 className="friends-header-title">{t('friends.title')}</h1>
            {!isMobile && <div className="friends-header-divider" />}
          </div>
          {!isMobile && (
            <div className="friends-header-tabs">
              {tabs.map(tab => (
                <button
                  key={tab}
                  className={`friends-tab ${activeTab === tab ? 'active' : ''}`}
                  onClick={() => { setActiveTab(tab); setSearchQuery(''); }}
                >
                  {t(`friends.${tab}`)}
                  {tab === 'pending' && incomingPendingCount > 0 && (
                    <span className="friends-tab-badge">{incomingPendingCount > 99 ? '99+' : incomingPendingCount}</span>
                  )}
                </button>
              ))}
              <button
                className={`friends-tab friends-tab-add-friend ${activeTab === 'addFriend' ? 'active' : ''}`}
                onClick={() => setActiveTab('addFriend')}
              >
                {t('friends.addFriend')}
              </button>
            </div>
          )}
        </div>
        <div className="friends-header-right">
          {!isMobile && (
            <>
              <button
                className="friends-header-action friends-header-action-add"
                title={t('friends.addFriend')}
                onClick={() => setActiveTab('addFriend')}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20 9V6h-2v3h-3v2h3v3h2v-3h3V9h-3zM9 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0-6c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zm0 7c-2.67 0-8 1.34-8 4v3h16v-3c0-2.66-5.33-4-8-4z"/></svg>
              </button>
              <button
                className="friends-header-action"
                title={t('onboarding.showTutorial')}
                onClick={() => setShowOnboarding(true)}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/></svg>
              </button>
            </>
          )}
        </div>
      </div>
      {isMobile && (
        <div className="friends-mobile-tabs">
          <div className="friends-mobile-tabs-row">
            {tabs.map(tab => (
              <button
                key={tab}
                className={`friends-mobile-tab ${activeTab === tab ? 'active' : ''}`}
                onClick={() => { setActiveTab(tab); setSearchQuery(''); }}
              >
                {t(`friends.${tab}`)}
                {tab === 'pending' && incomingPendingCount > 0 && (
                  <span className="friends-tab-badge">{incomingPendingCount > 99 ? '99+' : incomingPendingCount}</span>
                )}
              </button>
            ))}
          </div>
          <button
            className={`friends-mobile-add-btn ${activeTab === 'addFriend' ? 'active' : ''}`}
            onClick={() => setActiveTab('addFriend')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
            {t('friends.addFriend')}
          </button>
        </div>
      )}
      <div className="friends-content">
        {renderContent()}
      </div>
      </div>
      {showActiveNowSidebar && (
        <FriendsActiveNowSidebar
          onlineFriends={onlineFriends}
          onMessage={handleMessage}
        />
      )}
      {showOnboarding && (
        <OnboardingTour onClose={() => setShowOnboarding(false)} />
      )}
      {openMoreFor && typeof document !== 'undefined' && document.body && (() => {
        const openFriend = filteredFriends.find(f => f.id === openMoreFor) ?? friendsList.find(f => f.id === openMoreFor);
        const rect = dropdownRectRef.current;
        if (!openFriend || !rect) return null;
        // Avoid menu going under browser tabs: reserve safe area at top of viewport
        const SAFE_TOP = 72;
        const ESTIMATED_DROPDOWN_HEIGHT = 240;
        const openUpward = rect.top - 4 - ESTIMATED_DROPDOWN_HEIGHT >= SAFE_TOP;
        let top = openUpward ? rect.top - 4 : rect.bottom + 4;
        if (!openUpward && top + ESTIMATED_DROPDOWN_HEIGHT > window.innerHeight - 8) {
          top = Math.max(SAFE_TOP, window.innerHeight - ESTIMATED_DROPDOWN_HEIGHT - 8);
        }
        const dropdownStyle = openUpward
          ? {
              position: 'fixed',
              top: rect.top - 4,
              right: window.innerWidth - rect.right,
              transform: 'translateY(-100%)',
              marginBottom: 0,
              bottom: 'auto',
            }
          : {
              position: 'fixed',
              top,
              right: window.innerWidth - rect.right,
              transform: 'none',
              marginBottom: 0,
              bottom: 'auto',
            };
        const dropdownEl = (
          <div
            ref={moreDropdownRef}
            className="friend-more-dropdown friend-more-dropdown-portal"
            style={dropdownStyle}
          >
            <button className="friend-more-item" onClick={() => { handleMessage(openFriend); setOpenMoreFor(null); }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
              <span>{t('friends.message')}</span>
            </button>
            <div className="friend-more-separator" />
            <button className="friend-more-item danger" onClick={() => { handleRemove(openFriend.id); setOpenMoreFor(null); }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M10.09 15.59L11.5 17l5-5-5-5-1.41 1.41L12.67 11H3v2h9.67l-2.58 2.59zM19 3H5c-1.11 0-2 .9-2 2v4h2V5h14v14H5v-4H3v4c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/></svg>
              <span>{t('friends.removeFriend') || 'Remove Friend'}</span>
            </button>
            <button className="friend-more-item danger" onClick={() => { handleBlock(openFriend.id); setOpenMoreFor(null); }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/></svg>
              <span>{t('friends.block') || 'Block'}</span>
            </button>
            {developerMode && (<>
            <div className="friend-more-separator" />
            <button className="friend-more-item" onClick={() => { navigator.clipboard?.writeText(String(openFriend.id)); setOpenMoreFor(null); }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
              <span>{t('common.copyId') || 'Copy User ID'}</span>
            </button>
            </>)}
          </div>
        );
        return createPortal(dropdownEl, document.body);
      })()}
    </div>
  );
}
