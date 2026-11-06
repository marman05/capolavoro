'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const oh = require('../server/opening-hours');
const { haversine, estimateMinutes } = require('../server/geo');
const { classify } = require('../server/categories');
const { admission, priceLevel, normalizeElement } = require('../server/providers/places');
const { normalizeTicketmaster, dedupe } = require('../server/providers/events');

const wall = (iso) => new Date(iso + 'Z'); // campi UTC = ora locale

test('opening_hours: casi comuni', () => {
  const v = 'Mo-Fr 09:00-18:00; Sa 10:00-13:00,15:00-19:00; Su off';
  assert.equal(oh.isOpenAt(v, wall('2026-11-02T10:00:00')), true); // lunedì
  assert.equal(oh.isOpenAt(v, wall('2026-11-02T18:00:00')), false);
  assert.equal(oh.isOpenAt(v, wall('2026-11-07T14:00:00')), false); // sabato pausa
  assert.equal(oh.isOpenAt(v, wall('2026-11-07T16:00:00')), true);
  assert.equal(oh.isOpenAt(v, wall('2026-11-08T12:00:00')), false); // domenica
  assert.equal(oh.isOpenAt('24/7', wall('2026-11-08T03:00:00')), true);
});

test('opening_hours: oltre mezzanotte, intervalli ciclici e formati ignoti', () => {
  assert.equal(oh.isOpenAt('Fr-Sa 23:00-04:00', wall('2026-11-07T02:00:00')), true); // sabato notte da venerdì
  assert.equal(oh.isOpenAt('Fr-Sa 23:00-04:00', wall('2026-11-09T02:00:00')), null); // lunedì: dom non indicato
  assert.equal(oh.isOpenAt('Sa-Mo 10:00-12:00', wall('2026-11-09T11:00:00')), true); // lunedì incluso
  assert.equal(oh.isOpenAt('Mo-Fr 09:00-18:00; PH off', wall('2026-11-02T10:00:00')), null); // non supportato → ignoto
  assert.equal(oh.isOpenAt('sunrise-sunset', wall('2026-11-02T10:00:00')), null);
  assert.equal(oh.isOpenAt('Tu-Su 09:00-17:00', wall('2026-11-03T10:00:00')), true);
  assert.equal(oh.isOpenAt('Tu-Su 09:00-17:00', wall('2026-11-02T10:00:00')), null); // lunedì non citato
  const table = oh.describe('Mo-Fr 09:00-18:00; Su off');
  assert.equal(table[0].hours, '09:00–18:00');
  assert.equal(table[5].hours, 'n.d.');
  assert.equal(table[6].hours, 'Chiuso');
});

test('distanze e stime', () => {
  const d = haversine(43.7731, 11.256, 43.7629, 11.265);
  assert.ok(d > 1300 && d < 1400, `distanza ${d}`);
  assert.ok(estimateMinutes(1000, 'foot') > estimateMinutes(1000, 'car'));
  assert.ok(estimateMinutes(100, 'transit') >= 8);
});

test('classificazione e prezzi da tag OSM', () => {
  assert.deepEqual(classify({ tourism: 'museum' }), ['museum', 'museum']);
  assert.equal(classify({ amenity: 'nightclub' })[0], 'nightlife');
  assert.equal(classify({ place: 'square' })[0], 'square');
  assert.equal(classify({ shop: 'bakery' }), null);
  assert.equal(priceLevel(admission({ fee: 'no' })), 0);
  assert.equal(priceLevel(admission({ charge: '5 EUR' })), 1);
  assert.equal(priceLevel(admission({ charge: '12,50 €' })), 2);
  assert.equal(priceLevel(admission({ charge: '25 EUR' })), 3);
  assert.equal(priceLevel(admission({ fee: 'yes' })), null);
  assert.equal(priceLevel(admission({})), null);
  assert.equal(normalizeElement({ type: 'node', id: 1, lat: 1, lon: 1, tags: { tourism: 'museum' } }), null); // senza nome
});

test('eventi: normalizzazione Ticketmaster e deduplicazione', () => {
  const e = normalizeTicketmaster({
    id: 'X', name: 'Techno Night', url: 'https://t/x',
    dates: { start: { localDate: '2026-11-07', localTime: '23:00:00' }, status: { code: 'onsale' } },
    classifications: [{ segment: { name: 'Music' }, genre: { name: 'Dance/Electronic' } }],
    priceRanges: [{ min: 15, max: 30, currency: 'EUR' }],
    _embedded: { venues: [{ name: 'Club', location: { latitude: '43.77', longitude: '11.25' } }] },
  });
  assert.equal(e.category, 'nightlife');
  assert.equal(e.availability, 'available');
  assert.equal(e.price.min, 15);
  const b = { ...e, id: 'phq:1', source: 'PredictHQ', price: null, ticketUrl: null };
  const out = dedupe([e, b]);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].alsoOn, ['PredictHQ']);
});
