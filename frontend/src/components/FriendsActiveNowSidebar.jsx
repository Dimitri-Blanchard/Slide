import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { getProfile, getCachedProfile } from '../utils/profileCache';
import ActiveNowFriendCard from './ActiveNowFriendCard';
import './FriendsActiveNowSidebar.css';

const FANS_SIDEBAR_WIDTH_KEY = 'slide_friends_active_now_width';
const FANS_MIN_W = 220;
const FANS_MAX_W = 400;
const FANS_DEFAULT_W = 280;

const FriendsActiveNowSidebar = memo(function FriendsActiveNowSidebar({
  onlineFriends,
  onMessage,
}) {
  const { t } = useLanguage();
  const [enrichedFriends, setEnrichedFriends] = useState([]);
  const [width, setWidth] = useState(() => {
    try {
      const v = parseInt(localStorage.getItem(FANS_SIDEBAR_WIDTH_KEY), 10);
      return (!isNaN(v) && v >= FANS_MIN_W && v <= FANS_MAX_W) ? v : FANS_DEFAULT_W;
    } catch { return FANS_DEFAULT_W; }
  });
  const widthRef = useRef(width);
  widthRef.current = width;

  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = widthRef.current;
    const onMove = (ev) => {
      const next = Math.min(FANS_MAX_W, Math.max(FANS_MIN_W, startW + (startX - ev.clientX)));
      setWidth(next);
      try { localStorage.setItem(FANS_SIDEBAR_WIDTH_KEY, String(next)); } catch {}
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  useEffect(() => {
    if (!onlineFriends?.length) {
      setEnrichedFriends([]);
      return undefined;
    }

    let cancelled = false;

    const loadProfiles = async () => {
      const results = await Promise.all(
        onlineFriends.map(async (friend) => {
          const cached = getCachedProfile(friend.id);
          if (cached) return { ...friend, ...cached };
          try {
            const profile = await getProfile(friend.id);
            return { ...friend, ...profile };
          } catch {
            return friend;
          }
        })
      );
      if (!cancelled) setEnrichedFriends(results);
    };

    loadProfiles();
    return () => { cancelled = true; };
  }, [onlineFriends]);

  // Always mirror onlineFriends; overlay enriched profile data when available.
  // Using enrichedFriends alone hid newly-online friends until profile fetch finished.
  const friends = useMemo(() => {
    if (!onlineFriends?.length) return [];
    const enrichedById = new Map(enrichedFriends.map((f) => [String(f.id), f]));
    return onlineFriends.map((f) => enrichedById.get(String(f.id)) || f);
  }, [onlineFriends, enrichedFriends]);

  return (
    <aside
      className="friends-active-now-sidebar"
      style={{ width, minWidth: width }}
      aria-label={t('friends.activeNow')}
    >
      <div
        className="fans-resize-edge"
        onMouseDown={handleResizeStart}
        role="separator"
        aria-orientation="vertical"
        aria-label={t('friends.resizeActiveNow') || 'Resize Active Now panel'}
      />
      <div className="fans-header">
        <h2 className="fans-title">{t('friends.activeNow')}</h2>
      </div>
      <div className="fans-scroll">
        {friends.length === 0 ? (
          <p className="fans-empty">{t('friends.noOnline')}</p>
        ) : (
          friends.map((friend) => (
            <ActiveNowFriendCard
              key={friend.id}
              friend={friend}
              onClick={() => onMessage(friend)}
            />
          ))
        )}
      </div>
    </aside>
  );
});

export default FriendsActiveNowSidebar;
