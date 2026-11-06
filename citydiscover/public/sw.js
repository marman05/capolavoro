// Service worker: l'app si apre anche offline (shell in cache); le API usano rete-prima con copia di riserva.
const VERSION = 'cd-v1';
const SHELL = ['/', '/index.html', '/css/styles.css', '/js/app.js', '/js/api.js', '/js/ui.js', '/js/map.js',
  '/vendor/leaflet/leaflet.js', '/vendor/leaflet/leaflet.css', '/manifest.webmanifest', '/icons/icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) {
    // Rete prima; in caso di assenza di connessione si usa l'ultima risposta salvata.
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok && !e.request.headers.get('Authorization')) {
            const copy = res.clone();
            caches.open(VERSION + '-api').then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => caches.match(e.request).then((r) => r || new Response(JSON.stringify({ error: 'Sei offline e questi dati non sono in memoria' }), { status: 503, headers: { 'Content-Type': 'application/json' } })))
    );
    return;
  }
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('/index.html')))
  );
});
