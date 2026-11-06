'use strict';
// Luoghi e attrazioni da OpenStreetMap (Overpass API), normalizzati e salvati su database.
const config = require('../config');
const db = require('../db');
const { request, cached } = require('../http');
const { classify, CATEGORIES } = require('../categories');
const { haversine } = require('../geo');
const wiki = require('./wiki');

function sightsQuery(lat, lon, r) {
  const A = `(around:${r},${lat},${lon})`;
  return `[out:json][timeout:90];
(
  nwr["tourism"~"^(attraction|museum|gallery|viewpoint|artwork|zoo|aquarium|theme_park)$"]["name"]${A};
  nwr["historic"~"^(monument|memorial|castle|ruins|archaeological_site|fort|palace|city_gate|tower|church|manor|monastery|citywalls|aqueduct|bridge|fountain)$"]["name"]${A};
  nwr["amenity"="place_of_worship"]["name"]["wikidata"]${A};
  nwr["building"~"^(cathedral|basilica)$"]["name"]${A};
  nwr["place"="square"]["name"]${A};
  nwr["leisure"~"^(park|garden|nature_reserve|water_park)$"]["name"]${A};
  nwr["natural"~"^(beach|peak|waterfall|cave_entrance|bay|cliff|volcano|hot_spring)$"]["name"]${A};
  nwr["amenity"~"^(theatre|arts_centre|concert_hall|marketplace)$"]["name"]${A};
  nwr["leisure"="stadium"]["name"]${A};
);
out center tags 4000;`;
}

function foodQuery(lat, lon, r) {
  const A = `(around:${r},${lat},${lon})`;
  return `[out:json][timeout:90];
(
  nwr["amenity"~"^(restaurant|cafe|bar|pub|biergarten|nightclub|ice_cream)$"]["name"]${A};
);
out center tags 2500;`;
}

async function overpass(query) {
  let lastErr;
  for (const base of config.endpoints.overpass) {
    try {
      return await request(base, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeoutMs: 100000,
        source: 'OpenStreetMap Overpass',
      });
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

function address(t) {
  const street = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' ');
  const city = [t['addr:postcode'], t['addr:city']].filter(Boolean).join(' ');
  return [street, city].filter(Boolean).join(', ') || t['addr:full'] || null;
}

/** Ingresso: { free: true } | { amount, currency, text } | { paid: true } | null (non indicato). */
function admission(t) {
  if (t.fee === 'no' || t.fee === 'free') return { free: true, text: 'Gratuito' };
  if (t.charge) {
    const m = /(\d+(?:[.,]\d+)?)\s*([A-Z]{3}|€|\$|£)?/.exec(t.charge);
    return { amount: m ? Number(m[1].replace(',', '.')) : null, currency: m && m[2] ? m[2] : null, text: t.charge };
  }
  if (t.fee === 'yes') return { paid: true, text: 'A pagamento (importo non indicato)' };
  return null;
}

/** Livello di prezzo derivato solo da dati espliciti: 0 gratuito, 1 economico, 2 medio, 3 costoso. */
function priceLevel(adm) {
  if (!adm) return null;
  if (adm.free) return 0;
  if (adm.amount == null) return null;
  return adm.amount <= 6 ? 1 : adm.amount <= 15 ? 2 : 3;
}

function normalizeElement(el) {
  const t = el.tags || {};
  const cls = classify(t);
  if (!cls || !t.name) return null;
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat == null || lon == null) return null;
  const adm = admission(t);
  let notability = 0;
  if (t.wikidata) notability += 3;
  if (t.wikipedia) notability += 2;
  if (t.heritage || t['heritage:operator']) notability += 2;
  if (t.tourism === 'attraction') notability += 1;
  if (t.website || t['contact:website']) notability += 1;
  return {
    id: `${el.type}/${el.id}`,
    name: t.name,
    names: Object.fromEntries(Object.entries(t).filter(([k]) => k.startsWith('name:')).map(([k, v]) => [k.slice(5), v])),
    category: cls[0],
    subcategory: cls[1],
    lat,
    lon,
    address: address(t),
    openingHours: t.opening_hours || null,
    website: t.website || t['contact:website'] || t.url || null,
    phone: t.phone || t['contact:phone'] || null,
    admission: adm,
    priceLevel: priceLevel(adm),
    wikidata: t.wikidata || null,
    wikipedia: t.wikipedia || null,
    image: t.image && /^https:\/\//.test(t.image) ? t.image : null,
    commons: t.wikimedia_commons || null,
    description: t.description || null,
    cuisine: t.cuisine || null,
    wheelchair: t.wheelchair || null,
    heritage: !!(t.heritage || t['heritage:operator']),
    notability,
    source: 'OpenStreetMap',
  };
}

function savePlaces(cityId, places, fetchedAt) {
  db.transaction((d) => {
    const ins = d.prepare(
      `INSERT INTO places (id, city_id, name, category, subcategory, lat, lon, data, notability, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET city_id = excluded.city_id, name = excluded.name, category = excluded.category,
         subcategory = excluded.subcategory, lat = excluded.lat, lon = excluded.lon, data = excluded.data,
         notability = excluded.notability, updated_at = excluded.updated_at`
    );
    const delFts = d.prepare('DELETE FROM places_fts WHERE id = ?');
    const insFts = d.prepare('INSERT INTO places_fts (id, name, category, description) VALUES (?, ?, ?, ?)');
    for (const p of places) {
      ins.run(p.id, cityId, p.name, p.category, p.subcategory || null, p.lat, p.lon, JSON.stringify(p), p.notability, Math.floor(fetchedAt / 1000));
      delFts.run(p.id);
      const alt = Object.values(p.names || {}).join(' ');
      insFts.run(p.id, `${p.name} ${alt}`, CATEGORIES[p.category].label, [p.description, p.wikiDescription].filter(Boolean).join(' '));
    }
  });
}

function radiusFor(city) {
  if (!city.bbox) return 6000;
  const [s, n, w, e] = city.bbox;
  const diag = haversine(s, w, n, e);
  return Math.round(Math.min(15000, Math.max(2500, diag / 2)));
}

/**
 * Scarica (o legge dalla cache) i luoghi attorno a un punto.
 * Restituisce { places, fetchedAt, stale }.
 */
async function loadArea({ key, lat, lon, radius, foodRadius, lang = 'it', force = false }) {
  const r = await cached(
    `places:${lang}:${key}:${radius}`,
    config.ttl.places,
    async () => {
      const [sights, food] = await Promise.all([overpass(sightsQuery(lat, lon, radius)), overpass(foodQuery(lat, lon, foodRadius))]);
      const seen = new Set();
      const out = [];
      for (const el of [...sights.elements, ...food.elements]) {
        const p = normalizeElement(el);
        if (!p || seen.has(p.id)) continue;
        seen.add(p.id);
        out.push(p);
      }
      // Arricchimento da Wikidata: foto, descrizione, numero di versioni linguistiche (popolarità).
      await wiki.enrichFromWikidata(out, lang).catch(() => {});
      return out;
    },
    { force }
  );
  return { places: r.value, fetchedAt: r.fetchedAt, stale: r.stale, error: r.error };
}

async function loadCity(city, { lang, force } = {}) {
  const radius = radiusFor(city);
  const res = await loadArea({ key: city.id, lat: city.lat, lon: city.lon, radius, foodRadius: Math.min(radius, 5000), lang, force });
  savePlaces(city.id, res.places, res.fetchedAt);
  return { ...res, radius };
}

async function loadNearby(lat, lon, radius, { lang } = {}) {
  const r = Math.min(Math.max(Number(radius) || 3000, 300), 20000);
  const key = `near:${lat.toFixed(2)},${lon.toFixed(2)}`;
  const res = await loadArea({ key, lat, lon, radius: r, foodRadius: Math.min(r, 3000), lang });
  savePlaces(key, res.places, res.fetchedAt);
  return res;
}

function getPlace(id) {
  const row = db.get().prepare('SELECT data, updated_at FROM places WHERE id = ?').get(id);
  if (!row) return null;
  return { ...JSON.parse(row.data), updatedAt: row.updated_at * 1000 };
}

/** Ricerca full-text veloce sui luoghi già indicizzati (in qualsiasi lingua presente nei nomi OSM). */
function searchIndexed(q, limit = 20) {
  const terms = String(q)
    .toLowerCase()
    .replace(/["'*^():]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .map((w) => `"${w}"*`)
    .join(' ');
  if (!terms) return [];
  const rows = db
    .get()
    .prepare(
      `SELECT p.data, p.updated_at FROM places_fts f JOIN places p ON p.id = f.id
       WHERE places_fts MATCH ? ORDER BY bm25(places_fts, 0, 10, 2, 1) - p.notability * 0.3 LIMIT ?`
    )
    .all(terms, limit);
  return rows.map((r) => ({ ...JSON.parse(r.data), updatedAt: r.updated_at * 1000 }));
}

module.exports = { loadCity, loadNearby, getPlace, searchIndexed, normalizeElement, radiusFor, admission, priceLevel };
