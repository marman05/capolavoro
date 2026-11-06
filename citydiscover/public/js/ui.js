// Utilità di interfaccia: escaping, formattazione, componenti riutilizzabili.
export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const idToHash = (id) => String(id).replace('/', '-').replace(':', '~');
export const hashToId = (h) => String(h).replace('-', '/').replace('~', ':');

export let CATS = {};
export let EVCATS = {};
export function setCategories(c) { CATS = c.places; EVCATS = c.events; }
export const catIcon = (c) => (CATS[c] || {}).icon || '📍';
export const catLabel = (c) => (CATS[c] || {}).label || c;

export function distance(m) {
  if (m == null) return '';
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0).replace('.', ',')} km`;
}

export function minutes(min) {
  if (min == null) return 'n.d.';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function walkMinutes(m) {
  return m == null ? null : Math.max(1, Math.round(((m * 1.3) / 1000 / 4.5) * 60));
}

const rtf = new Intl.RelativeTimeFormat('it', { numeric: 'auto' });
export function ago(ts) {
  if (!ts) return 'n.d.';
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return 'adesso';
  if (diff < 3600) return rtf.format(-Math.round(diff / 60), 'minute');
  if (diff < 86400) return rtf.format(-Math.round(diff / 3600), 'hour');
  return rtf.format(-Math.round(diff / 86400), 'day');
}

export function updated(ts, stale) {
  if (!ts) return '';
  const d = new Date(ts);
  return `<span class="updated" title="${esc(d.toLocaleString('it-IT'))}">Ultimo aggiornamento: ${esc(d.toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))} (${ago(ts)})${stale ? ' · <b>fonte non raggiungibile, dati dell\'ultima copia salvata</b>' : ''}</span>`;
}

export function scoreBadge(rating, { large = false } = {}) {
  if (!rating || !rating.available) {
    const n = rating ? rating.count : 0;
    const title = n ? `${n} recensioni: ne servono almeno ${rating.minRequired || 3} per calcolare il voto` : 'Ancora nessuna recensione';
    return `<span class="score na${large ? ' score-lg' : ''}" title="${esc(title)}">Voto n.d.</span>`;
  }
  const s = rating.score;
  const cls = s >= 7.5 ? '' : s >= 6 ? ' mid' : ' lo';
  return `<span class="score${cls}${large ? ' score-lg' : ''}" title="Voto medio su ${rating.count} recensioni">${s.toFixed(1).replace('.', ',')}<small>/10</small></span>`;
}

export function reviewsCount(rating) {
  if (!rating || !rating.count) return 'Nessuna recensione';
  return `${rating.count} ${rating.count === 1 ? 'recensione' : 'recensioni'}`;
}

export const PRICE_LABELS = ['Gratuito', 'Economico', 'Medio', 'Costoso'];
export function priceTag(level) {
  return level == null ? '' : `<span class="tag">${level === 0 ? '🆓' : '€'.repeat(level)} ${PRICE_LABELS[level]}</span>`;
}

export function openTag(p) {
  if (p.openNow === true) return '<span class="tag open">Aperto ora</span>';
  if (p.openNow === false) return '<span class="tag closed">Chiuso ora</span>';
  return '';
}

export function photo(p, cls = '') {
  if (p.image) return `<img class="${cls}" src="${esc(p.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'ph',textContent:'${catIcon(p.category)}'}))">`;
  return `<div class="ph" aria-hidden="true">${catIcon(p.category)}</div>`;
}

export function placeCard(p, { rank } = {}) {
  return `<a class="card" href="#/place/${idToHash(p.id)}" data-id="${esc(p.id)}">
    <div class="card-media">${photo(p)}</div>
    ${scoreBadge(p.rating)}
    ${rank ? `<span class="rank">#${rank}</span>` : ''}
    <div class="card-body">
      <div class="card-title">${esc(p.name)}</div>
      <div class="card-meta"><span>${catIcon(p.category)} ${esc(catLabel(p.category))}</span>${p.distanceMeters != null ? `<span>📍 ${distance(p.distanceMeters)}</span>` : ''}</div>
      <div class="card-meta">${openTag(p)}${priceTag(p.priceLevel)}<span>${esc(reviewsCount(p.rating))}</span>${p.hidden ? '<span class="tag">💎 Nascosto</span>' : ''}</div>
    </div>
  </a>`;
}

export function placeRow(p) {
  return `<a class="list-item" href="#/place/${idToHash(p.id)}" data-id="${esc(p.id)}">
    <div class="thumb">${photo(p)}</div>
    <div>
      <div class="t">${esc(p.name)}</div>
      <div class="card-meta small"><span>${catIcon(p.category)} ${esc(catLabel(p.category))}</span>${p.distanceMeters != null ? `<span>${distance(p.distanceMeters)} · ~${minutes(walkMinutes(p.distanceMeters))} a piedi</span>` : ''}</div>
      <div class="card-meta small" style="margin-top:4px">${scoreBadge(p.rating)}<span>${esc(reviewsCount(p.rating))}</span>${openTag(p)}${priceTag(p.priceLevel)}</div>
    </div>
  </a>`;
}

const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const WEEKDAYS = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];

export function eventWhen(e) {
  const date = e.startLocal?.date || String(e.start).slice(0, 10);
  const time = e.timeTBA ? null : e.startLocal?.time || (String(e.start).length > 10 ? String(e.start).slice(11, 16) : null);
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  let endTxt = '';
  if (e.end) {
    const ed = new Date(e.end);
    if (!isNaN(ed)) {
      const sameDay = e.end.slice(0, 10) === date;
      endTxt = sameDay ? ` – ${ed.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: e.timezone || undefined })}` : ` → ${ed.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', timeZone: e.timezone || undefined })}`;
    }
  }
  return { day: d, month: MONTHS[m - 1], weekday: WEEKDAYS[dt.getUTCDay()], time, endTxt, date };
}

const AVAIL = {
  available: ['Biglietti disponibili', 'open'],
  not_on_sale: ['Vendita non attiva', 'warn'],
  postponed: ['Rinviato', 'closed'],
  rescheduled: ['Riprogrammato', 'warn'],
  predicted: ['Evento previsto (da confermare)', 'warn'],
  unknown: ['Disponibilità non verificata', ''],
};

export function priceText(p) {
  if (!p) return 'Prezzo non disponibile';
  if (p.free) return 'Gratuito';
  const c = p.currency === 'EUR' ? '€' : p.currency || '';
  if (p.min != null && p.max != null && p.min !== p.max) return `${p.min} – ${p.max} ${c}`;
  if (p.min != null) return `da ${p.min} ${c}`;
  return 'Prezzo non disponibile';
}

export function eventCard(e) {
  const w = eventWhen(e);
  const [availTxt, availCls] = AVAIL[e.availability] || AVAIL.unknown;
  const cat = EVCATS[e.category] || {};
  const share = encodeURIComponent(JSON.stringify({ t: e.title, u: e.ticketUrl || e.url || '' }));
  return `<article class="event" data-id="${esc(e.id)}">
    <div class="date-badge"><small>${w.weekday}</small><b>${w.day}</b><small>${w.month}</small></div>
    <div>
      <h3>${esc(e.title)}</h3>
      <div class="card-meta">
        <span>${cat.icon || '📅'} ${esc(cat.label || '')}</span>
        <span>🕒 ${w.time ? esc(w.time) + esc(w.endTxt) : 'Orario non comunicato'}</span>
        ${e.distanceMeters != null ? `<span>📍 ${distance(e.distanceMeters)}</span>` : ''}
      </div>
      <div class="card-meta">${e.venue?.name ? `<span>🏟️ ${esc(e.venue.name)}</span>` : ''}${e.venue?.address ? `<span>${esc(e.venue.address)}</span>` : ''}</div>
      <div class="card-meta" style="margin-top:6px">
        <span class="tag">🎟️ ${esc(priceText(e.price))}</span>
        <span class="tag ${availCls}">${esc(availTxt)}</span>
        ${scoreBadge(e.rating)}
        <span class="small muted">Fonte: ${esc(e.source)}${e.alsoOn ? ' + ' + esc(e.alsoOn.join(', ')) : ''}</span>
      </div>
    </div>
    <div class="event-side" style="display:grid;gap:8px;justify-items:end">
      ${e.image ? `<img class="event-img" src="${esc(e.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
      <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
        ${e.ticketUrl ? `<a class="btn btn-sm" href="${esc(e.ticketUrl)}" target="_blank" rel="noopener">Biglietti</a>` : ''}
        ${e.venue?.lat != null ? `<a class="btn btn-sm btn-ghost" href="https://www.google.com/maps/dir/?api=1&destination=${e.venue.lat},${e.venue.lon}" target="_blank" rel="noopener">Indicazioni</a>` : ''}
        <button class="btn btn-sm btn-ghost" data-share-event="${esc(share)}" type="button">Condividi</button>
        <button class="btn btn-sm btn-ghost" data-save-event="${esc(e.id)}" type="button" aria-label="Salva evento">♡</button>
      </div>
    </div>
  </article>`;
}

export function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), ms);
}

export function loader(text = 'Caricamento…') {
  return `<div class="loader"><div class="spinner"></div><div>${esc(text)}</div></div>`;
}

export function errorBox(err, retry) {
  return `<div class="empty"><p style="font-size:2rem;margin:0">⚠️</p><p><b>Impossibile caricare i dati.</b></p><p class="small">${esc(err.message || err)}</p>${retry ? '<button class="btn btn-ghost" data-retry type="button">Riprova</button>' : ''}</div>`;
}

export async function share({ title, text, url }) {
  if (navigator.share) {
    try { await navigator.share({ title, text, url }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast('Link copiato negli appunti');
  } catch {
    prompt('Copia il link', url);
  }
}

export function modal(html, cls = '') {
  const m = $('#modal');
  m.className = `modal ${cls}`;
  m.innerHTML = html;
  m.showModal();
  m.onclick = (e) => { if (e.target === m || e.target.closest('[data-close]')) m.close(); };
  return m;
}
