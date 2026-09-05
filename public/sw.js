/* HQ service worker.
   RULE: the app's HTML is NEVER served from cache — it is always fetched fresh,
   so a deploy takes effect immediately. Only static assets (icons, libs, fonts)
   are cached, which is what makes cold starts fast and offline work.
   Bump CACHE to invalidate assets. */
const CACHE = 'hq-assets-v26';
/* Only these get cached. Note: index.html is deliberately NOT in this list. */
const ASSETS = [
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/lucide.min.js',
  '/supabase.min.js'
];
self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(ASSETS.map(function (u) { return c.add(u).catch(function () {}); }));
  }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== CACHE; })
                               .map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});
self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isAppPage = req.mode === 'navigate' ||
                    url.pathname === '/' ||
                    url.pathname.endsWith('.html');
  /* THE APP ITSELF: always network. Never cache it. Never serve a stale copy.
     If (and only if) the network is completely unavailable, fall back to the
     last page we saw so the app still opens offline. */
  if (isAppPage) {
    e.respondWith(
      fetch(req, { cache: 'no-store' })
        .then(function (res) {
          const copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put('offline-fallback', copy).catch(function () {}); });
          return res;
        })
        .catch(function () {
          /* respondWith(undefined) throws, so never hand back a miss */
          return caches.match('offline-fallback').then(function (cached) {
            return cached || new Response(
              '<!doctype html><meta charset="utf-8"><title>HQ offline</title>' +
              '<body style="background:#0f1210;color:#e9ede9;font:15px system-ui;padding:40px">' +
              '<h1 style="font-size:20px">HQ is offline</h1>' +
              '<p style="color:#9aa39c">No cached copy is available yet. Reconnect and reload.</p>',
              { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
            );
          });
        })
    );
    return;
  }
  /* STATIC ASSETS: cache-first (fast, offline-capable). */
  e.respondWith(
    caches.match(req).then(function (cached) {
      return cached || fetch(req).then(function (res) {
        const copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy).catch(function () {}); });
        return res;
      });
    })
  );
});
