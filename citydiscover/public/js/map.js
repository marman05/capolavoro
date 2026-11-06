// Mappa interattiva (Leaflet + tile OpenStreetMap).
import { esc, catIcon, catLabel, distance, minutes, walkMinutes, idToHash, scoreBadge, EVCATS } from './ui.js';

const L = window.L;

export function createMap(el, { lat, lon, zoom = 14 } = {}) {
  const map = L.map(el, { zoomControl: true, scrollWheelZoom: true }).setView([lat ?? 45.46, lon ?? 9.19], zoom);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    subdomains: 'abc',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  const layer = L.layerGroup().addTo(map);
  const ctl = { map, layer, markers: new Map(), meMarker: null, removed: false };
  map.on('unload', () => { ctl.removed = true; });
  setTimeout(() => { if (!ctl.removed) map.invalidateSize(); }, 50);
  return ctl;
}

function pinIcon(emoji, cls = '') {
  return L.divIcon({ className: '', html: `<div class="pin ${cls}"><span>${emoji}</span></div>`, iconSize: [34, 34], iconAnchor: [17, 34], popupAnchor: [0, -30] });
}

function navLink(lat, lon, mode = 'walking') {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=${mode}`;
}

export function placePopup(p) {
  const walk = p.distanceMeters != null ? `${distance(p.distanceMeters)} · ~${minutes(walkMinutes(p.distanceMeters))} a piedi (stima)` : '';
  return `<div class="popup-title">${esc(p.name)}</div>
    <div class="small muted">${catIcon(p.category)} ${esc(catLabel(p.category))}</div>
    <div style="margin:6px 0">${scoreBadge(p.rating)}</div>
    ${walk ? `<div class="small">${walk}</div>` : ''}
    <div class="popup-actions"><a href="#/place/${idToHash(p.id)}">Apri scheda</a> · <a href="${navLink(p.lat, p.lon)}" target="_blank" rel="noopener">Naviga</a></div>`;
}

export function showPlaces(ctl, places, { fit = true, onSelect } = {}) {
  ctl.layer.clearLayers();
  ctl.markers.clear();
  const pts = [];
  for (const p of places) {
    const m = L.marker([p.lat, p.lon], { icon: pinIcon(catIcon(p.category)), title: p.name, riseOnHover: true }).bindPopup(placePopup(p));
    if (onSelect) m.on('click', () => onSelect(p));
    m.addTo(ctl.layer);
    ctl.markers.set(p.id, m);
    pts.push([p.lat, p.lon]);
  }
  if (fit && pts.length) ctl.map.fitBounds(L.latLngBounds(pts).pad(0.08), { maxZoom: 16, animate: false });
}

export function showEvents(ctl, events) {
  for (const e of events) {
    if (e.venue?.lat == null) continue;
    const cat = EVCATS[e.category] || {};
    L.marker([e.venue.lat, e.venue.lon], { icon: pinIcon(cat.icon || '📅', 'ev'), title: e.title })
      .bindPopup(
        `<div class="popup-title">${esc(e.title)}</div><div class="small muted">${esc(cat.label || 'Evento')} · ${esc(e.startLocal?.date || '')} ${esc(e.startLocal?.time || '')}</div>
         ${e.venue.name ? `<div class="small">${esc(e.venue.name)}</div>` : ''}
         <div class="popup-actions">${e.ticketUrl ? `<a href="${esc(e.ticketUrl)}" target="_blank" rel="noopener">Biglietti</a> · ` : ''}<a href="${navLink(e.venue.lat, e.venue.lon)}" target="_blank" rel="noopener">Naviga</a></div>`
      )
      .addTo(ctl.layer);
  }
}

export function showMe(ctl, pos) {
  if (!pos) return;
  if (ctl.meMarker) ctl.meMarker.remove();
  ctl.meMarker = L.marker([pos.lat, pos.lon], {
    icon: L.divIcon({ className: '', html: '<div class="me-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
    zIndexOffset: 1000,
    title: 'La tua posizione',
  }).addTo(ctl.map);
  if (pos.accuracy) L.circle([pos.lat, pos.lon], { radius: pos.accuracy, color: '#2563eb', weight: 1, fillOpacity: 0.06 }).addTo(ctl.layer);
}

export function highlight(ctl, id) {
  const m = ctl.markers.get(id);
  if (m) {
    ctl.map.panTo(m.getLatLng());
    m.openPopup();
  }
}

export function showRoute(ctl, start, steps) {
  ctl.layer.clearLayers();
  const pts = [[start.lat, start.lon]];
  L.marker([start.lat, start.lon], { icon: L.divIcon({ className: '', html: '<div class="step-pin">▶</div>', iconSize: [30, 30], iconAnchor: [15, 15] }), title: 'Partenza' }).addTo(ctl.layer);
  steps.forEach((s, i) => {
    pts.push([s.lat, s.lon]);
    L.marker([s.lat, s.lon], { icon: L.divIcon({ className: '', html: `<div class="step-pin">${i + 1}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] }), title: s.name })
      .bindPopup(`<div class="popup-title">${i + 1}. ${esc(s.name)}</div><div class="small">${esc(s.start)} – ${esc(s.end)}</div>`)
      .addTo(ctl.layer);
  });
  L.polyline(pts, { color: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#0f766e', weight: 4, opacity: 0.8, dashArray: '6 8' }).addTo(ctl.layer);
  ctl.map.fitBounds(L.latLngBounds(pts).pad(0.12), { animate: false });
}

export function geoRoute(ctl, geometry) {
  if (!geometry) return;
  const line = L.geoJSON(geometry, { style: { color: '#2563eb', weight: 5, opacity: 0.8 } }).addTo(ctl.layer);
  ctl.map.fitBounds(line.getBounds().pad(0.15), { animate: false });
}
