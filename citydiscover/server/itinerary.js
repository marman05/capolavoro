'use strict';
/*
 * Pianificatore della giornata.
 * Costruisce un percorso che rispetta: tempo disponibile, orari di apertura (se noti),
 * durata delle visite, distanze, eventi a orario fisso, pause pasto, meteo e preferenze.
 * Algoritmo: inserimento greedy guidato da "valore / tempo speso" con vincoli temporali,
 * poi miglioramento 2-opt sulle tappe libere e nuova verifica di fattibilità.
 */
const oh = require('./opening-hours');
const { haversine, estimateMinutes } = require('./geo');
const { CATEGORIES } = require('./categories');

const PACE = { relaxed: 1.3, normal: 1, fast: 0.75 };
const MEAL_CATS = new Set(['restaurant']);
const NON_VISIT = new Set(['restaurant', 'cafe', 'bar', 'nightlife']);

const toMin = (hhmm) => {
  const [h, m] = String(hhmm || '09:00').split(':').map(Number);
  return h * 60 + (m || 0);
};
const fmt = (m) => oh.fmt(Math.round(m));

function wallClock(dateStr, minutes) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d, 0, Math.round(minutes)));
}

function travel(a, b, mode) {
  const m = haversine(a.lat, a.lon, b.lat, b.lon);
  // Brevi distanze: a piedi anche se si è scelto auto/mezzi.
  const effMode = m < 700 ? 'foot' : mode;
  return { meters: Math.round(m), minutes: m < 30 ? 0 : estimateMinutes(m, effMode), mode: effMode };
}

/** Verifica che la visita [arr, arr+dur] cada in un intervallo di apertura. Ritorna {ok, wait, status}. */
function openWindow(place, date, arr, dur) {
  if (!place.openingHours) return { ok: true, wait: 0, status: 'unknown' };
  const parsed = oh.parse(place.openingHours);
  if (!parsed) return { ok: true, wait: 0, status: 'unknown' };
  if (parsed.always) return { ok: true, wait: 0, status: 'open' };
  const iv = oh.intervalsOn(parsed, wallClock(date, 0));
  if (iv === null) return { ok: true, wait: 0, status: 'unknown' };
  for (const [s, e] of iv) {
    const start = Math.max(arr, s);
    if (start + dur <= e && start - arr <= 45) return { ok: true, wait: start - arr, status: 'open' };
  }
  return { ok: false };
}

function baseValue(p, prefs, wetHours) {
  const cat = CATEGORIES[p.category] || {};
  let v = 0.25 + (p.popularity || 0) / 100;
  if (p.rating && p.rating.available) v += (p.rating.score / 10) * 0.9;
  if (prefs.categories && prefs.categories.length) v *= prefs.categories.includes(p.category) ? 1.8 : 0.6;
  if (prefs.hidden && p.hidden) v *= 1.6;
  if (prefs.mustSee && prefs.mustSee.includes(p.id)) v += 10;
  if (wetHours && !cat.indoor) v *= 0.55;
  return v;
}

function simulate(order, ctx) {
  const { date, startMin, endMin, start, mode, pace } = ctx;
  let t = startMin;
  let pos = start;
  const steps = [];
  for (const item of order) {
    // Le pause libere ("floating") avvengono dove ci si trova: nessuno spostamento.
    const tr = item.floating ? { meters: 0, minutes: 0, mode: 'foot' } : travel(pos, item, mode);
    const arr = t + tr.minutes;
    if (item.kind === 'event') {
      if (arr > item.startMin) return null;
      steps.push({ item, travel: tr, arrive: arr, begin: item.startMin, end: item.endMin, wait: item.startMin - arr, status: 'event' });
      t = item.endMin;
    } else {
      const dur = Math.round((item.visitMin || 45) * (item.kind === 'visit' ? pace : 1));
      let begin = arr;
      let status = 'unknown';
      if (item.window) {
        begin = Math.max(arr, item.window[0]);
        if (begin > item.window[1]) return null;
      }
      if (item.kind === 'visit' || item.kind === 'meal') {
        const w = openWindow(item, date, begin, dur);
        if (!w.ok) return null;
        begin += w.wait;
        status = w.status;
      }
      steps.push({ item, travel: tr, arrive: arr, begin, end: begin + dur, wait: begin - arr, status });
      t = begin + dur;
    }
    if (t > endMin) return null;
    if (!item.floating) pos = item;
  }
  return { steps, endTime: t };
}

/** Tempo "speso" da un percorso: spostamenti + visite (le attese non contano: sono buchi da riempire). */
function cost(sim) {
  return sim.steps.reduce((a, s) => a + s.travel.minutes + (s.end - s.begin), 0);
}

function plan(input) {
  const {
    places = [],
    events = [],
    start,
    date,
    startTime = '09:00',
    hours = 8,
    mode = 'foot',
    preferences = {},
    weather = null,
  } = input;
  if (!start || start.lat == null) throw Object.assign(new Error('Punto di partenza mancante'), { status: 400 });
  const startMin = toMin(startTime);
  const endMin = Math.min(startMin + Math.max(1, Math.min(16, Number(hours))) * 60, 24 * 60 + 180);
  const pace = PACE[preferences.pace] || 1;
  const includeMeals = preferences.meals !== false;
  const budgetFree = preferences.budget === 'free';
  const prefs = preferences;

  // Ore di pioggia previste nella finestra (probabilità ≥ 50%).
  const wetHours = (weather?.hourly || []).filter((h) => h.time.startsWith(date) && h.rainProbability >= 50).length >= 2;

  const warnings = [];
  if (wetHours) warnings.push('Pioggia prevista: privilegiati musei, chiese e luoghi al coperto.');
  if (mode === 'transit') warnings.push('I tempi con i mezzi pubblici sono stime: verifica gli orari reali con il link di navigazione.');

  const visits = places
    .filter((p) => !NON_VISIT.has(p.category))
    .filter((p) => !budgetFree || p.priceLevel === 0 || p.priceLevel == null)
    .map((p) => ({ ...p, kind: 'visit', visitMin: (CATEGORIES[p.category] || {}).visitMin || 45, value: baseValue(p, preferences, wetHours) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 60);

  const evs = events
    .filter((e) => e.venue && e.venue.lat != null && e.startLocal && e.startLocal.date === date && e.startLocal.time)
    .filter((e) => !budgetFree || (e.price && e.price.free))
    .map((e) => {
      const s = toMin(e.startLocal.time);
      let en = s + 120;
      if (e.end) {
        const endD = new Date(e.end);
        const startD = new Date(e.start);
        const durMin = (endD - startD) / 60000;
        if (durMin > 15 && durMin < 600) en = s + durMin;
      }
      return { ...e, kind: 'event', lat: e.venue.lat, lon: e.venue.lon, name: e.title, startMin: s, endMin: en, value: 1.2 + (preferences.events === false ? -5 : 0) };
    })
    .filter((e) => e.startMin >= startMin && e.endMin <= endMin && e.value > 0);

  const restaurants = places.filter((p) => MEAL_CATS.has(p.category));

  const ctx = { date, startMin, endMin, start, mode, pace };
  let order = [];
  const used = new Set();

  // Inserisce un elemento nella posizione che costa meno tempo aggiuntivo. Ritorna {order, added} o null.
  const bestInsertion = (item) => {
    const base = order.length ? cost(simulate(order, ctx)) : 0;
    let best = null;
    for (let i = 0; i <= order.length; i++) {
      const cand = [...order.slice(0, i), item, ...order.slice(i)];
      const sim = simulate(cand, ctx);
      if (!sim) continue;
      const added = cost(sim) - base;
      if (!best || added < best.added) best = { order: cand, added };
    }
    return best;
  };

  // 1) Eventi a orario fisso (più interessanti per primi).
  for (const e of [...evs].sort((a, b) => b.value - a.value)) {
    const ins = bestInsertion(e);
    if (ins) { order = ins.order; used.add(e.id); }
  }

  // 2) Pause pasto con finestra oraria (il ristorante viene scelto alla fine, vicino alla tappa precedente).
  if (includeMeals) {
    const meals = [];
    if (startMin <= 13 * 60 && endMin >= 14 * 60 + 15) meals.push({ label: 'Pranzo', window: [12 * 60 + 15, 14 * 60], visitMin: 70 });
    if (startMin <= 20 * 60 && endMin >= 21 * 60 + 15) meals.push({ label: 'Cena', window: [19 * 60 + 15, 21 * 60], visitMin: 90 });
    for (const m of meals) {
      const ins = bestInsertion({ kind: 'break', floating: true, id: `break:${m.label}`, name: `${m.label} libero`, mealLabel: m.label, window: m.window, visitMin: m.visitMin });
      if (ins) order = ins.order;
    }
  }

  // 3) Visite: prima le categorie preferite, poi il resto, scegliendo il miglior rapporto valore/tempo.
  const preferred = (c) => (prefs.mustSee || []).includes(c.id) || (prefs.categories || []).includes(c.category);
  const hasPrefs = (prefs.categories && prefs.categories.length) || (prefs.mustSee && prefs.mustSee.length);
  const tiers = hasPrefs ? [visits.filter(preferred), visits] : [visits];
  for (const pool of tiers) {
    for (let guard = 0; guard < 60; guard++) {
      let best = null;
      for (const c of pool) {
        if (used.has(c.id)) continue;
        const ins = bestInsertion(c);
        if (!ins) continue;
        const score = c.value / Math.max(15, ins.added);
        if (!best || score > best.score) best = { c, ins, score };
      }
      if (!best) break;
      order = best.ins.order;
      used.add(best.c.id);
    }
  }

  // 4) Ristorante vicino alla tappa precedente al posto della pausa libera, se compatibile.
  for (let i = 0; i < order.length; i++) {
    const it = order[i];
    if (it.kind !== 'break') continue;
    const prev = order.slice(0, i).reverse().find((x) => !x.floating) || start;
    const options = restaurants
      .filter((r) => !used.has(r.id))
      .map((r) => ({ r, d: haversine(prev.lat, prev.lon, r.lat, r.lon) }))
      .filter((x) => x.d < 1200)
      .sort((a, b) => (b.r.rating?.score || 0) - (a.r.rating?.score || 0) || a.d - b.d);
    for (const { r } of options.slice(0, 15)) {
      const meal = { ...r, kind: 'meal', window: it.window, visitMin: it.visitMin, mealLabel: it.mealLabel };
      const cand = [...order.slice(0, i), meal, ...order.slice(i + 1)];
      if (simulate(cand, ctx)) { order = cand; used.add(r.id); break; }
    }
  }

  // 2-opt sulle sottosequenze di sole visite libere.
  let sim = simulate(order, ctx);
  let improved = true;
  for (let round = 0; improved && round < 20 && sim; round++) {
    improved = false;
    for (let i = 0; i < order.length - 1; i++) {
      for (let k = i + 1; k < order.length; k++) {
        const seg = order.slice(i, k + 1);
        if (seg.some((x) => x.kind !== 'visit')) continue;
        const cand = [...order.slice(0, i), ...seg.reverse(), ...order.slice(k + 1)];
        const s2 = simulate(cand, ctx);
        if (s2 && cost(s2) < cost(sim)) {
          order = cand;
          sim = s2;
          improved = true;
        }
      }
    }
  }
  if (!sim) sim = { steps: [], endTime: startMin };

  if (sim.steps.some((s) => s.status === 'unknown' && s.item.kind === 'visit'))
    warnings.push('Alcuni orari di apertura non sono verificati: controlla sul sito ufficiale prima di andare.');
  if (!sim.steps.length) warnings.push('Nessuna tappa compatibile con il tempo e gli orari indicati.');

  const steps = sim.steps.map((s) => ({
    type: s.item.kind,
    id: s.item.id,
    name: s.item.name,
    category: s.item.category || null,
    mealLabel: s.item.mealLabel || null,
    lat: s.item.lat,
    lon: s.item.lon,
    image: s.item.image || null,
    rating: s.item.rating || null,
    ticketUrl: s.item.ticketUrl || null,
    travel: { ...s.travel, estimated: true },
    arrive: fmt(s.arrive),
    start: fmt(s.begin),
    end: fmt(s.end),
    waitMinutes: Math.round(s.wait),
    openingStatus: s.status,
    openingHours: s.item.openingHours || null,
  }));
  const walkM = sim.steps.filter((s) => s.travel.mode === 'foot').reduce((a, s) => a + s.travel.meters, 0);
  return {
    date,
    mode,
    startTime: fmt(startMin),
    endTime: fmt(sim.endTime),
    availableUntil: fmt(endMin),
    steps,
    summary: {
      stops: steps.filter((s) => s.type === 'visit' || s.type === 'event').length,
      travelMinutes: sim.steps.reduce((a, s) => a + s.travel.minutes, 0),
      walkingKm: Math.round(walkM / 100) / 10,
      freeMinutes: Math.max(0, Math.round(endMin - sim.endTime)),
    },
    warnings,
  };
}

module.exports = { plan, openWindow, simulate };
