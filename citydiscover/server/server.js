'use strict';
// Server HTTP di CityDiscover: API REST + file statici della web app / PWA. Nessuna dipendenza esterna.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const config = require('./config');
const db = require('./db');
const auth = require('./auth');
const ratings = require('./ratings');
const service = require('./service');
const { CATEGORIES } = require('./categories');
const { EVENT_CATEGORIES } = require('./providers/events');
const routing = require('./providers/routing');
const weather = require('./providers/weather');
const geocode = require('./providers/geocode');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function send(res, status, data, headers = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 1e6) throw Object.assign(new Error('Richiesta troppo grande'), { status: 413 });
    chunks.push(c);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    throw Object.assign(new Error('JSON non valido'), { status: 400 });
  }
}

function requireUser(req) {
  const u = auth.userFromRequest(req);
  if (!u) throw Object.assign(new Error('Accedi per continuare'), { status: 401 });
  return u;
}

// Limite semplice anti-abuso per IP sulle API (finestra di 1 minuto).
const hits = new Map();
function rateLimited(req) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
  const now = Date.now();
  const h = hits.get(ip) || { n: 0, t: now };
  if (now - h.t > 60000) {
    h.n = 0;
    h.t = now;
  }
  h.n++;
  hits.set(ip, h);
  return h.n > 240;
}

const routes = [];
const route = (method, pattern, handler) => routes.push({ method, pattern, handler });

route('GET', '/api/health', () => ({ ok: true, time: new Date().toISOString(), eventSources: { ticketmaster: !!config.keys.ticketmaster, predicthq: !!config.keys.predicthq } }));
route('GET', '/api/categories', () => ({ places: CATEGORIES, events: EVENT_CATEGORIES }));
route('GET', '/api/cities/search', (q) => geocode.searchCities(q.q, q.lang || 'it'));
route('GET', '/api/cities/reverse', (q) => geocode.reverse(Number(q.lat), Number(q.lon), q.lang || 'it'));
route('GET', '/api/city', (q) => service.getCity(q.id, q.lang));
route('GET', '/api/city/places', (q) => service.cityPlaces(q));
route('GET', '/api/city/highlights', (q) => service.highlights(q));
route('GET', '/api/nearby', (q) => service.nearby(q));
route('GET', '/api/place', (q) => service.placeDetail(q));
route('GET', '/api/events', (q) => service.events(q));
route('GET', '/api/search', (q) => service.searchIndexed(q));
route('GET', '/api/weather', (q) => weather.forecast(Number(q.lat), Number(q.lon)));
route('GET', '/api/directions', (q) =>
  routing.directions({ lat: Number(q.fromLat), lon: Number(q.fromLon) }, { lat: Number(q.toLat), lon: Number(q.toLon) })
);
route('POST', '/api/itinerary', (q, body) => service.planDay(body));

route('POST', '/api/auth/register', (q, body) => auth.register(body));
route('POST', '/api/auth/login', (q, body) => auth.login(body));
route('GET', '/api/me', (q, b, req) => ({ user: requireUser(req) }));

route('GET', '/api/reviews', (q) => ({ reviews: ratings.reviewsFor(q.itemId), rating: ratings.forItems([q.itemId])[q.itemId] }));
route('POST', '/api/reviews', (q, body, req) => ({ rating: ratings.upsertReview(requireUser(req).id, body) }));
route('DELETE', '/api/reviews', (q, b, req) => {
  ratings.deleteReview(requireUser(req).id, q.itemId);
  return { ok: true, rating: ratings.forItems([q.itemId])[q.itemId] };
});

route('GET', '/api/lists', (q, b, req) => ({ lists: service.myLists(requireUser(req).id) }));
route('POST', '/api/lists', (q, body, req) => service.createList(requireUser(req).id, body.name));
route('DELETE', /^\/api\/lists\/(\d+)$/, (q, b, req, m) => {
  service.deleteList(requireUser(req).id, m[1]);
  return { ok: true };
});
route('POST', /^\/api\/lists\/(\d+|favorites)\/items$/, (q, body, req, m) => service.addItem(requireUser(req).id, m[1], body));
route('DELETE', /^\/api\/lists\/(\d+|favorites)\/items$/, (q, b, req, m) => {
  service.removeItem(requireUser(req).id, m[1], q.itemId);
  return { ok: true };
});
route('POST', /^\/api\/lists\/(\d+)\/share$/, (q, b, req, m) => service.shareList(requireUser(req).id, m[1]));
route('GET', /^\/api\/shared\/([\w-]+)$/, (q, b, req, m) => service.sharedList(m[1]));

function serveStatic(req, res, pathname) {
  let file = path.normalize(path.join(config.publicDir, decodeURIComponent(pathname)));
  if (!file.startsWith(config.publicDir)) {
    res.writeHead(403).end();
    return;
  }
  if (pathname === '/' || !path.extname(file) || !fs.existsSync(file)) {
    // Single-page app: le rotte del client ricadono su index.html.
    if (path.extname(pathname) && pathname !== '/') {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }
    file = path.join(config.publicDir, 'index.html');
  }
  const ext = path.extname(file);
  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Cache-Control': file.includes(`${path.sep}vendor${path.sep}`) ? 'public, max-age=604800' : 'no-cache',
  };
  fs.createReadStream(file)
    .on('error', () => res.writeHead(500).end())
    .once('open', () => res.writeHead(200, headers))
    .pipe(res);
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;
  if (!pathname.startsWith('/api/')) return serveStatic(req, res, pathname);
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, DELETE' });
    return res.end();
  }
  if (rateLimited(req)) return send(res, 429, { error: 'Troppe richieste, riprova tra poco' });
  const q = Object.fromEntries(url.searchParams);
  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = typeof r.pattern === 'string' ? (r.pattern === pathname ? [pathname] : null) : r.pattern.exec(pathname);
    if (!m) continue;
    try {
      const body = req.method === 'POST' ? await readBody(req) : {};
      const data = await r.handler(q, body, req, m);
      return send(res, 200, data, { 'Access-Control-Allow-Origin': '*' });
    } catch (e) {
      const status = e.status && e.status >= 400 && e.status < 600 ? (e.status >= 500 || e.source ? 502 : e.status) : 500;
      if (status >= 500) console.error(`[${req.method} ${pathname}]`, e.message);
      return send(res, status, { error: e.message, source: e.source || undefined }, { 'Access-Control-Allow-Origin': '*' });
    }
  }
  send(res, 404, { error: 'Endpoint non trovato' });
}

function start(port = config.port) {
  db.open();
  const server = http.createServer((req, res) => {
    handle(req, res).catch((e) => {
      console.error(e);
      if (!res.headersSent) send(res, 500, { error: 'Errore interno' });
    });
  });
  server.listen(port, () => console.log(`CityDiscover in ascolto su http://localhost:${server.address().port}`));
  let timer;
  if (config.refreshIntervalMinutes > 0) {
    timer = setInterval(() => {
      service.refreshRecent().then((n) => n && console.log(`[refresh] aggiornate ${n} città`)).catch((e) => console.warn('[refresh]', e.message));
    }, config.refreshIntervalMinutes * 60000);
    timer.unref();
  }
  server.on('close', () => clearInterval(timer));
  return server;
}

if (require.main === module) start();

module.exports = { start, handle };
