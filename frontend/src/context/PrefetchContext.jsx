/**
 * PrefetchContext — prefetches profiles and images on hover for instant profile cards.
 * Uses mouse position and hover intent to load data before the user clicks.
 */

import React, { createContext, useContext, useCallback, useRef } from 'react';
import { prefetchProfile } from '../utils/profileCache';

const PrefetchContext = createContext(null);

export function PrefetchProvider({ children }) {
  const delayRef = useRef(null);

  const prefetch = useCallback((userId, partialUser = null) => {
    if (!userId) return;
    prefetchProfile(userId, partialUser);
  }, []);

  const schedulePrefetch = useCallback((userId, partialUser, delayMs = 50) => {
    if (!userId) return () => {};
    const id = setTimeout(() => {
      prefetchProfile(userId, partialUser);
    }, delayMs);
    return () => clearTimeout(id);
  }, []);

  const value = { prefetch, schedulePrefetch };
  return (
    <PrefetchContext.Provider value={value}>
      {children}
    </PrefetchContext.Provider>
  );
}

export function usePrefetch() {
  const ctx = useContext(PrefetchContext);
  return ctx || { prefetch: () => {}, schedulePrefetch: () => () => {} };
}

/**
 * Call from onMouseEnter — schedules prefetch after short delay.
 * Call the returned cancel from onMouseLeave to avoid prefetch if user moves away quickly.
 */
export function usePrefetchOnHover() {
  const { schedulePrefetch } = usePrefetch();
  const cancelRef = useRef(null);

  const onMouseEnter = useCallback((userId, partialUser = null) => {
    if (cancelRef.current) {
      clearTimeout(cancelRef.current);
      cancelRef.current = null;
    }
    if (!userId) return;
    cancelRef.current = setTimeout(() => {
      cancelRef.current = null;
      prefetchProfile(userId, partialUser);
    }, 50);
  }, []);

  const onMouseLeave = useCallback(() => {
    if (cancelRef.current) {
      clearTimeout(cancelRef.current);
      cancelRef.current = null;
    }
  }, []);

  return { onMouseEnter, onMouseLeave };
}
