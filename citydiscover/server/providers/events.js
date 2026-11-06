'use strict';
/*
 * Eventi da fonti esterne affidabili, normalizzati in un unico formato:
 *  - Ticketmaster Discovery API  (concerti, sport, teatro, famiglie)  → TICKETMASTER_API_KEY
 *  - PredictHQ Events API        (festival, eventi locali, fiere, sport, community) → PREDICTHQ_TOKEN
 * Nessun evento viene inventato: senza chiavi la sezione indica che la fonte non è configurata.
 */
const config = require('../config');
const { request, cached } = require('../http');
const { haversine } = require('../geo');

const EVENT_CATEGORIES = {
  concert: { label: 'Concerti', icon: '🎵' },
  festival: { label: 'Festival', icon: '🎪' },
  local: { label: 'Feste ed eventi locali', icon: '🎉' },
  nightlife: { label: 'Discoteche e serate', icon: '🪩' },
  sport: { label: 'Eventi sportivi', icon: '🏟️' },
  exhibition: { label: 'Mostre e musei', icon: '🖼️' },
  culture: { label: 'Teatro e cultura', icon: '🎭' },
  fair: { label: 'Sagre, fiere e mercatini', icon: '🧺' },
  family: { label: 'Famiglie e bambini', icon: '👨‍👩‍👧' },
  other: { label: 'Altro', icon: '📅' },
};

const RX = {
  festival: /festival|fest\b/i,
  nightlife: /\b(party|club|night|dj set|disco|discoteca|serata|rave)\b/i,
  fair: /sagra|mercat|market|fair\b|fiera|flohmarkt|brocante|mercadillo|christmas market|weihnachtsmarkt/i,
  exhibition: /mostra|exhibit|exposition|esposizione|ausstellung|exposición/i,
  family: /bambin|kids|famil|children|enfant|kinder/i,
};

function guessFromText(title, fallback) {
  if (RX.fair.test(title)) return 'fair';
  if (RX.festival.test(title)) return 'festival';
  if (RX.exhibition.test(title)) return 'exhibition';
  if (RX.nightlife.test(title)) return 'nightlife';
  if (RX.family.test(title)) return 'family';
  return fallback;
}

// ---------- Ticketmaster ----------
function tmCategory(e) {
  const c = (e.classifications || [])[0] || {};
  const seg = c.segment?.name;
  const genre = c.genre?.name || '';
  if (c.family) return 'family';
  if (seg === 'Music') return /dance|electronic/i.test(genre) ? 'nightlife' : RX.festival.test(e.name) ? 'festival' : 'concert';
  if (seg === 'Sports') return 'sport';
  if (seg === 'Arts & Theatre') return /fine art|exhibit/i.test(genre) ? 'exhibition' : 'culture';
  if (seg === 'Family') return 'family';
  return guessFromText(e.name, 'other');
}

const TM_STATUS = { onsale: 'available', offsale: 'not_on_sale', cancelled: 'cancelled', canceled: 'cancelled', postponed: 'postponed', rescheduled: 'rescheduled' };

function normalizeTicketmaster(e) {
  const v = e._embedded?.venues?.[0] || {};
  const pr = (e.priceRanges || [])[0];
  const img = (e.images || []).filter((i) => i.ratio === '16_9').sort((a, b) => b.width - a.width)[0] || (e.images || [])[0];
  const start = e.dates?.start || {};
  return {
    id: `tm:${e.id}`,
    source: 'Ticketmaster',
    title: e.name,
    category: tmCategory(e),
    description: e.info || e.pleaseNote || null,
    start: start.dateTime || (start.localDate ? `${start.localDate}${start.localTime ? 'T' + start.localTime : ''}` : null),
    startLocal: start.localDate ? { date: start.localDate, time: start.localTime || null } : null,
    end: e.dates?.end?.dateTime || null,
    timeTBA: !!(start.timeTBA || start.noSpecificTime),
    timezone: e.dates?.timezone || v.timezone || null,
    venue: {
      name: v.name || null,
      address: [v.address?.line1, v.postalCode, v.city?.name].filter(Boolean).join(', ') || null,
      lat: v.location ? Number(v.location.latitude) : null,
      lon: v.location ? Number(v.location.longitude) : null,
    },
    price: pr ? { min: pr.min ?? null, max: pr.max ?? null, currency: pr.currency || null, free: pr.max === 0 } : null,
    availability: TM_STATUS[e.dates?.status?.code] || 'unknown',
    ticketUrl: e.url || null,
    image: img ? img.url : null,
    url: e.url || null,
  };
}

async function fromTicketmaster(lat, lon, radiusKm, fromIso, toIso) {
  if (!config.keys.ticketmaster) return { status: 'not_configured', events: [] };
  const base =
    `${config.endpoints.ticketmaster}?apikey=${config.keys.ticketmaster}&latlong=${lat},${lon}` +
    `&radius=${Math.round(radiusKm)}&unit=km&size=200&sort=date,asc&locale=*` +
    `&startDateTime=${fromIso.replace(/\.\d+Z$/, 'Z')}&endDateTime=${toIso.replace(/\.\d+Z$/, 'Z')}`;
  const events = [];
  for (let page = 0; page < 3; page++) {
    const data = await request(`${base}&page=${page}`, { source: 'Ticketmaster' });
    events.push(...(data._embedded?.events || []).map(normalizeTicketmaster));
    if (!data.page || page + 1 >= data.page.totalPages) break;
  }
  return { status: 'ok', events };
}

// ---------- PredictHQ ----------
const PHQ_MAP = {
  concerts: 'concert',
  festivals: 'festival',
  'performing-arts': 'culture',
  sports: 'sport',
  expos: 'fair',
  community: 'local',
  conferences: 'other',
};

function normalizePredictHQ(e) {
  const venue = (e.entities || []).find((x) => x.type === 'venue') || {};
  const labels = e.labels || (e.phq_labels || []).map((l) => l.label) || [];
  let cat = PHQ_MAP[e.category] || 'other';
  if (labels.includes('family') || labels.includes('kids')) cat = 'family';
  else if (labels.includes('nightlife') || labels.includes('club')) cat = 'nightlife';
  else if (cat === 'local' || cat === 'fair' || cat === 'other') cat = guessFromText(e.title, cat);
  const [lon, lat] = e.location || e.geo?.geometry?.coordinates || [null, null];
  return {
    id: `phq:${e.id}`,
    source: 'PredictHQ',
    title: e.title,
    category: cat,
    description: e.description || null,
    start: e.start,
    startLocal: e.start_local ? { date: e.start_local.slice(0, 10), time: e.start_local.slice(11, 16) } : null,
    end: e.end && e.end !== e.start ? e.end : null,
    timeTBA: false,
    timezone: e.timezone || null,
    venue: { name: venue.name || null, address: venue.formatted_address || e.geo?.address?.formatted_address || null, lat, lon },
    price: null,
    availability: e.state === 'deleted' ? 'cancelled' : e.state === 'predicted' ? 'predicted' : 'unknown',
    ticketUrl: null,
    image: null,
    url: null,
    expectedAttendance: e.phq_attendance || null,
  };
}

async function fromPredictHQ(lat, lon, radiusKm, fromIso, toIso) {
  if (!config.keys.predicthq) return { status: 'not_configured', events: [] };
  const url =
    `${config.endpoints.predicthq}?within=${Math.round(radiusKm)}km@${lat},${lon}` +
    `&active.gte=${fromIso.slice(0, 10)}&active.lte=${toIso.slice(0, 10)}` +
    `&category=concerts,festivals,performing-arts,sports,expos,community&state=active,predicted&limit=200&sort=start`;
  const data = await request(url, { headers: { Authorization: `Bearer ${config.keys.predicthq}` }, source: 'PredictHQ' });
  return { status: 'ok', events: (data.results || []).map(normalizePredictHQ) };
}

/** Elimina duplicati tra fonti diverse (stesso titolo, stesso giorno, luogo vicino). */
function dedupe(events) {
  const out = [];
  const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  for (const e of events) {
    const day = (e.startLocal?.date || e.start || '').slice(0, 10);
    const dup = out.find(
      (o) =>
        (o.startLocal?.date || o.start || '').slice(0, 10) === day &&
        norm(o.title) === norm(e.title) &&
        (o.venue.lat == null || e.venue.lat == null || haversine(o.venue.lat, o.venue.lon, e.venue.lat, e.venue.lon) < 500)
    );
    if (dup) {
      // Ticketmaster ha prezzi e link d'acquisto: mantieni i dati più completi.
      dup.price = dup.price || e.price;
      dup.ticketUrl = dup.ticketUrl || e.ticketUrl;
      dup.image = dup.image || e.image;
      dup.alsoOn = [...(dup.alsoOn || []), e.source];
    } else out.push({ ...e });
  }
  return out;
}

/**
 * Eventi entro radiusKm per i prossimi `days` giorni.
 * Restituisce { events, sources: [{ name, status, error }], fetchedAt, stale }.
 */
async function search(lat, lon, { radiusKm = 25, days = 30, force = false } = {}) {
  const from = new Date();
  from.setUTCHours(0, 0, 0, 0);
  const to = new Date(from.getTime() + days * 86400000);
  const srcs = `${config.keys.ticketmaster ? 'T' : ''}${config.keys.predicthq ? 'P' : ''}`;
  const key = `events:${srcs}:${Number(lat).toFixed(2)},${Number(lon).toFixed(2)}:${radiusKm}:${days}:${from.toISOString().slice(0, 10)}`;
  const r = await cached(
    key,
    config.ttl.events,
    async () => {
      const results = await Promise.allSettled([
        fromTicketmaster(lat, lon, radiusKm, from.toISOString(), to.toISOString()),
        fromPredictHQ(lat, lon, radiusKm, from.toISOString(), to.toISOString()),
      ]);
      const names = ['Ticketmaster', 'PredictHQ'];
      const sources = results.map((x, i) => ({
        name: names[i],
        status: x.status === 'fulfilled' ? x.value.status : 'error',
        error: x.status === 'rejected' ? x.reason.message : undefined,
        count: x.status === 'fulfilled' ? x.value.events.length : 0,
      }));
      const configured = sources.filter((s) => s.status !== 'not_configured');
      if (configured.length && configured.every((s) => s.status === 'error')) {
        throw new Error('Nessuna fonte eventi raggiungibile: ' + configured.map((s) => s.error).join('; '));
      }
      const all = results.flatMap((x) => (x.status === 'fulfilled' ? x.value.events : []));
      const events = dedupe(all)
        .filter((e) => e.start && e.availability !== 'cancelled')
        .sort((a, b) => String(a.start).localeCompare(String(b.start)));
      return { events, sources };
    },
    { force }
  );
  return { ...r.value, fetchedAt: r.fetchedAt, stale: r.stale };
}

module.exports = { search, EVENT_CATEGORIES, normalizeTicketmaster, normalizePredictHQ, dedupe };
