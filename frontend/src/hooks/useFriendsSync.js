import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  subscribeFriendsSync,
  ensureFriendsLoaded,
  resetFriendsSync,
} from '../utils/friendsSync';

export default function useFriendsSync() {
  const { user } = useAuth();
  const [state, setState] = useState({
    friendIds: new Set(),
    friends: [],
    pending: [],
    ready: false,
  });

  useEffect(() => {
    if (!user?.id) {
      resetFriendsSync();
      return undefined;
    }
    ensureFriendsLoaded(user.id);
    return subscribeFriendsSync(setState);
  }, [user?.id]);

  const isFriend = useCallback(
    (userId) => userId != null && state.friendIds.has(String(userId)),
    [state.friendIds]
  );

  return {
    friendIds: state.friendIds,
    friends: state.friends,
    pending: state.pending,
    ready: state.ready,
    isFriend,
  };
}
