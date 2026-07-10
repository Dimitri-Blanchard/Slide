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
import { initPushNotifications } from '../utils/nativeNotifications';
import { resolvePublicPathPrefix } from '../utils/pagesBasename';

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
    const prefix = resolvePublicPathPrefix();
    const reg = await navigator.serviceWorker.register(`${prefix}sw.js`, { scope: prefix });
    await navigator.serviceWorker.ready;
    return reg;
  } catch (err) {
    console.warn('[Push] SW registration failed:', err.message);
    return null;
  }
}

export function usePushNotifications(enabled = true) {
  const native = typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.();
  const webSupported = typeof window !== 'undefined'
    && typeof navigator !== 'undefined'
    && ('serviceWorker' in navigator)
    && ('PushManager' in window)
    && ('Notification' in window);
  const supported = native || webSupported;
  const [permission, setPermission] = useState(() => (
    native ? 'default' : (webSupported ? Notification.permission : 'denied')
  ));
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    if (!supported || !enabled) return;
    if (native) return;
    // Check if already subscribed
    navigator.serviceWorker.ready.then(reg => {
      reg.pushManager.getSubscription().then(sub => {
        setSubscribed(!!sub);
      });
    }).catch(() => {});
  }, [supported, enabled]);

  const subscribe = useCallback(async () => {
    if (!supported) return { ok: false, reason: 'unsupported' };
    if (native) {
      const platform = window.Capacitor?.getPlatform?.() || 'android';
      const syncedTokens = new Set();
      const syncNativeToken = async (token) => {
        if (!token) return;
        if (syncedTokens.has(token)) return;
        syncedTokens.add(token);
        await api('/push/subscribe', {
          method: 'POST',
          body: JSON.stringify({
            endpoint: `capacitor:fcm:${token}`,
            platform,
            token,
            keys: {},
          }),
        }).catch((err) => console.warn('[Push] Native token sync failed:', err?.message));
      };

      const result = await initPushNotifications(async (token) => {
        await syncNativeToken(token);
        setPermission('granted');
        setSubscribed(true);
      });
      if (result.token) {
        await syncNativeToken(result.token);
      }
      setPermission(result.permission || (result.supported ? 'granted' : 'denied'));
      const ok = result.permission === 'granted' && !!result.token;
      setSubscribed(ok);
      return ok ? { ok: true } : { ok: false, reason: result.permission || 'no-token' };
    }
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
  }, [supported, native]);

  const unsubscribe = useCallback(async () => {
    if (!supported) return;
    if (native) {
      // FCM token revocation is platform-managed; backend can expire old capacitor:fcm endpoints.
      setSubscribed(false);
      return;
    }
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
  }, [supported, native]);

  return { supported, permission, subscribed, subscribe, unsubscribe };
}
