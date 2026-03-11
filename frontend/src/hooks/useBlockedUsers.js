import { useState, useEffect, useCallback } from 'react';
import { friends as friendsApi } from '../api';

export function useBlockedUsers() {
  const [blockedIds, setBlockedIds] = useState(new Set());

  const refresh = useCallback(async () => {
    try {
      const list = await friendsApi.blocked();
      setBlockedIds(new Set((list || []).map((u) => Number(u.id) || u.id)));
    } catch (e) {
      console.error('Failed to load blocked users', e);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { blockedIds, refresh };
}
