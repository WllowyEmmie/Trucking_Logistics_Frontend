// Driver app shell. Scope: /driver. Lets the app open with no signal; data comes from the
// IndexedDB queue and the last cached delivery list, never from this cache.
// API calls are never cached: they go to the network, and the offline queue handles failures.
// Not registered in mock mode (MSW's worker must control the page then).

const CACHE = 'driver-shell-v1';
const SHELL = ['/driver', '/driver.webmanifest', '/driver-icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('driver-shell-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// The first visit loads its JS before this worker controls the page, so the page posts the
// build assets it already has; without them an offline reload would get HTML but no app.
self.addEventListener('message', (e) => {
  if (e.data?.type !== 'cache-urls' || !Array.isArray(e.data.urls)) return;
  const urls = e.data.urls.filter((u) => {
    try {
      return new URL(u).origin === self.location.origin && new URL(u).pathname.startsWith('/_next/static/');
    } catch {
      return false;
    }
  });
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(urls.map((u) => c.add(u).catch(() => undefined)))));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Pages: network first so a new build shows up; the cached copy when there's no signal.
  if (req.mode === 'navigate' && url.origin === self.location.origin && url.pathname.startsWith('/driver')) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            void caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit ?? caches.match('/driver'))),
    );
    return;
  }

  // Build assets are content-hashed, and fonts don't change: cache first.
  const isStatic = url.origin === self.location.origin && url.pathname.startsWith('/_next/static/');
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (isStatic || isFont) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ??
          fetch(req).then((res) => {
            if (res.ok || res.type === 'opaque') {
              const copy = res.clone();
              void caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});
