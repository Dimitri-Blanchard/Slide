const PUSH_TOKEN_TIMEOUT_MS = 10000;
const NOTIFICATION_CHANNEL_ID = 'slide_messages';

let pushListenersReady = false;
let pushRegistrationPromise = null;
let lastPushToken = null;
const pushTokenCallbacks = new Set();

function isNativeCapacitor() {
  return typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.();
}

function getNativePlatform() {
  return window.Capacitor?.getPlatform?.() || 'android';
}

function normalizePushPermission(permission) {
  const receive = permission?.receive || permission?.display || permission;
  if (receive === 'granted') return 'granted';
  if (receive === 'denied') return 'denied';
  return 'default';
}

function emitPushToken(token) {
  const value = typeof token === 'string' ? token : token?.value;
  if (!value) return;
  lastPushToken = value;
  for (const callback of pushTokenCallbacks) {
    Promise.resolve(callback(value)).catch((err) => {
      console.warn('[Push] Native token callback failed:', err?.message || err);
    });
  }
}

async function ensurePushListeners(PushNotifications) {
  if (pushListenersReady) return;
  pushListenersReady = true;

  await PushNotifications.addListener('registration', emitPushToken);
  await PushNotifications.addListener('registrationError', (error) => {
    console.warn('[Push] Native registration failed:', error?.error || error?.message || error);
  });
}

async function registerForPushToken(PushNotifications) {
  if (!pushRegistrationPromise) {
    pushRegistrationPromise = new Promise((resolve) => {
      let settled = false;
      const finish = (token) => {
        if (settled) return;
        settled = true;
        pushTokenCallbacks.delete(finish);
        resolve(token || null);
      };

      pushTokenCallbacks.add(finish);
      PushNotifications.register().catch((err) => {
        console.warn('[Push] Native register failed:', err?.message || err);
        finish(null);
      });
      setTimeout(() => finish(lastPushToken), PUSH_TOKEN_TIMEOUT_MS);
    });
  }

  return pushRegistrationPromise;
}

export async function initPushNotifications(onToken) {
  if (!isNativeCapacitor()) {
    return { supported: false, permission: 'denied', platform: null, token: null };
  }

  if (typeof onToken === 'function') {
    pushTokenCallbacks.add(onToken);
    if (lastPushToken) {
      Promise.resolve(onToken(lastPushToken)).catch(() => {});
    }
  }

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const currentPermission = normalizePushPermission(await PushNotifications.checkPermissions());
    const permission = currentPermission === 'granted'
      ? currentPermission
      : normalizePushPermission(await PushNotifications.requestPermissions());

    if (permission !== 'granted') {
      return { supported: true, permission, platform: getNativePlatform(), token: null };
    }

    await ensurePushListeners(PushNotifications);
    const token = await registerForPushToken(PushNotifications);

    return {
      supported: true,
      permission: 'granted',
      platform: getNativePlatform(),
      token,
    };
  } catch (err) {
    console.warn('[Push] Native initialization failed:', err?.message || err);
    return { supported: false, permission: 'denied', platform: getNativePlatform(), token: null };
  }
}

export async function scheduleNativeNotification({ title, body, isCall = false, extra = {} } = {}) {
  if (!isNativeCapacitor() || !title) return false;

  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const currentPermission = await LocalNotifications.checkPermissions().catch(() => ({}));
    const permission = currentPermission.display === 'granted'
      ? currentPermission
      : await LocalNotifications.requestPermissions();
    if (permission.display !== 'granted') return false;

    await LocalNotifications.createChannel?.({
      id: NOTIFICATION_CHANNEL_ID,
      name: 'Messages',
      description: 'Slide message notifications',
      importance: 4,
      visibility: 1,
      sound: isCall ? 'default' : undefined,
    }).catch(() => {});

    await LocalNotifications.schedule({
      notifications: [
        {
          id: Date.now() % 2147483647,
          title,
          body: body || '',
          channelId: NOTIFICATION_CHANNEL_ID,
          schedule: { at: new Date(Date.now() + 100) },
          sound: isCall ? 'default' : undefined,
          extra,
        },
      ],
    });
    return true;
  } catch (err) {
    console.warn('[Notifications] Native notification failed:', err?.message || err);
    return false;
  }
}

export async function hapticNotification(type = 'Success') {
  if (!isNativeCapacitor()) return;
  try {
    const { Haptics, NotificationType } = await import('@capacitor/haptics');
    const notificationType = NotificationType?.[type] || NotificationType?.Success || type;
    await Haptics.notification({ type: notificationType });
  } catch (_) {}
}
