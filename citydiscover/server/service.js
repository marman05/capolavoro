'use strict';
// Logica applicativa: combina fonti, voti, distanze, filtri e sezioni della guida.
const config = require('./config');
const db = require('./db');
const geocode = require('./providers/geocode');
const placesP = require('./providers/places');
const wiki = require('./providers/wiki');
const weatherP = require('./providers/weather');
const eventsP = require('./providers/events');
const routing = require('./providers/routing');
const ratings = require('./ratings');
const oh = require('./opening-hours');
const itinerary = require('./itinerary');
const { haversine } = require('./geo');
const { CATEGORIES } = require('./categories');

const bad = (m, s = 400) => Object.assign(new Error(m), { status: s });
const num = (v) => (v === undefined || v === null || v === '' ? null : Number(v));

function rememberCity(c) {
  db.get()
    .prepare(
      `INSERT INTO cities (id, name, display_name, country, country_code, lat, lon, bbox, last_searched_at, search_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
       ON CONFLICT(id) DO UPDATE SET last_searched_at = excluded.last_searched_at, search_count = search_count + 1,
         name = excluded.name, display_name = excluded.display_name`
    )
    .run(c.id, c.name, c.displayName, c.country, c.countryCode, c.lat, c.lon, JSON.stringify(c.bbox), Date.now());
}

async function getCity(id, lang) {
  if (!id) throw bad('Parametro id mancante');
  const c = await geocode.lookup(id, lang);
  rememberCity(c);
  return c;
}

/** Offset UTC della città (da Open-Meteo); in mancanza, approssimazione dalla longitudine. */
async function cityClock(lat, lon) {
  try {
    const w = await weatherP.forecast(lat, lon);
    return { offset: w.utcOffsetSeconds, timezone: w.timezone, verified: true, weather: w };
  } catch {
    return { offset: Math.round(lon / 15) * 3600, timezone: null, verified: false, weather: null };
  }
}

function localNow(offsetSec) {
  return new Date(Date.now() + offsetSec * 1000); // campi UTC = ora locale della città
}
const isoDay = (d) => d.toISOString().slice(0, 10);

function decorate(places, { userLat, userLon, now }) {
  const r = ratings.forItems(places.map((p) => p.id));
  return places.map((p) => {
    const rating = r[p.id];
    const out = { ...p, rating, popularity: ratings.popularity(p, rating) };
    if (userLat != null && userLon != null) out.distanceMeters = Math.round(haversine(userLat, userLon, p.lat, p.lon));
    out.openNow = p.openingHours ? oh.isOpenAt(p.openingHours, now) : null;
    out.visitMinutes = (CATEGORIES[p.category] || {}).visitMin || null;
    out.priceLevel = p.priceLevel ?? rating.reportedPriceLevel ?? null;
    const sightLike = ['sights', 'nature'].includes((CATEGORIES[p.category] || {}).group);
    out.hidden = !!(
      sightLike &&
      (p.sitelinks || 0) <= 4 &&
      (p.wikidata || p.heritage || p.category === 'viewpoint' || (rating.available && rating.score >= 7.5))
    );
    return out;
  });
}

const PRICE = { free: 0, cheap: 1, medium: 2, expensive: 3 };

function applyFilters(list, q) {
  let out = list;
  if (q.category) {
    const cats = String(q.category).split(',');
    const groups = new Set(cats.filter((c) => ['sights', 'nature', 'activities', 'food'].includes(c)));
    out = out.filter((p) => cats.includes(p.category) || groups.has((CATEGORIES[p.category] || {}).group));
  }
  if (q.radiusKm && out.length && out[0].distanceMeters !== undefined) out = out.filter((p) => p.distanceMeters <= Number(q.radiusKm) * 1000);
  if (q.minScore) out = out.filter((p) => p.rating.available && p.rating.score >= Number(q.minScore));
  if (q.price) {
    const allowed = String(q.price).split(',').map((x) => PRICE[x]).filter((x) => x !== undefined);
    out = out.filter((p) => allowed.includes(p.priceLevel));
  }
  if (q.openNow === '1') out = out.filter((p) => p.openNow === true);
  if (q.hidden === '1') out = out.filter((p) => p.hidden);
  if (q.withPhoto === '1') out = out.filter((p) => p.image);
  const sort = q.sort || 'popular';
  const sorters = {
    popular: (a, b) => b.popularity - a.popularity,
    rating: (a, b) => (b.rating.score ?? -1) - (a.rating.score ?? -1) || b.rating.count - a.rating.count || b.popularity - a.popularity,
    distance: (a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity),
    hidden: (a, b) => Number(b.hidden) - Number(a.hidden) || b.notability - a.notability,
    name: (a, b) => a.name.localeCompare(b.name),
  };
  out = [...out].sort(sorters[sort] || sorters.popular);
  return out;
}

async function cityPlaces(q) {
  const lang = q.lang || 'it';
  const city = await getCity(q.id, lang);
  const [res, clock] = await Promise.all([placesP.loadCity(city, { lang }), cityClock(city.lat, city.lon)]);
  const userLat = num(q.lat);
  const userLon = num(q.lon);
  const origin = userLat != null ? { lat: userLat, lon: userLon } : null;
  const all = decorate(res.places, { userLat: origin ? origin.lat : city.lat, userLon: origin ? origin.lon : city.lon, now: localNow(clock.offset) });
  const filtered = applyFilters(all, q);
  const limit = Math.min(Number(q.limit) || 300, 1000);
  const counts = {};
  for (const p of all) counts[p.category] = (counts[p.category] || 0) + 1;
  return {
    city,
    distanceFrom: origin ? 'user' : 'center',
    total: filtered.length,
    places: filtered.slice(0, limit),
    counts,
    fetchedAt: res.fetchedAt,
    stale: !!res.stale,
    timezone: clock.timezone,
    sources: [{ name: 'OpenStreetMap', license: 'ODbL' }, { name: 'Wikidata / Wikimedia Commons' }],
  };
}

async function nearby(q) {
  const lat = num(q.lat);
  const lon = num(q.lon);
  if (lat == null || lon == null) throw bad('Posizione mancante');
  const radiusKm = Math.min(Number(q.radiusKm) || 3, 20);
  const [res, clock] = await Promise.all([placesP.loadNearby(lat, lon, radiusKm * 1000, { lang: q.lang }), cityClock(lat, lon)]);
  const all = decorate(res.places, { userLat: lat, userLon: lon, now: localNow(clock.offset) });
  const filtered = applyFilters(all, { sort: 'distance', ...q, radiusKm });
  return { places: filtered.slice(0, Number(q.limit) || 200), total: filtered.length, fetchedAt: res.fetchedAt, stale: !!res.stale };
}

async function placeDetail(q) {
  const id = q.id;
  let p = placesP.getPlace(id);
  if (!p) throw bad('Luogo non trovato: apri prima la città o la zona che lo contiene', 404);
  const clock = await cityClock(p.lat, p.lon);
  const [decorated] = decorate([p], { userLat: num(q.lat), userLon: num(q.lon), now: localNow(clock.offset) });
  const [w, dirs] = await Promise.all([
    wiki.details(p, q.lang || 'it').catch(() => null),
    num(q.lat) != null ? routing.directions({ lat: num(q.lat), lon: num(q.lon) }, p).catch(() => null) : Promise.resolve(null),
  ]);
  const photos = [];
  if (p.image) photos.push({ url: p.image, credit: 'Wikimedia Commons' });
  for (const ph of w?.photos || []) if (!photos.some((x) => x.url === ph.url)) photos.push(ph);
  return {
    place: {
      ...decorated,
      description: w?.extract || p.description || p.wikiDescription || null,
      descriptionSource: w?.extract ? { name: 'Wikipedia', url: w.url } : p.description ? { name: 'OpenStreetMap' } : null,
      photos,
      openingTable: p.openingHours ? oh.describe(p.openingHours) : null,
      openingVerified: false, // dati collaborativi OSM: vanno sempre confermati sul sito ufficiale
      categoryLabel: (CATEGORIES[p.category] || {}).label,
      visitMinutesNote: 'Stima in base alla categoria',
    },
    reviews: ratings.reviewsFor(id),
    directions: dirs,
    links: routing.navigationLinks(num(q.lat) != null ? { lat: num(q.lat), lon: num(q.lon) } : null, p),
    timezone: clock.timezone,
    updatedAt: p.updatedAt,
  };
}

/** Intervallo di date locali per i filtri eventi. */
function dateRange(when, from, to, offset) {
  const today = localNow(offset);
  const d0 = isoDay(today);
  const add = (n) => isoDay(new Date(today.getTime() + n * 86400000));
  switch (when) {
    case 'today':
      return [d0, d0];
    case 'tomorrow':
      return [add(1), add(1)];
    case 'weekend': {
      // Venerdì–domenica della settimana corrente (o restante, se già nel weekend).
      const dow = today.getUTCDay(); // 0 dom … 6 sab
      if (dow === 0) return [d0, d0];
      if (dow === 6) return [d0, add(1)];
      if (dow === 5) return [d0, add(2)];
      return [add(5 - dow), add(7 - dow)];
    }
    case 'week':
      return [d0, add(6)];
    case 'custom':
      if (!from) throw bad('Data iniziale mancante');
      return [from, to || from];
    default:
      return [d0, add(29)];
  }
}

async function events(q) {
  let lat = num(q.lat);
  let lon = num(q.lon);
  let city = null;
  if (q.id) {
    city = await getCity(q.id, q.lang);
    lat = city.lat;
    lon = city.lon;
  }
  if (lat == null) throw bad('Città o posizione mancante');
  const clock = await cityClock(lat, lon);
  const [dFrom, dTo] = dateRange(q.when, q.from, q.to, clock.offset);
  const days = Math.min(120, Math.max(30, Math.ceil((new Date(dTo) - new Date()) / 86400000) + 2));
  const radiusKm = Math.min(Number(q.radiusKm) || 25, 100);
  const res = await eventsP.search(lat, lon, { radiusKm: radiusKm <= 25 ? 25 : radiusKm <= 50 ? 50 : 100, days });
  const userLat = num(q.userLat) ?? (q.id ? null : lat);
  const userLon = num(q.userLon) ?? (q.id ? null : lon);
  const origin = userLat != null ? { lat: userLat, lon: userLon } : { lat, lon };
  const r = ratings.forItems(res.events.map((e) => e.id));
  let list = res.events
    .map((e) => ({
      ...e,
      rating: r[e.id],
      distanceMeters: e.venue.lat != null ? Math.round(haversine(origin.lat, origin.lon, e.venue.lat, e.venue.lon)) : null,
    }))
    .filter((e) => {
      const day = e.startLocal?.date || String(e.start).slice(0, 10);
      const endDay = e.end ? String(e.end).slice(0, 10) : day;
      return endDay >= dFrom && day <= dTo;
    })
    .filter((e) => e.distanceMeters == null || e.distanceMeters <= radiusKm * 1000);
  if (q.category) {
    const c = String(q.category).split(',');
    list = list.filter((e) => c.includes(e.category));
  }
  if (q.free === '1') list = list.filter((e) => e.price && e.price.free);
  if (q.paid === '1') list = list.filter((e) => e.price && !e.price.free);
  return {
    city,
    range: { from: dFrom, to: dTo },
    distanceFrom: num(q.userLat) != null ? 'user' : 'center',
    events: list,
    total: list.length,
    sources: res.sources,
    fetchedAt: res.fetchedAt,
    stale: !!res.stale,
    categories: eventsP.EVENT_CATEGORIES,
  };
}

/** Sezioni della home di una città: cosa fare oggi, classifica, nascosti, vicino a te, weekend. */
async function highlights(q) {
  const base = await cityPlaces({ ...q, limit: 1000, category: undefined, sort: 'popular' });
  const sights = base.places.filter((p) => ['sights', 'nature', 'activities'].includes((CATEGORIES[p.category] || {}).group));
  const clock = await cityClock(base.city.lat, base.city.lon);
  const [today, weekend] = await Promise.all([
    events({ id: q.id, when: 'today', lang: q.lang, userLat: q.lat, userLon: q.lon }).catch((e) => ({ error: e.message, events: [] })),
    events({ id: q.id, when: 'weekend', lang: q.lang, userLat: q.lat, userLon: q.lon }).catch((e) => ({ error: e.message, events: [] })),
  ]);
  const wet = clock.weather?.daily?.[0]?.rainProbability >= 60;
  const todayPicks = sights
    .filter((p) => p.openNow !== false)
    .map((p) => ({ p, s: p.popularity + (p.openNow ? 10 : 0) + (wet && (CATEGORIES[p.category] || {}).indoor ? 25 : 0) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 12)
    .map((x) => x.p);
  const ranked = [...sights].sort((a, b) => {
    const sa = a.rating.available ? a.rating.score * 10 : -1;
    const sb = b.rating.available ? b.rating.score * 10 : -1;
    return sb - sa || b.popularity - a.popularity;
  });
  return {
    city: base.city,
    weather: clock.weather,
    timezone: clock.timezone,
    counts: base.counts,
    todo: todayPicks,
    top: ranked.slice(0, 20),
    hidden: sights.filter((p) => p.hidden).sort((a, b) => b.notability - a.notability).slice(0, 12),
    nearYou: q.lat ? [...base.places].sort((a, b) => a.distanceMeters - b.distanceMeters).filter((p) => (CATEGORIES[p.category] || {}).group !== 'food' || p.rating.available).slice(0, 12) : [],
    eventsToday: today.events.slice(0, 12),
    eventsWeekend: weekend.events.slice(0, 12),
    eventSources: weekend.sources || today.sources || [],
    eventsFetchedAt: weekend.fetchedAt || today.fetchedAt || null,
    fetchedAt: base.fetchedAt,
    stale: base.stale,
  };
}

async function planDay(body) {
  const base = await cityPlaces({ id: body.cityId, lang: body.lang, limit: 1000 });
  const clock = await cityClock(base.city.lat, base.city.lon);
  const date = body.date || isoDay(localNow(clock.offset));
  let evs = [];
  if (body.preferences?.events !== false) {
    const r = await events({ id: body.cityId, when: 'custom', from: date, to: date, lang: body.lang }).catch(() => null);
    evs = r ? r.events : [];
  }
  const start = body.start && body.start.lat != null ? body.start : { lat: base.city.lat, lon: base.city.lon };
  const result = itinerary.plan({
    places: base.places,
    events: evs,
    start,
    date,
    startTime: body.startTime,
    hours: body.hours,
    mode: body.mode,
    preferences: body.preferences || {},
    weather: clock.weather,
  });
  const day = clock.weather?.daily?.find((d) => d.date === date);
  return { ...result, city: base.city, weather: day || null, start, timezone: clock.timezone };
}

function searchIndexed(q) {
  return { results: placesP.searchIndexed(q.q || '', Math.min(Number(q.limit) || 20, 50)) };
}

// ---------- Liste e preferiti ----------
function myLists(userId) {
  const d = db.get();
  const lists = d.prepare('SELECT id, name, is_favorites AS isFavorites, share_token AS shareToken, created_at AS createdAt FROM lists WHERE user_id = ? ORDER BY is_favorites DESC, created_at').all(userId);
  const items = d.prepare('SELECT list_id, item_id AS itemId, item_type AS itemType, snapshot, added_at AS addedAt FROM list_items WHERE list_id IN (SELECT id FROM lists WHERE user_id = ?) ORDER BY added_at DESC').all(userId);
  return lists.map((l) => ({
    ...l,
    isFavorites: !!l.isFavorites,
    items: items.filter((i) => i.list_id === l.id).map(({ list_id, snapshot, ...i }) => ({ ...i, snapshot: JSON.parse(snapshot) })),
  }));
}

function ownList(userId, listId) {
  const l = db.get().prepare('SELECT * FROM lists WHERE id = ? AND user_id = ?').get(Number(listId), userId);
  if (!l) throw bad('Lista non trovata', 404);
  return l;
}

function createList(userId, name) {
  const n = String(name || '').trim().slice(0, 80);
  if (!n) throw bad('Nome lista mancante');
  const info = db.get().prepare('INSERT INTO lists (user_id, name) VALUES (?, ?)').run(userId, n);
  return { id: Number(info.lastInsertRowid), name: n };
}

function deleteList(userId, listId) {
  const l = ownList(userId, listId);
  if (l.is_favorites) throw bad('La lista Preferiti non può essere eliminata');
  db.get().prepare('DELETE FROM lists WHERE id = ?').run(l.id);
}

function addItem(userId, listId, { itemId, itemType, snapshot }) {
  const l = listId === 'favorites' ? db.get().prepare('SELECT * FROM lists WHERE user_id = ? AND is_favorites = 1').get(userId) : ownList(userId, listId);
  if (!itemId || !['place', 'event'].includes(itemType)) throw bad('Elemento non valido');
  const s = snapshot || {};
  const snap = { name: String(s.name || '').slice(0, 200), category: s.category || null, lat: num(s.lat), lon: num(s.lon), image: s.image || null, date: s.date || null };
  db.get().prepare('INSERT OR REPLACE INTO list_items (list_id, item_id, item_type, snapshot) VALUES (?, ?, ?, ?)').run(l.id, itemId, itemType, JSON.stringify(snap));
  return { listId: l.id };
}

function removeItem(userId, listId, itemId) {
  const l = listId === 'favorites' ? db.get().prepare('SELECT * FROM lists WHERE user_id = ? AND is_favorites = 1').get(userId) : ownList(userId, listId);
  db.get().prepare('DELETE FROM list_items WHERE list_id = ? AND item_id = ?').run(l.id, itemId);
}

function shareList(userId, listId) {
  const l = ownList(userId, listId);
  const token = l.share_token || require('node:crypto').randomBytes(12).toString('base64url');
  db.get().prepare('UPDATE lists SET share_token = ? WHERE id = ?').run(token, l.id);
  return { token };
}

function sharedList(token) {
  const d = db.get();
  const l = d.prepare('SELECT l.id, l.name, u.name AS owner FROM lists l JOIN users u ON u.id = l.user_id WHERE share_token = ?').get(String(token));
  if (!l) throw bad('Lista non trovata', 404);
  const items = d.prepare('SELECT item_id AS itemId, item_type AS itemType, snapshot FROM list_items WHERE list_id = ? ORDER BY added_at DESC').all(l.id);
  return { name: l.name, owner: l.owner, items: items.map((i) => ({ ...i, snapshot: JSON.parse(i.snapshot) })) };
}

// ---------- Aggiornamento automatico ----------
async function refreshRecent() {
  const d = db.get();
  const since = Date.now() - 7 * 86400000;
  const cities = d.prepare('SELECT * FROM cities WHERE last_searched_at > ? ORDER BY search_count DESC, last_searched_at DESC LIMIT ?').all(since, config.refreshRecentCities);
  for (const row of cities) {
    const city = { id: row.id, name: row.name, lat: row.lat, lon: row.lon, bbox: JSON.parse(row.bbox || 'null') };
    try {
      await eventsP.search(city.lat, city.lon, { radiusKm: 25, days: 30, force: true });
      await placesP.loadCity(city, {}); // si riscarica da solo quando la cache è scaduta
      await weatherP.forecast(city.lat, city.lon);
    } catch (e) {
      console.warn(`[refresh] ${row.name}: ${e.message}`);
    }
  }
  d.prepare('DELETE FROM api_cache WHERE expires_at < ?').run(Math.floor(Date.now() / 1000) - 30 * 86400);
  return cities.length;
}

module.exports = {
  getCity,
  cityPlaces,
  nearby,
  placeDetail,
  events,
  highlights,
  planDay,
  searchIndexed,
  myLists,
  createList,
  deleteList,
  addItem,
  removeItem,
  shareList,
  sharedList,
  refreshRecent,
  dateRange,
  applyFilters,
};
