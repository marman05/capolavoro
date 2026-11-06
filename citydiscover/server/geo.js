'use strict';

const R = 6371008.8; // raggio medio terrestre in metri
const rad = (d) => (d * Math.PI) / 180;

/** Distanza in linea d'aria (metri). */
function haversine(lat1, lon1, lat2, lon2) {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Stime usate solo quando il servizio di routing non è disponibile o per l'ottimizzazione
// dell'itinerario. Vengono sempre etichettate come "stima" nell'interfaccia.
const SPEED_KMH = { foot: 4.5, car: 25, transit: 16 };
const DETOUR = { foot: 1.3, car: 1.45, transit: 1.4 };
const TRANSIT_OVERHEAD_MIN = 8; // attesa media + accesso alla fermata

function estimateMinutes(meters, mode) {
  const km = (meters * (DETOUR[mode] || 1.3)) / 1000;
  const min = (km / (SPEED_KMH[mode] || 4.5)) * 60;
  return Math.max(1, Math.round(mode === 'transit' ? min + TRANSIT_OVERHEAD_MIN : min));
}

function bboxAround(lat, lon, radiusM) {
  const dLat = radiusM / 111320;
  const dLon = radiusM / (111320 * Math.cos(rad(lat)));
  return [lat - dLat, lat + dLat, lon - dLon, lon + dLon];
}

module.exports = { haversine, estimateMinutes, bboxAround, SPEED_KMH };
