'use strict';
// Ricerca città in tutto il mondo e in qualsiasi lingua (OpenStreetMap Nominatim).
const config = require('../config');
const { request, cached } = require('../http');

const CITY_TYPES = new Set(['city', 'town', 'village', 'municipality', 'hamlet', 'suburb', 'administrative', 'borough', 'county', 'island', 'state']);

function normalize(r) {
  const a = r.address || {};
  const name = r.name || a.city || a.town || a.village || r.display_name.split(',')[0];
  const bb = r.boundingbox ? r.boundingbox.map(Number) : null; // [south, north, west, east]
  return {
    id: `${r.osm_type}/${r.osm_id}`,
    name,
    displayName: r.display_name,
    country: a.country || null,
    countryCode: a.country_code ? a.country_code.toUpperCase() : null,
    region: a.state || a.region || a.county || null,
    lat: Number(r.lat),
    lon: Number(r.lon),
    bbox: bb,
    type: r.addresstype || r.type,
  };
}

async function searchCities(q, lang = 'it') {
  const query = String(q || '').trim();
  if (query.length < 2) return { results: [], fetchedAt: Date.now() };
  const url =
    `${config.endpoints.nominatim}/search?format=jsonv2&addressdetails=1&limit=8&dedupe=1` +
    `&featureType=settlement&accept-language=${encodeURIComponent(lang)}&q=${encodeURIComponent(query)}` +
    (config.contactEmail ? `&email=${encodeURIComponent(config.contactEmail)}` : '');
  const key = `geo:${lang}:${query.toLowerCase()}`;
  const r = await cached(key, config.ttl.geocode, async () => {
    let data = await request(url, { source: 'OpenStreetMap Nominatim' });
    if (!data.length) {
      // Riprova senza filtro (isole, quartieri, località particolari).
      data = await request(url.replace('&featureType=settlement', ''), { source: 'OpenStreetMap Nominatim' });
    }
    return data.filter((x) => x.lat && x.lon).map(normalize);
  });
  const results = r.value
    .filter((c) => !c.type || CITY_TYPES.has(c.type) || r.value.length === 1)
    .concat(r.value.filter((c) => c.type && !CITY_TYPES.has(c.type)))
    .filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i);
  return { results, fetchedAt: r.fetchedAt };
}

async function reverse(lat, lon, lang = 'it') {
  const url =
    `${config.endpoints.nominatim}/reverse?format=jsonv2&addressdetails=1&zoom=10` +
    `&accept-language=${encodeURIComponent(lang)}&lat=${lat}&lon=${lon}`;
  const key = `rev:${lang}:${Number(lat).toFixed(3)},${Number(lon).toFixed(3)}`;
  const r = await cached(key, config.ttl.geocode, async () => normalize(await request(url, { source: 'OpenStreetMap Nominatim' })));
  return r.value;
}

/** Recupera i dati di una città dal suo id OSM ("relation/44915"). */
async function lookup(id, lang = 'it') {
  const m = /^(node|way|relation)\/(\d+)$/.exec(id);
  if (!m) throw Object.assign(new Error('Id città non valido'), { status: 400 });
  const osmIds = `${m[1][0].toUpperCase()}${m[2]}`;
  const url = `${config.endpoints.nominatim}/lookup?format=jsonv2&addressdetails=1&accept-language=${encodeURIComponent(lang)}&osm_ids=${osmIds}`;
  const r = await cached(`lookup:${lang}:${id}`, config.ttl.geocode, async () => {
    const data = await request(url, { source: 'OpenStreetMap Nominatim' });
    if (!data.length) throw Object.assign(new Error('Città non trovata'), { status: 404 });
    return normalize(data[0]);
  });
  return r.value;
}

module.exports = { searchCities, reverse, lookup };
