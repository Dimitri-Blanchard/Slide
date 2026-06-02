/* Slide Service Worker — handles web push notifications */
const APP_NAME = 'Slide';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: APP_NAME, body: event.data.text() };
  }

  const title = payload.title || APP_NAME;
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icon.png',
    badge: '/icon.png',
    tag: payload.tag || 'slide-notification',
    data: payload.data || {},
    renotify: true,
    silent: false,
    vibrate: [200, 100, 200],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus existing window if open
      for (const client of clients) {
        if (client.url && 'focus' in client) {
          client.focus();
          if (data.conversationId) {
            client.postMessage({ type: 'NAVIGATE_DM', conversationId: data.conversationId });
          }
          return;
        }
      }
      // Open new window
      const url = data.conversationId ? `/#/dms/${data.conversationId}` : '/';
      return self.clients.openWindow(url);
    })
  );
});
