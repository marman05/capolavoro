'use strict';
// Test di integrazione: server reale + fetch simulato (vedi fixtures.js).
process.env.CD_DB_FILE = ':memory:';
process.env.TICKETMASTER_API_KEY = 'test-key';
process.env.CD_REFRESH_MINUTES = '0';

const test = require('node:test');
const assert = require('node:assert/strict');
const fixtures = require('./fixtures');
const mock = fixtures.install();
const { start } = require('../server/server');

let server;
let base;
const CITY = 'relation/42602';

async function call(path, { method = 'GET', body, token } = {}) {
  const res = await fetchReal(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json() };
}
// Le chiamate al nostro server usano il fetch reale (il mock intercetta solo le API esterne).
const realFetch = require('node:http');
function fetchReal(url, opts) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = realFetch.request({ host: u.hostname, port: u.port, path: u.pathname + u.search, method: opts.method, headers: opts.headers }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, json: async () => JSON.parse(data) }));
    });
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

test.before(async () => {
  server = start(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => {
  server.close();
  mock.restore();
});

test('ricerca città multilingue', async () => {
  const r = await call('/api/cities/search?q=Флоренция');
  assert.equal(r.status, 200);
  assert.equal(r.data.results[0].id, CITY);
  assert.equal(r.data.results[0].country, 'Italia');
  const none = await call('/api/cities/search?q=Xyzzzz');
  assert.equal(none.data.results.length, 0);
});

test('luoghi della città: categorie, foto, voto non inventato, distanze', async () => {
  const r = await call(`/api/city/places?id=${CITY}&lat=43.7731&lon=11.256`);
  assert.equal(r.status, 200);
  const names = r.data.places.map((p) => p.name);
  assert.ok(!names.includes('Elemento senza categoria'));
  const duomo = r.data.places.find((p) => p.name.startsWith('Cattedrale'));
  assert.equal(duomo.category, 'church');
  assert.match(duomo.image, /commons\.wikimedia\.org/);
  assert.equal(duomo.rating.available, false);
  assert.equal(duomo.rating.score, null);
  assert.equal(duomo.distanceMeters, 0);
  assert.equal(r.data.distanceFrom, 'user');
  assert.ok(r.data.fetchedAt > 0);
  // ordinamento predefinito per popolarità
  assert.ok(r.data.places[0].popularity >= r.data.places[r.data.places.length - 1].popularity);
  // posto nascosto: San Miniato (poche lingue Wikipedia)
  assert.equal(r.data.places.find((p) => p.name.includes('San Miniato')).hidden, true);
});

test('filtri: categoria, distanza, prezzo, ordinamento', async () => {
  const museums = await call(`/api/city/places?id=${CITY}&category=museum`);
  assert.deepEqual(museums.data.places.map((p) => p.name), ['Galleria degli Uffizi']);
  const near = await call(`/api/city/places?id=${CITY}&lat=43.7731&lon=11.256&radiusKm=1&sort=distance`);
  assert.ok(near.data.places.every((p) => p.distanceMeters <= 1000));
  assert.ok(near.data.places.every((p, i, a) => i === 0 || a[i - 1].distanceMeters <= p.distanceMeters));
  const free = await call(`/api/city/places?id=${CITY}&price=free`);
  assert.deepEqual(free.data.places.map((p) => p.name), ['Piazzale Michelangelo']);
  const food = await call(`/api/city/places?id=${CITY}&category=food`);
  assert.equal(food.data.places.length, 3);
});

test('scheda luogo con Wikipedia, orari e percorso', async () => {
  const r = await call('/api/place?id=way/1001&lat=43.77&lon=11.25');
  assert.equal(r.status, 200);
  const p = r.data.place;
  assert.equal(p.description, 'Estratto di prova da Wikipedia.');
  assert.equal(p.openingTable[0].hours, '10:15–15:45');
  assert.equal(p.openingTable[6].hours, 'n.d.');
  assert.ok(p.photos.length >= 2);
  assert.ok(!p.photos.some((x) => x.url.endsWith('.svg')));
  assert.equal(r.data.directions.foot.verified, true);
  assert.equal(r.data.directions.foot.minutes, 22);
  assert.equal(r.data.directions.transit.verified, false);
  assert.match(r.data.links.googleTransit, /travelmode=transit/);
  const missing = await call('/api/place?id=node/999999');
  assert.equal(missing.status, 404);
});

test('eventi: fonti, filtri data/categoria, esclusione annullati', async () => {
  const all = await call(`/api/events?id=${CITY}`);
  assert.equal(all.status, 200);
  assert.equal(all.data.sources.find((s) => s.name === 'Ticketmaster').status, 'ok');
  assert.equal(all.data.sources.find((s) => s.name === 'PredictHQ').status, 'not_configured');
  assert.ok(!all.data.events.some((e) => e.title === 'Evento annullato'));
  assert.equal(all.data.events.length, 3);
  const today = await call(`/api/events?id=${CITY}&when=today`);
  assert.deepEqual(today.data.events.map((e) => e.title).sort(), ['Concerto sinfonico di prova', 'Spettacolo teatrale di prova']);
  const sport = await call(`/api/events?id=${CITY}&category=sport`);
  assert.equal(sport.data.events[0].price.min, 25);
  assert.ok(sport.data.events[0].ticketUrl.startsWith('https://'));
  const free = await call(`/api/events?id=${CITY}&free=1`);
  assert.equal(free.data.events.length, 0);
  assert.ok(all.data.fetchedAt > 0);
});

test('sezioni della città', async () => {
  const r = await call(`/api/city/highlights?id=${CITY}&lat=43.7731&lon=11.256`);
  assert.equal(r.status, 200);
  for (const k of ['todo', 'top', 'hidden', 'nearYou', 'eventsToday', 'eventsWeekend']) assert.ok(Array.isArray(r.data[k]), k);
  assert.ok(r.data.top.length > 0);
  assert.ok(r.data.weather.current.temperature);
  assert.ok(!r.data.top.some((p) => ['restaurant', 'cafe', 'nightlife'].includes(p.category)));
});

test('utenti, recensioni e voto con soglia minima', async () => {
  const tokens = [];
  for (let i = 1; i <= 3; i++) {
    const r = await call('/api/auth/register', { method: 'POST', body: { email: `u${i}@test.it`, password: 'password123', name: `Utente ${i}` } });
    assert.equal(r.status, 200);
    tokens.push(r.data.token);
  }
  const dup = await call('/api/auth/register', { method: 'POST', body: { email: 'u1@test.it', password: 'password123', name: 'X' } });
  assert.equal(dup.status, 409);
  const bad = await call('/api/auth/login', { method: 'POST', body: { email: 'u1@test.it', password: 'sbagliata' } });
  assert.equal(bad.status, 401);
  const anon = await call('/api/reviews', { method: 'POST', body: { itemId: 'way/1002', itemType: 'place', overall: 9 } });
  assert.equal(anon.status, 401);
  const invalid = await call('/api/reviews', { method: 'POST', token: tokens[0], body: { itemId: 'way/1002', itemType: 'place', overall: 11 } });
  assert.equal(invalid.status, 400);

  let r = await call('/api/reviews', { method: 'POST', token: tokens[0], body: { itemId: 'way/1002', itemType: 'place', overall: 9, experience: 10, valueForMoney: 6, priceLevel: 3, text: 'Splendido' } });
  assert.equal(r.data.rating.available, false); // 1 recensione < 3
  await call('/api/reviews', { method: 'POST', token: tokens[1], body: { itemId: 'way/1002', itemType: 'place', overall: 8, priceLevel: 3 } });
  r = await call('/api/reviews', { method: 'POST', token: tokens[2], body: { itemId: 'way/1002', itemType: 'place', overall: 10 } });
  assert.equal(r.data.rating.available, true);
  assert.equal(r.data.rating.count, 3);
  // (0.6*9+0.25*10+0.15*6 + 8 + 10) / 3 = 8.93 → 8.9
  assert.equal(r.data.rating.score, 8.9);
  assert.equal(r.data.rating.reportedPriceLevel, 3);
  // aggiornare la propria recensione non duplica
  r = await call('/api/reviews', { method: 'POST', token: tokens[2], body: { itemId: 'way/1002', itemType: 'place', overall: 7 } });
  assert.equal(r.data.rating.count, 3);
  // (8.8 + 8 + 7) / 3 = 7.9
  const minScore = await call(`/api/city/places?id=${CITY}&minScore=7`);
  assert.deepEqual(minScore.data.places.map((p) => p.name), ['Galleria degli Uffizi']);
  const list = await call('/api/reviews?itemId=way/1002');
  assert.equal(list.data.reviews.length, 3);
  assert.ok(!('email' in list.data.reviews[0]));
});

test('preferiti, liste personalizzate e condivisione', async () => {
  const { data } = await call('/api/auth/login', { method: 'POST', body: { email: 'u1@test.it', password: 'password123' } });
  const t = data.token;
  await call('/api/lists/favorites/items', { method: 'POST', token: t, body: { itemId: 'node/1004', itemType: 'place', snapshot: { name: 'Piazzale Michelangelo', category: 'viewpoint', lat: 43.76, lon: 11.26 } } });
  const nl = await call('/api/lists', { method: 'POST', token: t, body: { name: 'Weekend a Firenze' } });
  await call(`/api/lists/${nl.data.id}/items`, { method: 'POST', token: t, body: { itemId: 'way/1003', itemType: 'place', snapshot: { name: 'Ponte Vecchio' } } });
  let lists = await call('/api/lists', { token: t });
  assert.equal(lists.data.lists.length, 2);
  assert.equal(lists.data.lists[0].isFavorites, true);
  assert.equal(lists.data.lists[0].items[0].itemId, 'node/1004');
  const sh = await call(`/api/lists/${nl.data.id}/share`, { method: 'POST', token: t });
  const pub = await call(`/api/shared/${sh.data.token}`);
  assert.equal(pub.data.name, 'Weekend a Firenze');
  assert.equal(pub.data.items[0].snapshot.name, 'Ponte Vecchio');
  // un altro utente non può modificare la lista
  const other = await call('/api/auth/login', { method: 'POST', body: { email: 'u2@test.it', password: 'password123' } });
  const forbidden = await call(`/api/lists/${nl.data.id}`, { method: 'DELETE', token: other.data.token });
  assert.equal(forbidden.status, 404);
  const fav = await call(`/api/city/places?id=${CITY}`);
  assert.equal(fav.data.places.find((p) => p.id === 'node/1004').rating.favorites, 1);
});

test('itinerario: rispetta tempo, orari, pasti ed eventi', async () => {
  const date = fixtures.localDate(0);
  const r = await call('/api/itinerary', {
    method: 'POST',
    body: { cityId: CITY, date, startTime: '09:00', hours: 10, mode: 'foot', preferences: { meals: true, events: true } },
  });
  assert.equal(r.status, 200);
  const steps = r.data.steps;
  assert.ok(steps.length >= 4, JSON.stringify(steps.map((s) => s.name)));
  assert.ok(r.data.endTime <= '19:00');
  // orari crescenti
  for (let i = 1; i < steps.length; i++) assert.ok(steps[i].start >= steps[i - 1].end, `${steps[i - 1].name} → ${steps[i].name}`);
  assert.ok(steps.some((s) => s.mealLabel === 'Pranzo'));
  const uffizi = steps.find((s) => s.name === 'Galleria degli Uffizi');
  const dow = new Date(date + 'T12:00:00Z').getUTCDay();
  if (dow === 1) assert.equal(uffizi, undefined, 'Uffizi chiusi il lunedì');
  else if (uffizi) assert.ok(uffizi.start >= '08:15' && uffizi.end <= '18:30');
  // l'evento delle 16:00 è inserito all'orario esatto se scelto
  const ev = steps.find((s) => s.type === 'event');
  if (ev) assert.ok(['16:00', '21:00'].includes(ev.start));
  assert.ok(!steps.some((s) => s.type === 'visit' && ['restaurant', 'cafe', 'nightlife'].includes(s.category)));

  const short = await call('/api/itinerary', { method: 'POST', body: { cityId: CITY, date, startTime: '10:00', hours: 2, mode: 'foot', preferences: { categories: ['viewpoint'] } } });
  assert.ok(short.data.endTime <= '12:00');
  assert.ok(short.data.steps.some((s) => s.category === 'viewpoint'));
});

test('ricerca full-text sui luoghi indicizzati', async () => {
  const r = await call('/api/search?q=uffiz');
  assert.equal(r.data.results[0].name, 'Galleria degli Uffizi');
  const r2 = await call('/api/search?q=cattedrale');
  assert.ok(r2.data.results.some((p) => p.id === 'way/1001'));
});

test('errori delle fonti esterne gestiti senza crash', async () => {
  const r = await call('/api/city?id=bad');
  assert.equal(r.status, 400);
  const nf = await call('/api/nonesiste');
  assert.equal(nf.status, 404);
  const page = await fetchReal(`${base}/city/qualcosa`, { method: 'GET', headers: {} });
  assert.equal(page.status, 200); // fallback SPA
});
