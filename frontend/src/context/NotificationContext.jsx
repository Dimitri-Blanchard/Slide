import React, { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect } from 'react';

const NotificationContext = createContext(null);

let notificationId = 0;
let inboxItemId = 0;
const MAX_INBOX_ITEMS = 50;

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  const [inboxItems, setInboxItems] = useState([]);
  const notificationTimersRef = useRef(new Map());

  const addNotification = useCallback((message, type = 'info', duration = 4000) => {
    let targetId = null;
    setNotifications((prev) => {
      const duplicateIndex = prev.findIndex((n) => n.message === message && n.type === type);
      if (duplicateIndex !== -1) {
        targetId = prev[duplicateIndex].id;
        const merged = [...prev];
        merged[duplicateIndex] = {
          ...merged[duplicateIndex],
          count: (merged[duplicateIndex].count || 1) + 1,
        };
        return merged;
      }
      const id = ++notificationId;
      targetId = id;
      return [...prev, { id, message, type, count: 1 }];
    });

    if (targetId != null) {
      const existingTimer = notificationTimersRef.current.get(targetId);
      if (existingTimer) window.clearTimeout(existingTimer);
      const timer = window.setTimeout(() => {
        setNotifications((prev) => prev.filter((n) => n.id !== targetId));
        notificationTimersRef.current.delete(targetId);
      }, duration);
      notificationTimersRef.current.set(targetId, timer);
    }

    return targetId;
  }, []);

  const removeNotification = useCallback((id) => {
    const timer = notificationTimersRef.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      notificationTimersRef.current.delete(id);
    }
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  useEffect(() => {
    return () => {
      notificationTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      notificationTimersRef.current.clear();
    };
  }, []);

  // Add item to inbox history (mentions, replies, etc.)
  const addInboxItem = useCallback((item) => {
    const id = ++inboxItemId;
    setInboxItems((prev) => {
      const newItems = [{ id, ...item, timestamp: Date.now() }, ...prev];
      return newItems.slice(0, MAX_INBOX_ITEMS);
    });
  }, []);

  const clearInbox = useCallback(() => {
    setInboxItems([]);
  }, []);

  const notify = useMemo(() => ({
    success: (msg, duration) => addNotification(msg, 'success', duration),
    error: (msg, duration) => addNotification(msg, 'error', duration),
    warning: (msg, duration) => addNotification(msg, 'warning', duration),
    info: (msg, duration) => addNotification(msg, 'info', duration),
  }), [addNotification]);

  const value = useMemo(() => ({
    notifications,
    notify,
    removeNotification,
    inboxItems,
    addInboxItem,
    clearInbox,
  }), [notifications, notify, removeNotification, inboxItems, addInboxItem, clearInbox]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotification must be used within NotificationProvider');
  return ctx;
}
