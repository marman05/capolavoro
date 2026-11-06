'use strict';
// Distanze e tempi di percorrenza reali (OSRM su OpenStreetMap) a piedi e in auto.
// Per i mezzi pubblici non esiste un servizio gratuito mondiale: si fornisce il link
// alla navigazione con mezzi pubblici e, se richiesto, una stima chiaramente etichettata.
const config = require('../config');
const { request, cached } = require('../http');
const { haversine, estimateMinutes } = require('../geo');

async function osrmRoute(base, from, to) {
  const coords = `${from.lon},${from.lat};${to.lon},${to.lat}`;
  const url = `${base}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`;
  const key = `route:${base}:${coords.replace(/(\d+\.\d{5})\d*/g, '$1')}`;
  const r = await cached(key, config.ttl.route, () => request(url, { source: 'OSRM', timeoutMs: 15000 }));
  const route = r.value.routes && r.value.routes[0];
  if (!route) return null;
  return { meters: Math.round(route.distance), minutes: Math.max(1, Math.round(route.duration / 60)), geometry: route.geometry };
}

function navigationLinks(from, to) {
  const dest = `${to.lat},${to.lon}`;
  const origin = from ? `${from.lat},${from.lon}` : '';
  const g = (mode) =>
    `https://www.google.com/maps/dir/?api=1&destination=${dest}${origin ? `&origin=${origin}` : ''}&travelmode=${mode}`;
  return {
    googleWalking: g('walking'),
    googleDriving: g('driving'),
    googleTransit: g('transit'),
    apple: `https://maps.apple.com/?daddr=${dest}${origin ? `&saddr=${origin}` : ''}`,
    osm: `https://www.openstreetmap.org/directions?route=${encodeURIComponent(`${origin};${dest}`)}`,
    geo: `geo:${dest}?q=${dest}`,
  };
}

async function directions(from, to) {
  const straight = Math.round(haversine(from.lat, from.lon, to.lat, to.lon));
  const [foot, car] = await Promise.all([
    osrmRoute(config.endpoints.osrmFoot, from, to).catch(() => null),
    osrmRoute(config.endpoints.osrmCar, from, to).catch(() => null),
  ]);
  return {
    straightMeters: straight,
    foot: foot ? { ...foot, verified: true, source: 'OSRM' } : { meters: null, minutes: estimateMinutes(straight, 'foot'), verified: false },
    car: car ? { ...car, verified: true, source: 'OSRM' } : { meters: null, minutes: estimateMinutes(straight, 'car'), verified: false },
    transit: { minutes: estimateMinutes(straight, 'transit'), verified: false, note: 'Stima: verifica orari reali con il link ai mezzi pubblici' },
    links: navigationLinks(from, to),
  };
}

module.exports = { directions, navigationLinks };
