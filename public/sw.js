// Candid PWA service worker (TASK-037).
// Network-first for navigations/API so portal data stays fresh; cache-first for
// static assets so the installed app loads quickly and survives flaky networks.
const CACHE = 'candid-pwa-v1';
const STATIC_ASSETS = ['/', '/manifest.webmanifest', '/brand/candid-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(STATIC_ASSETS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

// On localhost (development) the SW must not serve cached assets — that caused
// stale JS/CSS across restarts. Stay network-only here; push/notification
// handlers below still run so push can be tested in dev.
const IS_LOCALHOST = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(self.location.hostname);

self.addEventListener('fetch', (event) => {
  if (IS_LOCALHOST) return;

  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache API responses — always go to network.
  if (url.pathname.startsWith('/api/')) return;

  const isNavigation = request.mode === 'navigate';
  const isStatic = /\.(?:js|css|png|jpe?g|svg|webp|gif|ico|woff2?|webmanifest)$/.test(url.pathname);

  if (isStatic) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
            return res;
          }),
      ),
    );
    return;
  }

  if (isNavigation) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(request).then((c) => c || caches.match('/'))),
    );
  }
});

// Show push notifications (TASK-034 push channel).
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Candid', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Candid';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/brand/candid-icon.png',
      badge: '/brand/candid-icon.png',
      data: data.url ? { url: data.url } : {},
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data && event.notification.data.url;
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(target || '/');
    }),
  );
});
