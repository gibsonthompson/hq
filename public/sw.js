/* HQ service worker (v41)

   RULES
   1. App pages (/, index.html) are ALWAYS fetched from the network
      first with no-store, so a deploy shows up on the next load. If the network
      is down or hangs past NAV_TIMEOUT_MS, the last good copy of THAT page is
      served so the app still opens; the in-page update check then pulls the new
      version as soon as the network is back.
   2. Version checks (?__v=...) are never touched; they always hit the network.
   3. ONLY this site's own static files (icons, bundled libraries) and Google
      Fonts are cached. Every other request, above all the Supabase database
      reads and writes, passes straight through to the network untouched.
      (Before v39 every GET was cache-first, including Supabase reads, so a
      device kept replaying a frozen copy of its data until the next deploy
      cleared the cache. That is what made sync "work for a while, then stop".)
   4. Manifests are network-first so icon/colour changes always land.

   Bump CACHE on every release. */

const CACHE = 'hq-assets-v41';
const ASSETS = [
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/lucide.min.js',
  '/supabase.min.js'
];
const NAV_TIMEOUT_MS = 6000;
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

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

/* The page can ask a freshly installed worker to take over right away. */
self.addEventListener('message', function (e) {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

/* One stored fallback per page. */
function pageKey(url) {
  var p = url.pathname;
  if (p === '/' || p === '') p = '/index.html';
  return new Request(self.location.origin + p);
}

function offlinePage() {
  return new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>HQ offline</title>' +
    '<body style="background:#f3f7f7;color:#0f1f1e;font:15px -apple-system,system-ui,sans-serif;padding:40px">' +
    '<h1 style="font-size:20px;margin:0 0 8px">HQ is offline</h1>' +
    '<p style="color:#55706d;margin:0 0 18px">No saved copy is available yet. Reconnect, then reload.</p>' +
    '<button onclick="location.reload()" style="background:#00a19c;color:#fff;border:0;border-radius:12px;padding:12px 18px;font-weight:700;font-size:15px">Reload</button>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

function networkFirstPage(req, url) {
  var key = pageKey(url);
  return new Promise(function (resolve) {
    var settled = false;
    function fallback() {
      if (settled) return;
      settled = true;
      caches.match(key).then(function (cached) { resolve(cached || offlinePage()); })
        .catch(function () { resolve(offlinePage()); });
    }
    var timer = setTimeout(fallback, NAV_TIMEOUT_MS);
    fetch(req, { cache: 'no-store' }).then(function (res) {
      if (res && res.ok && res.status === 200) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { return c.put(key, copy); }).catch(function () {});
      }
      if (!settled) { settled = true; clearTimeout(timer); resolve(res); }
    }).catch(function () { clearTimeout(timer); fallback(); });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  /* Version checks always go straight to the network. */
  if (url.searchParams.has('__v')) return;

  var sameOrigin = url.origin === self.location.origin;

  if (sameOrigin) {
    var isPage = req.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html');
    if (isPage) { e.respondWith(networkFirstPage(req, url)); return; }

    if (/\.(json|webmanifest)$/.test(url.pathname)) {
      e.respondWith(fetch(req, { cache: 'no-store' }).catch(function () { return caches.match(req); }));
      return;
    }

    /* Own static files: cache-first. */
    e.respondWith(
      caches.match(req).then(function (cached) {
        return cached || fetch(req).then(function (res) {
          if (res && res.ok && res.status === 200) {
            var copy = res.clone();
            caches.open(CACHE).then(function (c) { return c.put(req, copy); }).catch(function () {});
          }
          return res;
        });
      })
    );
    return;
  }

  /* Google Fonts: cache-first (they never change). */
  if (FONT_HOSTS.indexOf(url.hostname) !== -1) {
    e.respondWith(
      caches.match(req).then(function (cached) {
        return cached || fetch(req).then(function (res) {
          if (res && (res.ok || res.type === 'opaque')) {
            var copy = res.clone();
            caches.open(CACHE).then(function (c) { return c.put(req, copy); }).catch(function () {});
          }
          return res;
        });
      })
    );
    return;
  }

  /* Everything else (Supabase reads/writes, realtime, any API) is never
     intercepted: the browser handles it exactly as if there were no worker. */
});
