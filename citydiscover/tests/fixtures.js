'use strict';
/*
 * SOLO PER TEST. Sostituisce globalThis.fetch con risposte nel formato delle API reali
 * (Nominatim, Overpass, Wikidata, Wikipedia, Open-Meteo, OSRM, Ticketmaster) per verificare
 * l'intera catena senza rete. Non viene mai caricato dal server in produzione.
 */
const C = { lat: 43.7698, lon: 11.2556 }; // Firenze

const ELEMENTS = [
  { type: 'way', id: 1001, center: { lat: 43.7731, lon: 11.256 }, tags: { name: 'Cattedrale di Santa Maria del Fiore', amenity: 'place_of_worship', religion: 'christian', building: 'cathedral', wikidata: 'Q4176', wikipedia: 'it:Cattedrale di Santa Maria del Fiore', opening_hours: 'Mo-Sa 10:15-15:45', heritage: '2', website: 'https://duomo.firenze.it' } },
  { type: 'way', id: 1002, center: { lat: 43.7678, lon: 11.2553 }, tags: { name: 'Galleria degli Uffizi', tourism: 'museum', wikidata: 'Q51252', opening_hours: 'Tu-Su 08:15-18:30', charge: '25 EUR', fee: 'yes', 'addr:street': 'Piazzale degli Uffizi', 'addr:housenumber': '6', 'addr:city': 'Firenze', 'addr:postcode': '50122' } },
  { type: 'way', id: 1003, center: { lat: 43.768, lon: 11.2531 }, tags: { name: 'Ponte Vecchio', historic: 'bridge', tourism: 'attraction', wikidata: 'Q172993' } },
  { type: 'node', id: 1004, lat: 43.7629, lon: 11.265, tags: { name: 'Piazzale Michelangelo', tourism: 'viewpoint', wikidata: 'Q1365286', fee: 'no' } },
  { type: 'way', id: 1005, center: { lat: 43.7625, lon: 11.2484 }, tags: { name: 'Giardino di Boboli', leisure: 'garden', tourism: 'attraction', wikidata: 'Q1135427', opening_hours: 'Mo-Su 08:15-18:30', charge: '10 EUR' } },
  { type: 'way', id: 1006, center: { lat: 43.7696, lon: 11.2558 }, tags: { name: 'Piazza della Signoria', place: 'square', wikidata: 'Q1155364' } },
  { type: 'node', id: 1007, lat: 43.7593, lon: 11.2649, tags: { name: 'Basilica di San Miniato al Monte', amenity: 'place_of_worship', wikidata: 'Q1267587', opening_hours: 'Mo-Sa 09:30-13:00,15:00-19:00; Su 08:15-19:00' } },
  { type: 'node', id: 1008, lat: 43.7655, lon: 11.2591, tags: { name: 'Rampe del Poggi', historic: 'monument', heritage: '2' } },
  { type: 'node', id: 1009, lat: 43.7712, lon: 11.2534, tags: { name: 'Trattoria da Test', amenity: 'restaurant', cuisine: 'italian', opening_hours: 'Mo-Su 12:00-15:00,19:00-23:00' } },
  { type: 'node', id: 1010, lat: 43.7705, lon: 11.2575, tags: { name: 'Caffè Esempio', amenity: 'cafe', opening_hours: 'Mo-Su 07:00-20:00' } },
  { type: 'node', id: 1011, lat: 43.772, lon: 11.26, tags: { name: 'Club Notturno', amenity: 'nightclub', opening_hours: 'Fr-Sa 23:00-04:00' } },
  { type: 'node', id: 1012, lat: 43.7685, lon: 11.2578, tags: { name: 'Elemento senza categoria', shop: 'bakery' } },
];

const SITELINKS = { Q4176: 80, Q51252: 95, Q172993: 70, Q1365286: 25, Q1135427: 40, Q1155364: 45, Q1267587: 3 };

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

function localDate(offsetDays) {
  const d = new Date(Date.now() + 3600000 + offsetDays * 86400000);
  return d.toISOString().slice(0, 10);
}

function tmEvents() {
  const mk = (id, name, day, time, seg, genre, venue, lat, lon, price, status = 'onsale') => ({
    id, name, url: `https://www.ticketmaster.it/event/${id}`,
    dates: { start: { localDate: localDate(day), localTime: time, dateTime: `${localDate(day)}T${time}Z` }, timezone: 'Europe/Rome', status: { code: status } },
    classifications: [{ segment: { name: seg }, genre: { name: genre } }],
    priceRanges: price ? [{ min: price[0], max: price[1], currency: 'EUR' }] : undefined,
    images: [{ ratio: '16_9', width: 640, url: 'https://example.org/img.jpg' }],
    _embedded: { venues: [{ name: venue, address: { line1: 'Via di Prova 1' }, city: { name: 'Firenze' }, location: { latitude: String(lat), longitude: String(lon) } }] },
  });
  return [
    mk('E1', 'Concerto sinfonico di prova', 0, '21:00:00', 'Music', 'Classical', 'Teatro di prova', 43.776, 11.247, [20, 60]),
    mk('E2', 'Partita di calcio di prova', 1, '15:00:00', 'Sports', 'Soccer', 'Stadio di prova', 43.7808, 11.2823, [25, 90]),
    mk('E3', 'Spettacolo teatrale di prova', 0, '16:00:00', 'Arts & Theatre', 'Theatre', 'Teatro di prova 2', 43.7701, 11.2566, [15, 30]),
    mk('E4', 'Evento annullato', 2, '20:00:00', 'Music', 'Rock', 'Arena', 43.78, 11.25, null, 'cancelled'),
  ];
}

function install() {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    const u = new URL(String(url));
    calls.push(u.host + u.pathname);
    if (u.host === 'nominatim.openstreetmap.org') {
      const base = { osm_type: 'relation', osm_id: 42602, lat: String(C.lat), lon: String(C.lon), name: 'Firenze', display_name: 'Firenze, Toscana, Italia', addresstype: 'city', boundingbox: ['43.7258', '43.8329', '11.1498', '11.3385'], address: { city: 'Firenze', state: 'Toscana', country: 'Italia', country_code: 'it' } };
      if (u.pathname === '/reverse') return json(base);
      if (u.pathname === '/lookup') return json([base]);
      const q = (u.searchParams.get('q') || '').toLowerCase();
      return json(/firen|floren|флорен/.test(q) ? [base] : []);
    }
    if (u.pathname.includes('/api/interpreter')) {
      const body = decodeURIComponent(String(opts.body || '')).replace(/\+/g, ' ');
      const food = body.includes('restaurant|cafe');
      return json({ elements: ELEMENTS.filter((e) => (food ? /restaurant|cafe|bar|pub|nightclub/.test(e.tags.amenity || '') : !/restaurant|cafe|bar|pub|nightclub/.test(e.tags.amenity || ''))) });
    }
    if (u.host === 'www.wikidata.org') {
      const ids = u.searchParams.get('ids').split('|');
      const entities = {};
      for (const q of ids) {
        const n = SITELINKS[q] || 1;
        const sitelinks = {};
        for (let i = 0; i < n; i++) sitelinks[`l${i}wiki`] = { title: 'x' };
        sitelinks.itwiki = { title: `Voce ${q}` };
        entities[q] = {
          sitelinks,
          descriptions: { it: { value: `Descrizione Wikidata di ${q}` } },
          claims: q === 'Q1267587' ? {} : { P18: [{ rank: 'normal', mainsnak: { datavalue: { value: `Foto ${q}.jpg` } } }], ...(q === 'Q51252' ? { P1174: [{ rank: 'normal', mainsnak: { datavalue: { value: { amount: '+4000000' } } } }] } : {}) },
        };
      }
      return json({ entities });
    }
    if (u.host.endsWith('wikipedia.org')) {
      if (u.pathname.includes('/summary/')) return json({ title: 'Voce', extract: 'Estratto di prova da Wikipedia.', content_urls: { desktop: { page: 'https://it.wikipedia.org/wiki/Voce' } }, originalimage: { source: 'https://upload.wikimedia.org/x.jpg' } });
      return json({ items: [{ type: 'image', title: 'File:A.jpg', srcset: [{ src: '//upload.wikimedia.org/a.jpg' }] }, { type: 'image', title: 'File:B.svg', srcset: [{ src: '//upload.wikimedia.org/b.svg' }] }] });
    }
    if (u.host === 'api.open-meteo.com') {
      const days = Array.from({ length: 7 }, (_, i) => localDate(i));
      return json({
        timezone: 'Europe/Rome', utc_offset_seconds: 3600,
        current: { temperature_2m: 14.2, weather_code: 2, wind_speed_10m: 8 },
        daily: { time: days, weather_code: days.map(() => 1), temperature_2m_max: days.map(() => 17), temperature_2m_min: days.map(() => 8), precipitation_probability_max: days.map(() => 10), sunrise: days.map((d) => `${d}T07:01`), sunset: days.map((d) => `${d}T17:05`) },
        hourly: { time: days.flatMap((d) => Array.from({ length: 24 }, (_, h) => `${d}T${String(h).padStart(2, '0')}:00`)), temperature_2m: Array(168).fill(14), precipitation_probability: Array(168).fill(5), weather_code: Array(168).fill(1) },
      });
    }
    if (u.host === 'routing.openstreetmap.de') {
      return json({ code: 'Ok', routes: [{ distance: 1834, duration: u.pathname.includes('foot') ? 1320 : 420, geometry: { type: 'LineString', coordinates: [[11.25, 43.77], [11.256, 43.773]] } }] });
    }
    if (u.host === 'app.ticketmaster.com') {
      return json({ _embedded: { events: tmEvents() }, page: { totalPages: 1 } });
    }
    return json({ error: 'host non simulato: ' + u.host }, 404);
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

module.exports = { install, C, localDate };
