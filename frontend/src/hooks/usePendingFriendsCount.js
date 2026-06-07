import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { subscribeFriendsSync, ensureFriendsLoaded } from '../utils/friendsSync';

function seenStorageKey(userId) {
  return `slide_seen_friend_requests_${userId}`;
}

function loadSeenIds(userId) {
  if (!userId) return new Set();
  try {
    const raw = localStorage.getItem(seenStorageKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

function saveSeenIds(userId, ids) {
  if (!userId) return;
  try {
    localStorage.setItem(seenStorageKey(userId), JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

export function countIncomingFriendRequests(list) {
  if (!Array.isArray(list)) return 0;
  return list.filter((r) => r.type === 'incoming').length;
}

function countUnseenIncoming(list, seenIds) {
  if (!Array.isArray(list)) return 0;
  return list.filter((r) => r.type === 'incoming' && !seenIds.has(String(r.id))).length;
}

function pruneSeenIds(seenIds, list) {
  const pendingIds = new Set((Array.isArray(list) ? list : []).map((r) => String(r.id)));
  return new Set([...seenIds].filter((id) => pendingIds.has(id)));
}

/**
 * Unseen incoming friend requests for notification badges (Home, sidebar, Electron).
 * When shouldMarkSeen is true (Friends page open), badges clear but requests stay in Pending tab.
 */
export default function usePendingFriendsCount(shouldMarkSeen = false) {
  const { user } = useAuth();
  const [pendingList, setPendingList] = useState([]);
  const [seenIds, setSeenIds] = useState(() => loadSeenIds(user?.id));

  useEffect(() => {
    setSeenIds(loadSeenIds(user?.id));
    setPendingList([]);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return undefined;
    ensureFriendsLoaded(user.id);
    return subscribeFriendsSync((snapshot) => {
      const arr = Array.isArray(snapshot.pending) ? snapshot.pending : [];
      setPendingList(arr);
      setSeenIds((prev) => {
        const pruned = pruneSeenIds(prev, arr);
        if (pruned.size !== prev.size) saveSeenIds(user.id, pruned);
        return pruned;
      });
    });
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return undefined;
    const onFriendsChanged = (event) => {
      const detail = event?.detail;
      if (detail?.action !== 'accepted' || detail?.requestId == null) return;
      setSeenIds((prev) => {
        const next = new Set(prev);
        next.add(String(detail.requestId));
        saveSeenIds(user.id, next);
        return next;
      });
    };
    window.addEventListener('slide:friends-changed', onFriendsChanged);
    return () => window.removeEventListener('slide:friends-changed', onFriendsChanged);
  }, [user?.id]);

  const markAllIncomingSeen = useCallback(() => {
    if (!user?.id) return;
    setSeenIds((prev) => {
      const next = new Set(prev);
      pendingList
        .filter((r) => r.type === 'incoming')
        .forEach((r) => next.add(String(r.id)));
      saveSeenIds(user.id, next);
      return next;
    });
  }, [user?.id, pendingList]);

  useEffect(() => {
    if (!shouldMarkSeen) return;
    markAllIncomingSeen();
  }, [shouldMarkSeen, markAllIncomingSeen, pendingList]);

  return useMemo(
    () => countUnseenIncoming(pendingList, seenIds),
    [pendingList, seenIds]
  );
}
