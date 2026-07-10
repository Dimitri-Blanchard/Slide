import { direct as directApi } from '../api';

const CACHE_FRESH_MS = 15000;

/** Persisted across DirectChat remounts so revisiting a DM shows messages instantly. */
export const dmMessagesCache = new Map();

const pendingFetches = new Map();

export function getCachedDmMessages(conversationId) {
  return dmMessagesCache.get(String(conversationId)) || null;
}

export function setCachedDmMessages(conversationId, data) {
  dmMessagesCache.set(String(conversationId), { ...data, _ts: Date.now() });
}

export function isDmMessagesCacheFresh(conversationId) {
  const cached = getCachedDmMessages(conversationId);
  return !!(cached?._ts && Date.now() - cached._ts < CACHE_FRESH_MS);
}

/** Prefetch DM messages on sidebar hover or conversation switch. */
export function prefetchDmMessages(conversationId) {
  const id = String(conversationId);
  if (!id) return Promise.resolve();
  if (isDmMessagesCacheFresh(id)) return Promise.resolve();
  if (pendingFetches.has(id)) return pendingFetches.get(id);

  const p = directApi.messages(id)
    .then((msgs) => {
      const safeMsgs = Array.isArray(msgs) ? msgs : [];
      const rxMap = {};
      for (const m of safeMsgs) {
        if (m.reactions?.length) rxMap[m.id] = m.reactions;
      }
      setCachedDmMessages(id, { messages: safeMsgs, reactions: rxMap });
    })
    .catch(() => {})
    .finally(() => {
      pendingFetches.delete(id);
    });

  pendingFetches.set(id, p);
  return p;
}
