/* CalendAI service worker — reminder push notifications only.
 * There is deliberately no fetch handler and no caching, so this worker never
 * changes how the app loads; it only shows pings sent by the server
 * (backend/services/reminderDispatcher.js) and opens the app when tapped. */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { title: 'CalendAI', body: event.data ? event.data.text() : '' }; }
  const title = data.title || '🔔 CalendAI';
  const options = {
    body: data.body || '',
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: data.tag || 'calendai-reminder',
    renotify: true,
    requireInteraction: data.type === 'reminder',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/?reminders=1', reminderId: data.reminderId || null, fireAt: data.fireAt || null }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
        await client.focus();
        if ('navigate' in client) { try { await client.navigate(target); } catch (e) {} }
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});
