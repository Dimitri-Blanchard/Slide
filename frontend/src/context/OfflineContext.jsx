import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useAuth } from './AuthContext';
import { direct as directApi, messages as messagesApi } from '../api';
import {
  getQueue,
  addToQueue as addToQueueStorage,
  removeFromQueue,
  generateTempId,
  isNetworkError,
  clearAllQueuedMessages,
} from '../utils/offlineMessageQueue';

const OfflineContext = createContext(null);

export const OFFLINE_SENT_EVENT = 'slide:offline-queue-sent';

/**
 * Émet un événement quand un message en file a été envoyé avec succès.
 * Les composants peuvent écouter pour mettre à jour leur état local.
 */
export function emitOfflineQueueSent({ tempId, message, context, targetId }) {
  window.dispatchEvent(new CustomEvent(OFFLINE_SENT_EVENT, {
    detail: { tempId, message, context, targetId },
  }));
}

export function OfflineProvider({ children }) {
  const isOnline = useOnlineStatus();
  const { user } = useAuth();
  const [queue, setQueue] = useState([]);
  const [processing, setProcessing] = useState(false);
  const prevAuthUserIdRef = useRef(null);
  const offlineAuthHydratedRef = useRef(false);

  const refreshQueue = useCallback(async () => {
    try {
      const items = await getQueue();
      setQueue(items);
      return items;
    } catch (e) {
      console.warn('Erreur chargement file offline:', e);
      setQueue([]);
      return [];
    }
  }, []);

  useEffect(() => {
    refreshQueue();
  }, [refreshQueue]);

  useEffect(() => {
    const cur = user?.id ?? null;
    if (!offlineAuthHydratedRef.current) {
      offlineAuthHydratedRef.current = true;
      prevAuthUserIdRef.current = cur;
      return;
    }
    const prev = prevAuthUserIdRef.current;
    prevAuthUserIdRef.current = cur;
    const switchedAccount = prev != null && cur != null && String(prev) !== String(cur);
    const loggedOut = prev != null && cur == null;
    if (!switchedAccount && !loggedOut) return;
    clearAllQueuedMessages()
      .then(() => refreshQueue())
      .catch(() => refreshQueue());
  }, [user?.id, refreshQueue]);

  // Retry périodique quand en ligne et file non vide (cas reconnexion lente)
  useEffect(() => {
    if (!isOnline || queue.length === 0) return;
    const interval = setInterval(() => refreshQueue(), 10000);
    return () => clearInterval(interval);
  }, [isOnline, queue.length, refreshQueue]);

  useEffect(() => {
    if (!isOnline || queue.length === 0 || processing) return;

    const processNext = async () => {
      setProcessing(true);
      const items = await getQueue();
      if (items.length === 0) {
        setProcessing(false);
        setQueue([]);
        return;
      }

      const item = items[0];
      try {
        if (item.context === 'dm') {
          const msg = await directApi.sendMessage(
            item.targetId,
            item.payload.content,
            item.payload.type,
            item.payload.replyToId
          );
          await removeFromQueue(item.id);
          emitOfflineQueueSent({
            tempId: item.tempId,
            message: msg,
            context: 'dm',
            targetId: item.targetId,
          });
        } else if (item.context === 'channel') {
          const msg = await messagesApi.sendChannel(
            item.targetId,
            item.payload.content,
            item.payload.type,
            item.payload.replyToId
          );
          await removeFromQueue(item.id);
          emitOfflineQueueSent({
            tempId: item.tempId,
            message: msg,
            context: 'channel',
            targetId: item.targetId,
          });
        }
      } catch (err) {
        if (isNetworkError(err)) {
          // Rester en file, réessayer après délai
          console.warn('Envoi message en file échoué (réseau), retry plus tard:', err);
          await new Promise(r => setTimeout(r, 5000));
        } else {
          // Erreur métier (401, 404...) : retirer pour éviter boucle infinie
          await removeFromQueue(item.id).catch(() => {});
          emitOfflineQueueSent({
            tempId: item.tempId,
            message: null,
            context: item.context,
            targetId: item.targetId,
            error: err,
          });
        }
      }

      const remaining = await getQueue();
      setQueue(remaining);
      setProcessing(false);
      if (remaining.length > 0) {
        processNext();
      }
    };

    processNext();
  }, [isOnline, queue.length, processing]);

  const addToQueue = useCallback(async ({ context, targetId, payload, tempId }) => {
    const id = tempId || generateTempId();
    await addToQueueStorage({
      context,
      targetId,
      payload: {
        content: payload.content,
        type: payload.type || 'text',
        replyToId: payload.replyToId || null,
      },
      tempId: id,
    });
    await refreshQueue();
    return id;
  }, [refreshQueue]);

  const value = {
    isOnline,
    queuedCount: queue.length,
    queuedItems: queue,
    processing,
    addToQueue,
    refreshQueue,
    isNetworkError,
  };

  return (
    <OfflineContext.Provider value={value}>
      {children}
    </OfflineContext.Provider>
  );
}

export function useOffline() {
  const ctx = useContext(OfflineContext);
  if (!ctx) {
    return {
      isOnline: true,
      queuedCount: 0,
      queuedItems: [],
      processing: false,
      addToQueue: async () => {},
      refreshQueue: async () => [],
      isNetworkError: () => false,
    };
  }
  return ctx;
}
