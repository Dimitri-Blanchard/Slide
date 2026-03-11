/**
 * Web Push Notifications hook.
 * Registers the service worker, subscribes to push, and syncs the subscription
 * with the backend.
 *
 * Usage:
 *   const { supported, permission, subscribe, unsubscribe } = usePushNotifications();
 */
import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';

async function getVapidKey() {
  try {
    const data = await api('/push/vapid-key');
    return data.publicKey;
  } catch {
    return null;
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

async function registerSW() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    return reg;
  } catch (err) {
    console.warn('[Push] SW registration failed:', err.message);
    return null;
  }
}

export function usePushNotifications(enabled = true) {
  const supported = ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window);
  const [permission, setPermission] = useState(supported ? Notification.permission : 'denied');
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    if (!supported || !enabled) return;
    // Check if already subscribed
    navigator.serviceWorker.ready.then(reg => {
      reg.pushManager.getSubscription().then(sub => {
        setSubscribed(!!sub);
      });
    }).catch(() => {});
  }, [supported, enabled]);

  const subscribe = useCallback(async () => {
    if (!supported) return { ok: false, reason: 'unsupported' };
    if (Notification.permission === 'denied') return { ok: false, reason: 'denied' };

    const vapidKey = await getVapidKey();
    if (!vapidKey) return { ok: false, reason: 'no-vapid' };

    // Request permission
    const perm = await Notification.requestPermission();
    setPermission(perm);
    if (perm !== 'granted') return { ok: false, reason: 'denied' };

    const reg = await registerSW();
    if (!reg) return { ok: false, reason: 'sw-failed' };

    try {
      // Unsubscribe existing before resubscribing
      const existing = await reg.pushManager.getSubscription();
      if (existing) await existing.unsubscribe();

      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      const subJson = subscription.toJSON();
      await api('/push/subscribe', {
        method: 'POST',
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          keys: subJson.keys,
        }),
      });

      setSubscribed(true);
      return { ok: true };
    } catch (err) {
      console.error('[Push] Subscribe error:', err.message);
      return { ok: false, reason: err.message };
    }
  }, [supported]);

  const unsubscribe = useCallback(async () => {
    if (!supported) return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      await api('/push/subscribe', {
        method: 'DELETE',
        body: JSON.stringify({ endpoint }),
      }).catch(() => {});
    }
    setSubscribed(false);
  }, [supported]);

  return { supported, permission, subscribed, subscribe, unsubscribe };
}
