// CityDiscover — applicazione client (SPA con routing su hash).
import { api, session, prefs, store } from './api.js';
import {
  esc, $, $$, idToHash, hashToId, setCategories, CATS, EVCATS, catIcon, catLabel, distance, minutes, walkMinutes,
  updated, scoreBadge, reviewsCount, priceTag, openTag, placeCard, placeRow, eventCard, toast, loader, errorBox,
  share, modal, PRICE_LABELS, eventWhen,
} from './ui.js';
import { createMap, showPlaces, showEvents, showMe, highlight, showRoute, geoRoute } from './map.js';

const app = $('#app');
const state = {
  position: store.get('cd.pos'),
  favorites: new Set(),
  cityCache: new Map(),
  maps: [],
};

// ---------------- Posizione ----------------
function locate({ quiet = false } = {}) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      if (!quiet) toast('Geolocalizzazione non supportata dal browser');
      return resolve(null);
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        state.position = { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: Math.round(p.coords.accuracy), at: Date.now() };
        store.set('cd.pos', state.position);
        resolve(state.position);
      },
      (e) => {
        if (!quiet) toast(e.code === 1 ? 'Permesso di posizione negato' : 'Posizione non disponibile');
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 120000 }
    );
  });
}
const pos = () => (state.position && Date.now() - state.position.at < 3600000 ? state.position : null);
const posParams = () => (pos() ? { lat: pos().lat, lon: pos().lon } : {});

// ---------------- Preferiti ----------------
async function loadFavorites() {
  state.favorites.clear();
  if (!session.token) return;
  try {
    const { lists } = await api('/lists');
    const fav = lists.find((l) => l.isFavorites);
    for (const i of fav?.items || []) state.favorites.add(i.itemId);
  } catch { /* non autenticato */ }
}

async function toggleFavorite(item, type = 'place') {
  if (!session.token) {
    toast('Accedi per salvare i preferiti');
    location.hash = '#/account';
    return false;
  }
  const id = item.id;
  if (state.favorites.has(id)) {
    await api('/lists/favorites/items', { method: 'DELETE', params: { itemId: id } });
    state.favorites.delete(id);
    toast('Rimosso dai preferiti');
  } else {
    await api('/lists/favorites/items', {
      method: 'POST',
      body: { itemId: id, itemType: type, snapshot: { name: item.name || item.title, category: item.category, lat: item.lat ?? item.venue?.lat, lon: item.lon ?? item.venue?.lon, image: item.image, date: item.startLocal?.date } },
    });
    state.favorites.add(id);
    toast('Salvato nei preferiti ❤️');
  }
  return state.favorites.has(id);
}

// ---------------- Router ----------------
function parseHash() {
  const h = location.hash.replace(/^#/, '') || '/';
  const [path, query] = h.split('?');
  const parts = path.split('/').filter(Boolean);
  return { parts, query: Object.fromEntries(new URLSearchParams(query || '')) };
}

function setHashQuery(query) {
  const { parts } = parseHash();
  const q = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== '' && v != null && v !== false)).toString();
  history.replaceState(null, '', `#/${parts.join('/')}${q ? '?' + q : ''}`);
}

function cleanupMaps() {
  for (const m of state.maps) {
    m.removed = true;
    m.map.stop();
    m.map.remove();
  }
  state.maps = [];
}

async function route() {
  cleanupMaps();
  const { parts, query } = parseHash();
  const [view, a, b] = parts;
  $$('[data-nav]').forEach((el) => el.classList.toggle('active', el.dataset.nav === (view || 'home')));
  updateAccountBtn();
  window.scrollTo(0, 0);
  try {
    if (!view) return home();
    if (view === 'city') return city(hashToId(a), b || 'overview', query);
    if (view === 'place') return place(hashToId(a));
    if (view === 'nearby') return nearby(query);
    if (view === 'saved') return saved();
    if (view === 'account') return account();
    if (view === 'shared') return sharedList(a);
    app.innerHTML = `<div class="wrap empty"><h2>Pagina non trovata</h2><a class="btn" href="#/">Torna alla home</a></div>`;
  } catch (e) {
    app.innerHTML = `<div class="wrap">${errorBox(e)}</div>`;
  }
}

function updateAccountBtn() {
  const btn = $('#accountBtn');
  btn.textContent = session.user ? session.user.name.split(' ')[0] : 'Accedi';
}

// ---------------- Home ----------------
function home() {
  document.title = 'CityDiscover — Scopri ogni città';
  const recent = prefs.recent;
  app.innerHTML = `
    <section class="hero">
      <h1>Quale città vuoi scoprire?</h1>
      <p class="lead">Luoghi da vedere, eventi, ristoranti e posti nascosti in ogni città del mondo. Con mappa, distanze reali e voti da recensioni vere.</p>
      <form class="search" role="search" id="citySearch" autocomplete="off">
        <div class="search-box">
          <span aria-hidden="true">🔎</span>
          <input id="cityInput" type="search" placeholder="Quale città vuoi scoprire?" aria-label="Quale città vuoi scoprire?" aria-autocomplete="list" aria-controls="sugg" autofocus>
          <button class="btn" type="submit">Scopri<span>&nbsp;→</span></button>
        </div>
        <ul class="suggestions" id="sugg" role="listbox" hidden></ul>
      </form>
      <div class="hero-actions">
        <button class="btn btn-ghost" id="useLoc" type="button">📍 Usa la mia posizione</button>
        <a class="btn btn-ghost" href="#/nearby">I migliori posti vicino a te</a>
      </div>
      ${recent.length ? `<div class="recent"><span class="muted small" style="align-self:center">Recenti:</span>${recent.map((c) => `<a class="chip" href="#/city/${idToHash(c.id)}">${esc(c.name)}${c.country ? ` <span class="n">${esc(c.country)}</span>` : ''}</a>`).join('')}</div>` : ''}
    </section>
    <div class="wrap">
      <div class="features">
        <div class="feature">🗺️<b>Mappa interattiva</b><p>Tutti i luoghi intorno a te, con distanze, tempi di percorrenza e navigazione.</p></div>
        <div class="feature">🎟️<b>Eventi aggiornati</b><p>Concerti, festival, sport, mostre e sagre da fonti ufficiali, con data di aggiornamento.</p></div>
        <div class="feature">⭐<b>Voti onesti da 1 a 10</b><p>Calcolati solo da recensioni reali. Se non ci sono abbastanza dati, lo diciamo.</p></div>
        <div class="feature">🧭<b>Itinerari su misura</b><p>Dicci quanto tempo hai: organizziamo la giornata tra orari, distanze, eventi e meteo.</p></div>
      </div>
    </div>`;
  const input = $('#cityInput');
  const list = $('#sugg');
  let timer;
  let results = [];
  let active = -1;
  const render = () => {
    if (!results.length) { list.hidden = true; return; }
    list.hidden = false;
    list.innerHTML = results
      .map((c, i) => `<li role="option"><button type="button" data-i="${i}" class="${i === active ? 'active' : ''}"><span style="font-size:1.3rem">🏙️</span><span><b>${esc(c.name)}</b><small>${esc([c.region, c.country].filter(Boolean).join(', ') || c.displayName)}</small></span></button></li>`)
      .join('');
  };
  const go = (c) => {
    state.cityCache.set(c.id, { city: c });
    location.hash = `#/city/${idToHash(c.id)}`;
  };
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) { results = []; render(); return; }
    timer = setTimeout(async () => {
      try {
        const r = await api('/cities/search', { params: { q, lang: prefs.lang } });
        if (input.value.trim() !== q) return;
        results = r.results;
        active = -1;
        if (!results.length) {
          list.hidden = false;
          list.innerHTML = '<li class="muted small" style="padding:10px 14px">Nessuna città trovata. Prova con un altro nome o lingua.</li>';
        } else render();
      } catch (e) {
        list.hidden = false;
        list.innerHTML = `<li class="small" style="padding:10px 14px">⚠️ ${esc(e.message)}</li>`;
      }
    }, 300);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { active = Math.min(results.length - 1, active + 1); render(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { active = Math.max(0, active - 1); render(); e.preventDefault(); }
    if (e.key === 'Escape') { results = []; render(); }
  });
  list.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-i]');
    if (b) go(results[Number(b.dataset.i)]);
  });
  $('#citySearch').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (results.length) return go(results[Math.max(0, active)]);
    const q = input.value.trim();
    if (!q) return;
    try {
      const r = await api('/cities/search', { params: { q, lang: prefs.lang } });
      if (r.results.length) go(r.results[0]);
      else toast('Nessuna città trovata');
    } catch (err) { toast(err.message); }
  });
  $('#useLoc').addEventListener('click', async () => {
    const p = await locate();
    if (!p) return;
    try {
      const c = await api('/cities/reverse', { params: { lat: p.lat, lon: p.lon, lang: prefs.lang } });
      go(c);
    } catch (e) { toast(e.message); }
  });
}

// ---------------- Città ----------------
const TABS = [
  ['overview', 'Panoramica'],
  ['places', 'Luoghi'],
  ['map', 'Mappa'],
  ['events', 'Eventi'],
  ['plan', 'Organizza la giornata'],
];

function cityShell(c, tab, heroImg, weather) {
  const w = weather?.current;
  return `
    <section class="city-hero" style="${heroImg ? `background-image:url('${esc(heroImg.url)}')` : ''}">
      ${heroImg ? `<span class="photo-credit">Foto: ${esc(heroImg.name)} · Wikimedia Commons</span>` : ''}
      <div class="wrap">
        <div>
          <div class="sub">${esc([c.region, c.country].filter(Boolean).join(' · '))}</div>
          <h1>${esc(c.name)}</h1>
        </div>
        ${w ? `<div class="weather-pill" title="Meteo Open-Meteo">${w.icon}<div><b>${Math.round(w.temperature)}°</b><div class="small">${esc(w.text)}</div></div></div>` : ''}
      </div>
    </section>
    <nav class="tabs" aria-label="Sezioni città"><div class="wrap">
      ${TABS.map(([k, l]) => `<a href="#/city/${idToHash(c.id)}/${k}" class="${k === tab ? 'active' : ''}">${l}</a>`).join('')}
    </div></nav>
    <div id="cityBody"></div>`;
}

async function city(id, tab, query) {
  const cached = state.cityCache.get(id);
  app.innerHTML = cached?.city ? cityShell(cached.city, tab, cached.hero, cached.weather) + '' : loader('Sto preparando la guida della città…');
  if (cached?.city) $('#cityBody').innerHTML = loader('Sto raccogliendo luoghi, eventi e meteo…');
  let data = cached?.highlights;
  try {
    if (!data || Date.now() - cached.at > 10 * 60000 || cached.posKey !== JSON.stringify(posParams())) {
      data = await api('/city/highlights', { params: { id, lang: prefs.lang, ...posParams() } });
      const heroP = [...data.top, ...data.todo].find((p) => p.image);
      state.cityCache.set(id, {
        city: data.city, highlights: data, weather: data.weather, at: Date.now(), posKey: JSON.stringify(posParams()),
        hero: heroP ? { url: heroP.image.replace(/width=\d+/, 'width=1600'), name: heroP.name } : null,
      });
    }
  } catch (e) {
    app.innerHTML = `<div class="wrap">${errorBox(e, true)}</div>`;
    $('[data-retry]')?.addEventListener('click', route);
    return;
  }
  prefs.addRecent(data.city);
  document.title = `${data.city.name} — CityDiscover`;
  const c = state.cityCache.get(id);
  app.innerHTML = cityShell(data.city, tab, c.hero, data.weather);
  const body = $('#cityBody');
  if (tab === 'overview') return cityOverview(body, data);
  if (tab === 'places') return explore(body, { cityId: id, city: data.city, query });
  if (tab === 'map') return cityMap(body, data, query);
  if (tab === 'events') return eventsView(body, { cityId: id, city: data.city, query });
  if (tab === 'plan') return planner(body, data, query);
}

function rail(items, render) {
  return `<div class="rail">${items.map(render).join('')}</div>`;
}

function cityOverview(body, d) {
  const cid = idToHash(d.city.id);
  const evSrcOk = (d.eventSources || []).some((s) => s.status === 'ok');
  const evNote = evSrcOk
    ? ''
    : `<div class="notice">ℹ️ Nessuna fonte eventi è attiva su questo server (configura TICKETMASTER_API_KEY o PREDICTHQ_TOKEN). Non mostriamo eventi inventati.</div>`;
  const catChips = Object.entries(d.counts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `<a class="chip" href="#/city/${cid}/places?category=${k}">${catIcon(k)} ${esc(catLabel(k))} <span class="n">${n}</span></a>`)
    .join('');
  const wx = d.weather?.daily?.slice(0, 5) || [];
  body.innerHTML = `<div class="wrap">
    <div class="section"><div class="chips scroll">${catChips}</div>
      <p style="margin-top:10px">${updated(d.fetchedAt, d.stale)}</p></div>
    ${wx.length ? `<div class="section"><div class="section-head"><h2>Meteo dei prossimi giorni</h2><span class="small muted">Open-Meteo · ${esc(d.timezone || '')}</span></div>
      <div class="chips scroll">${wx.map((w) => `<span class="chip" title="${esc(w.text)}">${new Date(w.date).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric' })} ${w.icon} ${Math.round(w.max)}° / ${Math.round(w.min)}° · 💧${w.rainProbability ?? '–'}%</span>`).join('')}</div></div>` : ''}

    <div class="section"><div class="section-head"><h2>Cosa fare oggi</h2><a class="more" href="#/city/${cid}/plan">Organizza la giornata →</a></div>
      ${d.todo.length ? rail(d.todo, (p) => placeCard(p)) : '<p class="muted">Nessun suggerimento disponibile.</p>'}</div>

    <div class="section"><div class="section-head"><h2>Eventi oggi</h2><a class="more" href="#/city/${cid}/events?when=today">Tutti →</a></div>
      ${evNote || (d.eventsToday.length ? d.eventsToday.slice(0, 4).map(eventCard).join('') : '<p class="muted">Nessun evento trovato per oggi nelle fonti consultate.</p>')}</div>

    <div class="section"><div class="section-head"><h2>Classifica delle migliori attrazioni</h2><a class="more" href="#/city/${cid}/places?sort=rating&category=sights">Classifica completa →</a></div>
      <p class="small muted" style="margin-top:-6px">Ordinata per voto degli utenti; a parità o senza voto, per popolarità (pagine Wikipedia, visitatori annui, salvataggi).</p>
      ${rail(d.top.slice(0, 12), (p, i) => placeCard(p, { rank: i + 1 }))}</div>

    <div class="section"><div class="section-head"><h2>I migliori posti vicino a te</h2>${pos() ? `<a class="more" href="#/city/${cid}/places?sort=distance">Vedi tutti →</a>` : ''}</div>
      ${pos() ? rail(d.nearYou, (p) => placeCard(p)) : '<div class="notice info">📍 Attiva la posizione per vedere distanze e luoghi vicini. <button class="btn btn-sm" id="locBtn" type="button" style="margin-left:auto">Attiva</button></div>'}</div>

    <div class="section"><div class="section-head"><h2>Eventi questo weekend</h2><a class="more" href="#/city/${cid}/events?when=weekend">Tutti →</a></div>
      ${evNote || (d.eventsWeekend.length ? d.eventsWeekend.slice(0, 6).map(eventCard).join('') : '<p class="muted">Nessun evento trovato per il weekend nelle fonti consultate.</p>')}
      ${d.eventsFetchedAt ? `<p>${updated(d.eventsFetchedAt)}</p>` : ''}</div>

    <div class="section"><div class="section-head"><h2>Posti nascosti da scoprire</h2><a class="more" href="#/city/${cid}/places?hidden=1">Tutti →</a></div>
      <p class="small muted" style="margin-top:-6px">Luoghi di interesse (storico, panoramico o apprezzati dagli utenti) ma poco noti a livello internazionale.</p>
      ${d.hidden.length ? rail(d.hidden, (p) => placeCard(p)) : '<p class="muted">Nessun luogo nascosto individuato.</p>'}</div>
  </div>`;
  $('#locBtn')?.addEventListener('click', async () => { if (await locate()) route(); });
  bindEventActions(body);
}

function bindEventActions(root) {
  root.addEventListener('click', async (e) => {
    const s = e.target.closest('[data-share-event]');
    if (s) {
      const d = JSON.parse(decodeURIComponent(s.dataset.shareEvent));
      share({ title: d.t, text: `${d.t} — su CityDiscover`, url: d.u || location.href });
    }
    const f = e.target.closest('[data-save-event]');
    if (f) {
      const ev = (root._events || []).find((x) => x.id === f.dataset.saveEvent) || { id: f.dataset.saveEvent, title: f.closest('.event').querySelector('h3').textContent };
      try { const on = await toggleFavorite(ev, 'event'); f.textContent = on ? '♥' : '♡'; } catch (err) { toast(err.message); }
    }
  });
}

// ---------------- Esplora (lista + mappa + filtri) ----------------
function filtersHtml(q, counts, { nearbyMode = false } = {}) {
  const groups = [['', 'Tutto'], ['sights', '🏛️ Da vedere'], ['nature', '🌳 Natura'], ['activities', '🎭 Attività'], ['food', '🍝 Mangiare e bere']];
  const cats = Object.keys(CATS).filter((k) => !counts || counts[k]);
  return `<div class="filters">
    <div class="chips scroll">${groups.map(([k, l]) => `<button class="chip" type="button" data-f="category" data-v="${k}" aria-pressed="${(q.category || '') === k}">${l}</button>`).join('')}</div>
    <div class="chips scroll">${cats.map((k) => `<button class="chip" type="button" data-f="category" data-v="${k}" aria-pressed="${q.category === k}">${catIcon(k)} ${esc(catLabel(k))}${counts ? ` <span class="n">${counts[k]}</span>` : ''}</button>`).join('')}</div>
    <div class="row">
      <select class="select" data-f="radiusKm" aria-label="Distanza">
        <option value="">${nearbyMode ? 'Entro 3 km' : 'Qualsiasi distanza'}</option>
        ${[1, 5, 10, 20, 50, 100].map((k) => `<option value="${k}" ${String(q.radiusKm) === String(k) ? 'selected' : ''}>Entro ${k} km</option>`).join('')}
      </select>
      <select class="select" data-f="minScore" aria-label="Voto minimo">
        <option value="">Qualsiasi voto</option>
        ${[6, 7, 8, 9, 10].map((k) => `<option value="${k}" ${String(q.minScore) === String(k) ? 'selected' : ''}>Voto ${k}+</option>`).join('')}
      </select>
      <select class="select" data-f="price" aria-label="Prezzo">
        <option value="">Qualsiasi prezzo</option>
        ${['free', 'cheap', 'medium', 'expensive'].map((k, i) => `<option value="${k}" ${q.price === k ? 'selected' : ''}>${PRICE_LABELS[i]}</option>`).join('')}
      </select>
      <select class="select" data-f="sort" aria-label="Ordina">
        ${[['popular', 'Più popolari'], ['rating', 'Voto più alto'], ['distance', 'Più vicini'], ['hidden', 'Meno conosciuti'], ['name', 'Nome A–Z']].map(([k, l]) => `<option value="${k}" ${(q.sort || (nearbyMode ? 'distance' : 'popular')) === k ? 'selected' : ''}>${l}</option>`).join('')}
      </select>
    </div>
    <div class="row">
      <label class="toggle"><input type="checkbox" data-f="openNow" ${q.openNow === '1' ? 'checked' : ''}> Aperto ora</label>
      <label class="toggle"><input type="checkbox" data-f="hidden" ${q.hidden === '1' ? 'checked' : ''}> 💎 Posti nascosti</label>
      <label class="toggle"><input type="checkbox" data-f="withPhoto" ${q.withPhoto === '1' ? 'checked' : ''}> Con foto</label>
    </div>
  </div>`;
}

function bindFilters(root, q, onChange) {
  root.querySelectorAll('[data-f]').forEach((el) => {
    const f = el.dataset.f;
    const handler = () => {
      if (el.tagName === 'BUTTON') q[f] = el.dataset.v;
      else if (el.type === 'checkbox') q[f] = el.checked ? '1' : '';
      else q[f] = el.value;
      onChange(q);
    };
    el.addEventListener(el.tagName === 'BUTTON' ? 'click' : 'change', handler);
  });
}

async function explore(body, { cityId, city: c, query, nearbyMode = false }) {
  const q = { ...query };
  body.innerHTML = `<div class="wrap"><div class="explore" id="explore">
      <div class="explore-list"><div id="filters"></div><div id="resultsHead" class="small muted" style="margin:4px 0 10px"></div><div id="results">${loader()}</div></div>
      <div class="explore-map"><div class="map" id="exploreMap"></div>
        <button class="btn btn-ghost locate-btn" id="locate" type="button" style="background:var(--surface)">📍 La mia posizione</button></div>
    </div>
    <button class="btn mobile-map-toggle" id="mapToggle" type="button">🗺️ Mappa</button></div>`;
  const ctl = createMap($('#exploreMap'), { lat: c?.lat ?? pos()?.lat, lon: c?.lon ?? pos()?.lon });
  state.maps.push(ctl);
  showMe(ctl, pos());
  $('#mapToggle').addEventListener('click', () => {
    const ex = $('#explore');
    ex.classList.toggle('show-map');
    $('#mapToggle').textContent = ex.classList.contains('show-map') ? '☰ Lista' : '🗺️ Mappa';
    setTimeout(() => { if (!ctl.removed) ctl.map.invalidateSize(); }, 50);
  });
  $('#locate').addEventListener('click', async () => {
    if (await locate()) { showMe(ctl, pos()); load(); }
  });
  let counts = null;
  async function load() {
    $('#results').innerHTML = loader('Cerco i luoghi…');
    try {
      const params = { ...q, lang: prefs.lang, ...posParams() };
      const r = nearbyMode ? await api('/nearby', { params: { ...params, radiusKm: q.radiusKm || 3 } }) : await api('/city/places', { params: { ...params, id: cityId } });
      if (ctl.removed) return;
      if (!counts && r.counts) counts = r.counts;
      $('#filters').innerHTML = filtersHtml(q, counts, { nearbyMode });
      bindFilters($('#filters'), q, (nq) => { setHashQuery(nq); load(); });
      const from = nearbyMode || r.distanceFrom === 'user' ? 'dalla tua posizione' : 'dal centro città';
      $('#resultsHead').innerHTML = `${r.total} risultati · distanze ${from}<br>${updated(r.fetchedAt, r.stale)}`;
      $('#results').innerHTML = r.places.length ? r.places.slice(0, 150).map(placeRow).join('') : '<div class="empty">Nessun luogo corrisponde ai filtri.</div>';
      showPlaces(ctl, r.places.slice(0, 400), { onSelect: (p) => {
        $$('.list-item.hl').forEach((x) => x.classList.remove('hl'));
        const row = $(`.list-item[data-id="${CSS.escape(p.id)}"]`);
        if (row) { row.classList.add('hl'); row.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
      } });
      showMe(ctl, pos());
      $$('#results .list-item').forEach((row) => row.addEventListener('mouseenter', () => highlight(ctl, row.dataset.id)));
    } catch (e) {
      $('#results').innerHTML = errorBox(e, true);
      $('[data-retry]')?.addEventListener('click', load);
    }
  }
  load();
}

async function cityMap(body, d, query) {
  const cid = d.city.id;
  const q = { ...query };
  body.innerHTML = `<div class="wrap section"><div style="position:relative">
      <div class="map map-big" id="bigMap"></div>
      <div class="map-chips"><div class="chips scroll" id="mapChips"></div></div>
      <button class="btn btn-ghost locate-btn" id="locate" type="button" style="background:var(--surface)">📍 La mia posizione</button>
    </div><p class="small muted" id="mapInfo"></p></div>`;
  const ctl = createMap($('#bigMap'), { lat: d.city.lat, lon: d.city.lon, zoom: 13 });
  state.maps.push(ctl);
  const chips = [['', 'Tutto'], ['sights', '🏛️ Da vedere'], ['nature', '🌳 Natura'], ['activities', '🎭 Attività'], ['food', '🍝 Cibo e locali'], ['events', '🎟️ Eventi']];
  let all;
  let evs = [];
  const draw = () => {
    $('#mapChips').innerHTML = chips.map(([k, l]) => `<button class="chip" type="button" data-k="${k}" aria-pressed="${(q.layer || '') === k}">${l}</button>`).join('');
    const show = q.layer === 'events' ? [] : all.filter((p) => !q.layer || ['sights', 'nature', 'activities', 'food'].includes(q.layer) && (CATS[p.category] || {}).group === q.layer);
    showPlaces(ctl, show.slice(0, 600), { fit: false });
    if (!q.layer || q.layer === 'events') showEvents(ctl, evs);
    showMe(ctl, pos());
    $('#mapInfo').innerHTML = `${show.length} luoghi${evs.length ? ` · ${evs.filter((e) => e.venue?.lat != null).length} eventi` : ''} · tocca un segnaposto per distanza, scheda e navigazione.`;
  };
  $('#mapChips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-k]');
    if (!b) return;
    q.layer = b.dataset.k;
    setHashQuery(q);
    draw();
  });
  $('#locate').addEventListener('click', async () => {
    const p = await locate();
    if (p) { showMe(ctl, p); ctl.map.setView([p.lat, p.lon], 15); }
  });
  try {
    const [r, er] = await Promise.all([
      api('/city/places', { params: { id: cid, lang: prefs.lang, limit: 1000, ...posParams() } }),
      api('/events', { params: { id: cid, when: 'week', lang: prefs.lang } }).catch(() => ({ events: [] })),
    ]);
    if (ctl.removed) return;
    all = r.places;
    evs = er.events;
    draw();
    if (d.city.bbox) ctl.map.fitBounds([[d.city.bbox[0], d.city.bbox[2]], [d.city.bbox[1], d.city.bbox[3]]], { animate: false });
  } catch (e) {
    $('#mapInfo').innerHTML = errorBox(e);
  }
}

// ---------------- Eventi ----------------
async function eventsView(body, { cityId, city: c, query }) {
  const q = { when: 'month', ...query };
  body.innerHTML = `<div class="wrap section"><div id="evFilters"></div><div id="evMeta"></div><div id="evList">${loader('Cerco gli eventi…')}</div></div>`;
  const whens = [['today', 'Oggi'], ['tomorrow', 'Domani'], ['weekend', 'Weekend'], ['week', '7 giorni'], ['month', '30 giorni'], ['custom', 'Date personalizzate']];
  const renderFilters = () => {
    $('#evFilters').innerHTML = `<div class="filters">
      <div class="chips scroll">${whens.map(([k, l]) => `<button class="chip" type="button" data-w="${k}" aria-pressed="${q.when === k}">${l}</button>`).join('')}</div>
      ${q.when === 'custom' ? `<div class="row"><label class="small">Dal <input class="select" type="date" id="evFrom" value="${esc(q.from || '')}"></label><label class="small">al <input class="select" type="date" id="evTo" value="${esc(q.to || '')}"></label><button class="btn btn-sm" id="evApply" type="button">Applica</button></div>` : ''}
      <div class="chips scroll"><button class="chip" type="button" data-c="" aria-pressed="${!q.category}">Tutte</button>${Object.entries(EVCATS).filter(([k]) => k !== 'other').map(([k, v]) => `<button class="chip" type="button" data-c="${k}" aria-pressed="${q.category === k}">${v.icon} ${esc(v.label)}</button>`).join('')}</div>
      <div class="row">
        <select class="select" id="evRadius" aria-label="Distanza">${[5, 10, 20, 25, 50, 100].map((k) => `<option value="${k}" ${String(q.radiusKm || 25) === String(k) ? 'selected' : ''}>Entro ${k} km</option>`).join('')}</select>
        <label class="toggle"><input type="radio" name="fee" value="" ${!q.free && !q.paid ? 'checked' : ''}> Tutti</label>
        <label class="toggle"><input type="radio" name="fee" value="free" ${q.free ? 'checked' : ''}> Gratuiti</label>
        <label class="toggle"><input type="radio" name="fee" value="paid" ${q.paid ? 'checked' : ''}> A pagamento</label>
      </div></div>`;
    $$('[data-w]').forEach((b) => b.addEventListener('click', () => { q.when = b.dataset.w; if (q.when !== 'custom') { delete q.from; delete q.to; } update(); }));
    $$('[data-c]').forEach((b) => b.addEventListener('click', () => { q.category = b.dataset.c; update(); }));
    $('#evRadius').addEventListener('change', (e) => { q.radiusKm = e.target.value; update(); });
    $$('input[name=fee]').forEach((r) => r.addEventListener('change', () => { q.free = r.value === 'free' ? '1' : ''; q.paid = r.value === 'paid' ? '1' : ''; update(); }));
    $('#evApply')?.addEventListener('click', () => { q.from = $('#evFrom').value; q.to = $('#evTo').value || q.from; if (!q.from) return toast('Scegli una data'); update(); });
  };
  const update = () => { setHashQuery(q); renderFilters(); if (q.when !== 'custom' || q.from) load(); else $('#evList').innerHTML = '<div class="empty">Scegli le date.</div>'; };
  async function load() {
    $('#evList').innerHTML = loader('Cerco gli eventi…');
    try {
      const r = await api('/events', { params: { ...q, id: cityId, lang: prefs.lang, userLat: pos()?.lat, userLon: pos()?.lon } });
      const srcs = r.sources.map((s) => `<span class="tag ${s.status === 'ok' ? 'open' : s.status === 'error' ? 'closed' : ''}">${esc(s.name)}: ${s.status === 'ok' ? `${s.count} eventi` : s.status === 'not_configured' ? 'non configurata' : 'non raggiungibile'}</span>`).join('');
      const fmt = (d) => new Date(d).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' });
      $('#evMeta').innerHTML = `<div class="sources">${srcs}</div><p class="small muted">${r.total} eventi dal ${fmt(r.range.from)} al ${fmt(r.range.to)} · distanze ${r.distanceFrom === 'user' ? 'dalla tua posizione' : 'dal centro città'}<br>${updated(r.fetchedAt, r.stale)}</p>`;
      const anyOk = r.sources.some((s) => s.status === 'ok');
      body._events = r.events;
      $('#evList').innerHTML = !anyOk
        ? `<div class="notice">ℹ️ Nessuna fonte eventi è attiva. L'amministratore deve configurare almeno una chiave API (Ticketmaster o PredictHQ). Non mostriamo eventi inventati.</div>`
        : r.events.length ? r.events.map(eventCard).join('') : '<div class="empty">Nessun evento trovato con questi filtri.</div>';
      for (const id of state.favorites) { const b = $(`[data-save-event="${CSS.escape(id)}"]`); if (b) b.textContent = '♥'; }
    } catch (e) {
      $('#evList').innerHTML = errorBox(e, true);
      $('[data-retry]')?.addEventListener('click', load);
    }
  }
  bindEventActions(body);
  update();
}

// ---------------- Pianificatore ----------------
function planner(body, d, query) {
  const today = new Date().toISOString().slice(0, 10);
  const sightCats = Object.entries(CATS).filter(([, v]) => v.group !== 'food');
  body.innerHTML = `<div class="wrap planner">
    <form class="panel form" id="planForm">
      <h2 style="font-size:1.3rem">Organizza la giornata</h2>
      <label>Data <input class="input" type="date" name="date" value="${esc(query.date || today)}" min="${today}"></label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <label>Inizio <input class="input" type="time" name="startTime" value="${esc(query.startTime || '09:30')}"></label>
        <label>Tempo disponibile <select class="input" name="hours">${[2, 3, 4, 5, 6, 8, 10, 12].map((h) => `<option value="${h}" ${String(query.hours || 6) === String(h) ? 'selected' : ''}>${h} ore</option>`).join('')}</select></label>
      </div>
      <label>Come ti sposti <select class="input" name="mode"><option value="foot">🚶 A piedi</option><option value="transit">🚌 Mezzi pubblici</option><option value="car">🚗 Auto</option></select></label>
      <label>Ritmo <select class="input" name="pace"><option value="relaxed">Rilassato</option><option value="normal" selected>Normale</option><option value="fast">Intenso</option></select></label>
      <label>Partenza <select class="input" name="startFrom"><option value="center">Centro città</option><option value="me">La mia posizione</option></select></label>
      <fieldset style="border:0;padding:0;margin:0"><legend class="small" style="font-weight:600;margin-bottom:6px">Cosa ti interessa</legend>
        <div class="chips">${sightCats.map(([k, v]) => `<label class="chip"><input type="checkbox" name="cat" value="${k}" style="margin:0"> ${v.icon} ${esc(v.label)}</label>`).join('')}</div></fieldset>
      <label class="toggle"><input type="checkbox" name="meals" checked> Includi pranzo / cena</label>
      <label class="toggle"><input type="checkbox" name="events" checked> Includi eventi del giorno</label>
      <label class="toggle"><input type="checkbox" name="hidden"> Preferisci posti meno conosciuti</label>
      <label class="toggle"><input type="checkbox" name="free"> Solo attività gratuite</label>
      <button class="btn" type="submit">Crea itinerario</button>
      <p class="small muted" style="margin:0">L'itinerario considera distanze, orari di apertura noti, durata media delle visite, eventi, meteo e le tue preferenze. I tempi di spostamento sono stime.</p>
    </form>
    <div id="planOut"><div class="panel empty">Imposta le preferenze e premi <b>Crea itinerario</b>.</div></div>
  </div>`;
  $('#planForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    let start = null;
    if (f.get('startFrom') === 'me') {
      start = pos() || (await locate());
      if (!start) return;
    }
    const payload = {
      cityId: d.city.id,
      lang: prefs.lang,
      date: f.get('date'),
      startTime: f.get('startTime'),
      hours: Number(f.get('hours')),
      mode: f.get('mode'),
      start: start ? { lat: start.lat, lon: start.lon } : null,
      preferences: { categories: f.getAll('cat'), meals: !!f.get('meals'), events: !!f.get('events'), hidden: !!f.get('hidden'), budget: f.get('free') ? 'free' : 'any', pace: f.get('pace') },
    };
    $('#planOut').innerHTML = loader('Sto ottimizzando il percorso…');
    try {
      renderPlan(await api('/itinerary', { method: 'POST', body: payload }));
    } catch (err) {
      $('#planOut').innerHTML = errorBox(err);
    }
  });
}

function renderPlan(p) {
  const modeTxt = { foot: '🚶', car: '🚗', transit: '🚌' };
  const stops = p.steps;
  let n = 0;
  $('#planOut').innerHTML = `
    <div class="summary">
      <div><span class="small muted">Tappe</span><b>${p.summary.stops}</b></div>
      <div><span class="small muted">Orario</span><b>${esc(p.startTime)}–${esc(p.endTime)}</b></div>
      <div><span class="small muted">Spostamenti</span><b>${minutes(p.summary.travelMinutes)}</b></div>
      <div><span class="small muted">A piedi</span><b>${String(p.summary.walkingKm).replace('.', ',')} km</b></div>
    </div>
    ${p.weather ? `<div class="notice info">${p.weather.icon} ${esc(p.weather.text)} · ${Math.round(p.weather.max)}° / ${Math.round(p.weather.min)}° · pioggia ${p.weather.rainProbability ?? '–'}%</div>` : ''}
    ${p.warnings.map((w) => `<div class="notice">⚠️ ${esc(w)}</div>`).join('')}
    <div class="map map-big" id="planMap" style="height:340px;margin-bottom:16px"></div>
    <ol class="timeline">
      ${stops.map((s) => {
        const isStop = s.type !== 'break';
        if (isStop) n++;
        const leg = s.travel.minutes ? `<li><span></span><div class="leg">${modeTxt[s.travel.mode] || ''} ${minutes(s.travel.minutes)} · ${distance(s.travel.meters)} (stima)${s.waitMinutes ? ` · attesa ${s.waitMinutes} min` : ''}</div></li>` : '';
        const cls = s.type === 'meal' || s.type === 'break' ? 'meal' : s.type === 'event' ? 'event' : '';
        const title = s.type === 'meal' ? `${s.mealLabel}: ${s.name}` : s.name;
        const link = s.type === 'visit' || s.type === 'meal' ? `#/place/${idToHash(s.id)}` : null;
        return `${leg}<li><div class="time">${esc(s.start)}</div><div class="stop ${cls}"><div class="num">${s.type === 'break' ? '🍴' : n}</div><div>
          <div style="font-weight:650">${link ? `<a href="${link}">${esc(title)}</a>` : esc(title)}</div>
          <div class="card-meta small">${s.category ? `<span>${catIcon(s.category)} ${esc(catLabel(s.category))}</span>` : s.type === 'event' ? '<span>🎟️ Evento</span>' : ''}<span>${esc(s.start)}–${esc(s.end)}</span>
          ${s.openingStatus === 'unknown' && s.type === 'visit' ? '<span class="tag warn">Orario non verificato</span>' : s.openingStatus === 'open' ? '<span class="tag open">Aperto</span>' : ''}
          ${s.rating ? scoreBadge(s.rating) : ''}${s.ticketUrl ? `<a href="${esc(s.ticketUrl)}" target="_blank" rel="noopener">Biglietti</a>` : ''}</div>
        </div></div></li>`;
      }).join('')}
    </ol>
    ${p.summary.freeMinutes > 20 ? `<p class="muted small">Tempo libero residuo: ${minutes(p.summary.freeMinutes)}.</p>` : ''}
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
      <a class="btn btn-ghost" target="_blank" rel="noopener" href="${googleMultiStop(p)}">Apri il percorso in Google Maps</a>
      <button class="btn btn-ghost" id="sharePlan" type="button">Condividi</button>
    </div>`;
  const ctl = createMap($('#planMap'), { lat: p.start.lat, lon: p.start.lon });
  state.maps.push(ctl);
  showRoute(ctl, p.start, stops.filter((s) => s.lat != null && s.type !== 'break'));
  $('#sharePlan').addEventListener('click', () => {
    const txt = stops.map((s) => `${s.start} ${s.type === 'meal' ? s.mealLabel + ': ' : ''}${s.name}`).join('\n');
    share({ title: `Itinerario a ${p.city.name}`, text: `Itinerario a ${p.city.name} (${p.date})\n${txt}`, url: location.href });
  });
}

function googleMultiStop(p) {
  const pts = p.steps.filter((s) => s.type !== 'break');
  if (!pts.length) return '#';
  const dest = pts[pts.length - 1];
  const wps = pts.slice(0, -1).slice(0, 9).map((s) => `${s.lat},${s.lon}`).join('|');
  const mode = { foot: 'walking', car: 'driving', transit: 'transit' }[p.mode];
  return `https://www.google.com/maps/dir/?api=1&origin=${p.start.lat},${p.start.lon}&destination=${dest.lat},${dest.lon}${wps && p.mode !== 'transit' ? `&waypoints=${encodeURIComponent(wps)}` : ''}&travelmode=${mode}`;
}

// ---------------- Scheda luogo ----------------
async function place(id) {
  app.innerHTML = loader('Carico la scheda…');
  let d;
  try {
    d = await api('/place', { params: { id, lang: prefs.lang, ...posParams() } });
  } catch (e) {
    app.innerHTML = `<div class="wrap">${errorBox(e)}<p class="empty"><a class="btn btn-ghost" href="#/">Cerca una città</a></p></div>`;
    return;
  }
  const p = d.place;
  document.title = `${p.name} — CityDiscover`;
  const photos = p.photos || [];
  const gal = photos.length
    ? `<div class="gallery ${photos.length < 3 ? 'one' : ''}">${photos.slice(0, photos.length < 3 ? 1 : 5).map((ph, i) => `<figure><img src="${esc(ph.url)}" alt="${esc(ph.caption || p.name)}" loading="${i ? 'lazy' : 'eager'}" referrerpolicy="no-referrer" data-full="${esc(ph.url)}" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'ph',textContent:'${catIcon(p.category)}'}))"></figure>`).join('')}</div>
       <p class="source-note">Foto: Wikimedia Commons${photos.length > 5 ? ` · <a href="#" id="allPhotos">tutte le ${photos.length} foto</a>` : ''}</p>`
    : `<div class="gallery ph"><div class="ph">${catIcon(p.category)}</div></div><p class="source-note">Nessuna foto libera disponibile per questo luogo.</p>`;
  const todayIdx = (new Date().getDay() + 6) % 7;
  const dir = d.directions;
  const fav = state.favorites.has(p.id);
  const adm = p.admission;
  app.innerHTML = `<div class="wrap">
    ${gal}
    <div class="detail">
      <div>
        <div class="card-meta"><span>${catIcon(p.category)} ${esc(p.categoryLabel)}</span>${openTag(p)}${p.hidden ? '<span class="tag">💎 Posto nascosto</span>' : ''}${p.heritage ? '<span class="tag">🏛️ Patrimonio tutelato</span>' : ''}</div>
        <h1 style="margin-top:6px">${esc(p.name)}</h1>
        ${p.wikiDescription ? `<p class="muted" style="margin-top:-4px">${esc(p.wikiDescription)}</p>` : ''}
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin:14px 0">
          <button class="icon-btn" id="favBtn" type="button" aria-pressed="${fav}" aria-label="Salva nei preferiti" title="Preferiti">${fav ? '♥' : '♡'}</button>
          <button class="btn btn-ghost btn-sm" id="addList" type="button">➕ Aggiungi a una lista</button>
          <button class="btn btn-ghost btn-sm" id="sharePlace" type="button">↗ Condividi</button>
          <a class="btn btn-sm" href="${esc(d.links.googleWalking)}" target="_blank" rel="noopener">🧭 Indicazioni</a>
        </div>

        <div class="rating-box">
          ${scoreBadge(p.rating, { large: true })}
          <div class="bars">
            ${p.rating.available ? [['Gradimento generale', p.rating.breakdown.overall], ['Qualità dell\'esperienza', p.rating.breakdown.experience], ['Rapporto qualità-prezzo', p.rating.breakdown.valueForMoney]].map(([l, v]) => `<div class="bar"><span>${l}</span><i><b style="width:${(v || 0) * 10}%"></b></i><span>${v != null ? String(v).replace('.', ',') : '–'}</span></div>`).join('') : `<div><b>${esc(reviewsCount(p.rating))}</b></div><div class="muted small">${p.rating.count ? `Servono almeno ${p.rating.minRequired} recensioni per calcolare un voto affidabile.` : 'Il voto non è disponibile: nessuna recensione finora. Sii il primo!'}</div>`}
            <div class="small muted">Popolarità: ${p.popularity}/100${p.sitelinks ? ` · voce Wikipedia in ${p.sitelinks} lingue` : ''}${p.visitorsPerYear ? ` · ${p.visitorsPerYear.toLocaleString('it-IT')} visitatori/anno (Wikidata)` : ''}</div>
          </div>
        </div>

        <h2 style="font-size:1.3rem;margin-top:24px">Descrizione</h2>
        ${p.description ? `<p class="prose">${esc(p.description)}</p><p class="source-note">Fonte: ${p.descriptionSource?.url ? `<a href="${esc(p.descriptionSource.url)}" target="_blank" rel="noopener">${esc(p.descriptionSource.name)}</a> (CC BY-SA)` : esc(p.descriptionSource?.name || '')}</p>` : '<p class="muted">Nessuna descrizione verificata disponibile.</p>'}

        <h2 style="font-size:1.3rem;margin-top:28px">Mappa e percorso</h2>
        <div class="map map-big" id="placeMap" style="height:320px"></div>

        <h2 style="font-size:1.3rem;margin-top:28px" id="reviews">Recensioni</h2>
        <div id="reviewForm"></div>
        <div id="reviewList">${renderReviews(d.reviews)}</div>
      </div>

      <aside class="facts">
        ${fact('📍', 'Indirizzo', p.address ? esc(p.address) : `<span class="muted">Non indicato</span> · ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`)}
        ${p.distanceMeters != null ? fact('📏', 'Distanza da te', `${distance(p.distanceMeters)} in linea d'aria`) : fact('📏', 'Distanza', '<button class="btn btn-sm btn-soft" id="locFact" type="button">Calcola dalla mia posizione</button>')}
        ${dir ? fact('🧭', 'Tempo per arrivare', `<div class="travel">
            <div>🚶<b>${minutes(dir.foot.minutes)}</b><span class="small muted">${dir.foot.verified ? distance(dir.foot.meters) : 'stima'}</span></div>
            <div>🚗<b>${minutes(dir.car.minutes)}</b><span class="small muted">${dir.car.verified ? distance(dir.car.meters) : 'stima'}</span></div>
            <div>🚌<b>~${minutes(dir.transit.minutes)}</b><span class="small muted">stima</span></div></div>
            <div class="small" style="margin-top:6px"><a href="${esc(d.links.googleTransit)}" target="_blank" rel="noopener">Orari reali dei mezzi pubblici →</a></div>`) : ''}
        ${fact('🕒', 'Orari di apertura', p.openingTable ? `<table class="hours">${p.openingTable.map((r, i) => `<tr class="${i === todayIdx ? 'today' : ''}"><td>${r.day}</td><td>${esc(r.hours)}</td></tr>`).join('')}</table><div class="small muted" style="margin-top:4px">⚠️ Orari da OpenStreetMap, non verificati: controlla sul sito ufficiale.</div>` : p.openingHours ? `<code class="small">${esc(p.openingHours)}</code><div class="small muted">Formato non interpretabile automaticamente · non verificato</div>` : '<span class="muted">Non disponibili</span>')}
        ${fact('🎟️', 'Ingresso', adm ? `${esc(adm.text)}<div class="small muted">Dato OpenStreetMap, non verificato</div>` : p.rating.reportedPriceLevel != null ? `${PRICE_LABELS[p.rating.reportedPriceLevel]} <span class="small muted">(segnalato dagli utenti)</span>` : '<span class="muted">Non indicato</span>')}
        ${p.visitMinutes ? fact('⏳', 'Tempo consigliato', `${minutes(p.visitMinutes)} <span class="small muted">(stima per categoria)</span>`) : ''}
        ${p.website ? fact('🌐', 'Sito ufficiale', `<a href="${esc(p.website)}" target="_blank" rel="noopener">${esc(p.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))}</a>`) : ''}
        ${p.phone ? fact('📞', 'Telefono', `<a href="tel:${esc(p.phone.replace(/\s/g, ''))}">${esc(p.phone)}</a>`) : ''}
        ${p.cuisine ? fact('🍽️', 'Cucina', esc(p.cuisine.replace(/;/g, ', ').replace(/_/g, ' '))) : ''}
        ${p.wheelchair ? fact('♿', 'Accessibilità', { yes: 'Accessibile', limited: 'Parzialmente accessibile', no: 'Non accessibile' }[p.wheelchair] || esc(p.wheelchair)) : ''}
        <div style="display:grid;gap:6px">
          <a class="btn" href="${esc(d.links.googleWalking)}" target="_blank" rel="noopener">Naviga a piedi</a>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
            <a class="btn btn-ghost btn-sm" href="${esc(d.links.googleDriving)}" target="_blank" rel="noopener">In auto</a>
            <a class="btn btn-ghost btn-sm" href="${esc(d.links.googleTransit)}" target="_blank" rel="noopener">Con i mezzi</a>
            <a class="btn btn-ghost btn-sm" href="${esc(d.links.apple)}" target="_blank" rel="noopener">Apple Mappe</a>
            <a class="btn btn-ghost btn-sm" href="${esc(d.links.osm)}" target="_blank" rel="noopener">OpenStreetMap</a>
          </div>
        </div>
        <div class="small muted">${updated(d.updatedAt)}<br>Fonte: OpenStreetMap${p.wikidata ? `, <a href="https://www.wikidata.org/wiki/${esc(p.wikidata)}" target="_blank" rel="noopener">Wikidata</a>` : ''} · <a href="https://www.openstreetmap.org/${esc(p.id)}" target="_blank" rel="noopener">Segnala un errore</a></div>
      </aside>
    </div></div>`;

  const ctl = createMap($('#placeMap'), { lat: p.lat, lon: p.lon, zoom: 16 });
  state.maps.push(ctl);
  showPlaces(ctl, [p], { fit: false });
  showMe(ctl, pos());
  if (dir?.foot?.geometry) geoRoute(ctl, dir.foot.geometry);

  $('#favBtn').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    try { const on = await toggleFavorite(p); btn.setAttribute('aria-pressed', on); btn.textContent = on ? '♥' : '♡'; } catch (err) { toast(err.message); }
  });
  $('#sharePlace').addEventListener('click', () => share({ title: p.name, text: `${p.name} — ${p.categoryLabel}`, url: location.href }));
  $('#addList').addEventListener('click', () => addToListDialog(p));
  $('#locFact')?.addEventListener('click', async () => { if (await locate()) route(); });
  $$('.gallery img').forEach((img) => img.addEventListener('click', () => modal(`<img src="${esc(img.dataset.full)}" alt=""><button class="btn btn-sm" data-close style="margin-top:6px">Chiudi</button>`, 'lightbox')));
  $('#allPhotos')?.addEventListener('click', (e) => {
    e.preventDefault();
    modal(`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:6px;max-height:80vh;overflow:auto">${photos.map((ph) => `<img src="${esc(ph.url)}" alt="${esc(ph.caption || '')}" loading="lazy" referrerpolicy="no-referrer" style="width:100%;height:140px;object-fit:cover;border-radius:8px">`).join('')}</div><button class="btn btn-sm" data-close style="margin-top:8px">Chiudi</button>`, 'lightbox');
  });
  renderReviewForm(p, d.reviews, 'place');
}

function fact(icon, k, v) {
  return `<div class="fact"><span aria-hidden="true">${icon}</span><div><div class="k">${k}</div><div>${v}</div></div></div>`;
}

function renderReviews(reviews) {
  if (!reviews.length) return '<p class="muted">Ancora nessuna recensione.</p>';
  return reviews.map((r) => `<div class="review"><div class="review-head">${scoreBadge({ available: true, score: r.overall, count: 1 })}<b>${esc(r.author)}</b><span class="small muted">${new Date(r.updatedAt.replace(' ', 'T') + 'Z').toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
    <div class="card-meta small">${r.experience ? `<span>Esperienza ${r.experience}/10</span>` : ''}${r.valueForMoney ? `<span>Qualità-prezzo ${r.valueForMoney}/10</span>` : ''}${r.priceLevel != null ? `<span>${PRICE_LABELS[r.priceLevel]}</span>` : ''}</div>
    ${r.text ? `<p style="margin:6px 0 0">${esc(r.text)}</p>` : ''}</div>`).join('');
}

function scaleInput(name, value) {
  return `<div class="scale" data-scale="${name}">${Array.from({ length: 10 }, (_, i) => `<button type="button" data-v="${i + 1}" aria-pressed="${value === i + 1}">${i + 1}</button>`).join('')}</div>`;
}

function renderReviewForm(item, reviews, type) {
  const box = $('#reviewForm');
  if (!session.user) {
    box.innerHTML = `<div class="notice info">✍️ <span><a href="#/account">Accedi o registrati</a> per lasciare il tuo voto e una recensione.</span></div>`;
    return;
  }
  const mine = reviews.find((r) => r.userId === session.user.id) || {};
  const vals = { overall: mine.overall, experience: mine.experience, valueForMoney: mine.valueForMoney };
  box.innerHTML = `<form class="panel form" id="rvForm">
    <b>${mine.overall ? 'Modifica la tua recensione' : 'Lascia la tua recensione'}</b>
    <label>Gradimento generale *${scaleInput('overall', vals.overall)}</label>
    <label>Qualità dell'esperienza${scaleInput('experience', vals.experience)}</label>
    <label>Rapporto qualità-prezzo${scaleInput('valueForMoney', vals.valueForMoney)}</label>
    <label>Fascia di prezzo <select class="input" name="priceLevel"><option value="">Non so</option>${PRICE_LABELS.map((l, i) => `<option value="${i}" ${mine.priceLevel === i ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label>Commento <textarea class="input" name="text" rows="3" maxlength="2000" placeholder="Com'è stata la tua esperienza?">${esc(mine.text || '')}</textarea></label>
    <div style="display:flex;gap:8px"><button class="btn" type="submit">Pubblica</button>${mine.overall ? '<button class="btn btn-ghost" type="button" id="rvDel">Elimina</button>' : ''}</div>
  </form>`;
  $$('[data-scale]', box).forEach((sc) => sc.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    vals[sc.dataset.scale] = Number(b.dataset.v);
    $$('button', sc).forEach((x) => x.setAttribute('aria-pressed', x === b));
  }));
  const refresh = async () => {
    const r = await api('/reviews', { params: { itemId: item.id } });
    $('#reviewList').innerHTML = renderReviews(r.reviews);
    renderReviewForm(item, r.reviews, type);
    if (type === 'place') route();
  };
  $('#rvForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!vals.overall) return toast('Indica almeno il gradimento generale');
    const f = new FormData(e.target);
    try {
      await api('/reviews', { method: 'POST', body: { itemId: item.id, itemType: type, ...vals, priceLevel: f.get('priceLevel'), text: f.get('text') } });
      toast('Grazie per la recensione!');
      refresh();
    } catch (err) { toast(err.message); }
  });
  $('#rvDel')?.addEventListener('click', async () => {
    await api('/reviews', { method: 'DELETE', params: { itemId: item.id } });
    toast('Recensione eliminata');
    refresh();
  });
}

async function addToListDialog(p) {
  if (!session.token) { toast('Accedi per creare liste'); location.hash = '#/account'; return; }
  const { lists } = await api('/lists');
  const m = modal(`<h2 style="font-size:1.2rem">Aggiungi «${esc(p.name)}» a una lista</h2>
    <div style="display:grid;gap:6px;margin:12px 0">${lists.map((l) => `<button class="btn btn-ghost" type="button" data-list="${l.id}">${l.isFavorites ? '❤️' : '📋'} ${esc(l.name)} <span class="muted small">(${l.items.length})</span></button>`).join('')}</div>
    <form id="newList" style="display:flex;gap:6px"><input class="input" name="name" placeholder="Nuova lista (es. Weekend a Roma)" required maxlength="80"><button class="btn" type="submit">Crea</button></form>
    <button class="btn btn-ghost btn-sm" data-close type="button" style="margin-top:12px">Chiudi</button>`);
  const add = async (listId) => {
    await api(`/lists/${listId}/items`, { method: 'POST', body: { itemId: p.id, itemType: 'place', snapshot: { name: p.name, category: p.category, lat: p.lat, lon: p.lon, image: p.image } } });
    m.close();
    toast('Aggiunto alla lista');
  };
  m.querySelectorAll('[data-list]').forEach((b) => b.addEventListener('click', () => add(b.dataset.list)));
  m.querySelector('#newList').addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = await api('/lists', { method: 'POST', body: { name: new FormData(e.target).get('name') } });
    add(r.id);
  });
}

// ---------------- Vicino a me ----------------
async function nearby(query) {
  document.title = 'Vicino a me — CityDiscover';
  app.innerHTML = `<div class="wrap"><div class="section-head" style="margin-top:24px"><h1 style="font-size:2rem">I migliori posti vicino a te</h1></div><div id="nb"></div></div>`;
  let p = pos();
  if (!p) {
    // Se il permesso è già stato concesso, chiedi la posizione senza passaggi in più.
    try {
      const perm = await navigator.permissions?.query({ name: 'geolocation' });
      if (perm?.state === 'granted') {
        $('#nb').innerHTML = loader('Rilevo la tua posizione…');
        p = await locate({ quiet: true });
      }
    } catch { /* API permessi non disponibile */ }
  }
  if (!p) {
    $('#nb').innerHTML = `<div class="panel empty"><p style="font-size:2rem;margin:0">📍</p><p>Per mostrarti cosa c'è intorno a te serve la tua posizione. Viene usata solo per calcolare le distanze.</p><button class="btn" id="askLoc" type="button">Consenti posizione</button></div>`;
    $('#askLoc').addEventListener('click', async () => { p = await locate(); if (p) route(); });
    return;
  }
  explore($('#nb'), { nearbyMode: true, query });
}

// ---------------- Salvati ----------------
async function saved() {
  document.title = 'Salvati — CityDiscover';
  if (!session.token) {
    app.innerHTML = `<div class="wrap"><div class="panel empty" style="margin-top:32px"><p style="font-size:2rem;margin:0">❤️</p><h2>I tuoi luoghi preferiti</h2><p>Accedi per salvare luoghi ed eventi e creare liste personalizzate da condividere.</p><a class="btn" href="#/account">Accedi o registrati</a></div></div>`;
    return;
  }
  app.innerHTML = `<div class="wrap">${loader()}</div>`;
  try {
    const { lists } = await api('/lists');
    app.innerHTML = `<div class="wrap section">
      <div class="section-head"><h1 style="font-size:2rem">Salvati e liste</h1>
        <form id="nl" style="display:flex;gap:6px"><input class="input" name="name" placeholder="Nuova lista" required maxlength="80"><button class="btn" type="submit">Crea</button></form></div>
      ${lists.map((l) => `<div class="section"><div class="section-head"><h2>${l.isFavorites ? '❤️' : '📋'} ${esc(l.name)} <span class="muted small">${l.items.length}</span></h2>
        <div style="display:flex;gap:6px">${!l.isFavorites ? `<button class="btn btn-ghost btn-sm" data-share="${l.id}" type="button">Condividi</button><button class="btn btn-ghost btn-sm" data-del="${l.id}" type="button">Elimina</button>` : ''}</div></div>
        ${l.items.length ? `<div class="grid">${l.items.map((i) => savedCard(i, l.id)).join('')}</div>` : '<p class="muted">Lista vuota.</p>'}</div>`).join('')}
    </div>`;
    $('#nl').addEventListener('submit', async (e) => { e.preventDefault(); await api('/lists', { method: 'POST', body: { name: new FormData(e.target).get('name') } }); route(); });
    $$('[data-del]').forEach((b) => b.addEventListener('click', async () => { if (confirm('Eliminare la lista?')) { await api(`/lists/${b.dataset.del}`, { method: 'DELETE' }); route(); } }));
    $$('[data-share]').forEach((b) => b.addEventListener('click', async () => {
      const { token } = await api(`/lists/${b.dataset.share}/share`, { method: 'POST' });
      share({ title: 'La mia lista su CityDiscover', url: `${location.origin}/#/shared/${token}` });
    }));
    $$('[data-rm]').forEach((b) => b.addEventListener('click', async (e) => {
      e.preventDefault();
      await api(`/lists/${b.dataset.list}/items`, { method: 'DELETE', params: { itemId: b.dataset.rm } });
      await loadFavorites();
      route();
    }));
  } catch (e) {
    app.innerHTML = `<div class="wrap">${errorBox(e)}</div>`;
  }
}

function savedCard(i, listId) {
  const s = i.snapshot;
  const href = i.itemType === 'place' ? `#/place/${idToHash(i.itemId)}` : s.lat != null ? `https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lon}` : '#';
  return `<a class="card" href="${href}" ${i.itemType === 'event' ? 'target="_blank" rel="noopener"' : ''}>
    <div class="card-media">${s.image ? `<img src="${esc(s.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<div class="ph">${i.itemType === 'event' ? '🎟️' : catIcon(s.category)}</div>`}</div>
    <div class="card-body"><div class="card-title">${esc(s.name)}</div>
      <div class="card-meta"><span>${i.itemType === 'event' ? `🎟️ Evento${s.date ? ' · ' + esc(s.date) : ''}` : `${catIcon(s.category)} ${esc(catLabel(s.category))}`}</span>
      ${pos() && s.lat != null ? `<span>📍 ${distance(haversine(pos().lat, pos().lon, s.lat, s.lon))}</span>` : ''}</div>
      ${listId ? `<button class="btn btn-ghost btn-sm" data-rm="${esc(i.itemId)}" data-list="${listId}" type="button" style="align-self:flex-start;margin-top:4px">Rimuovi</button>` : ''}</div></a>`;
}

function haversine(a, b, c, d) {
  const r = (x) => (x * Math.PI) / 180;
  const h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.sqrt(h));
}

async function sharedList(token) {
  app.innerHTML = `<div class="wrap">${loader()}</div>`;
  try {
    const l = await api(`/shared/${encodeURIComponent(token)}`);
    document.title = `${l.name} — CityDiscover`;
    app.innerHTML = `<div class="wrap section"><p class="muted">Lista condivisa da ${esc(l.owner)}</p><h1 style="font-size:2rem">${esc(l.name)}</h1>
      ${l.items.length ? `<div class="grid">${l.items.map((i) => savedCard(i, null)).join('')}</div>` : '<p class="muted">Lista vuota.</p>'}</div>`;
  } catch (e) {
    app.innerHTML = `<div class="wrap">${errorBox(e)}</div>`;
  }
}

// ---------------- Account ----------------
function account() {
  document.title = 'Profilo — CityDiscover';
  const langs = [['it', 'Italiano'], ['en', 'English'], ['es', 'Español'], ['fr', 'Français'], ['de', 'Deutsch'], ['pt', 'Português']];
  const settings = `<div class="panel form" style="margin-top:16px"><b>Preferenze</b>
    <label>Lingua dei contenuti (nomi delle città, descrizioni Wikipedia)
      <select class="input" id="langSel">${langs.map(([k, l]) => `<option value="${k}" ${prefs.lang === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <p class="small muted" style="margin:0">La ricerca accetta nomi di città in qualsiasi lingua e alfabeto (es. «Firenze», «Florence», «Флоренция», «フィレンツェ»).</p></div>`;
  if (session.user) {
    app.innerHTML = `<div class="wrap" style="max-width:560px;margin-top:32px">
      <div class="panel"><h1 style="font-size:1.8rem">Ciao, ${esc(session.user.name)}</h1><p class="muted">${esc(session.user.email)}</p>
      <div style="display:flex;gap:8px"><a class="btn" href="#/saved">I miei salvati</a><button class="btn btn-ghost" id="logout" type="button">Esci</button></div></div>${settings}</div>`;
    $('#logout').addEventListener('click', () => { session.clear(); state.favorites.clear(); toast('Disconnesso'); route(); });
  } else {
    app.innerHTML = `<div class="wrap" style="max-width:560px;margin-top:32px">
      <div class="panel">
        <div class="chips" style="margin-bottom:14px"><button class="chip" type="button" data-mode="login" aria-pressed="true">Accedi</button><button class="chip" type="button" data-mode="register" aria-pressed="false">Registrati</button></div>
        <form class="form" id="authForm">
          <label id="nameField" hidden>Nome <input class="input" name="name" autocomplete="name" maxlength="60"></label>
          <label>Email <input class="input" type="email" name="email" required autocomplete="email"></label>
          <label>Password <input class="input" type="password" name="password" required minlength="8" autocomplete="current-password"></label>
          <button class="btn" type="submit" id="authSubmit">Accedi</button>
          <p class="small muted" style="margin:0">Con un account puoi votare, recensire, salvare preferiti e creare liste.</p>
        </form>
      </div>${settings}</div>`;
    let mode = 'login';
    $$('[data-mode]').forEach((b) => b.addEventListener('click', () => {
      mode = b.dataset.mode;
      $$('[data-mode]').forEach((x) => x.setAttribute('aria-pressed', x === b));
      $('#nameField').hidden = mode !== 'register';
      $('#authSubmit').textContent = mode === 'register' ? 'Crea account' : 'Accedi';
      $('[name=password]').autocomplete = mode === 'register' ? 'new-password' : 'current-password';
    }));
    $('#authForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      try {
        const r = await api(mode === 'register' ? '/auth/register' : '/auth/login', { method: 'POST', body: f });
        session.set(r);
        await loadFavorites();
        toast(`Benvenuto, ${r.user.name}!`);
        history.length > 2 ? history.back() : (location.hash = '#/');
      } catch (err) { toast(err.message); }
    });
  }
  $('#langSel').addEventListener('change', (e) => { prefs.lang = e.target.value; state.cityCache.clear(); toast('Preferenza salvata'); });
}

// ---------------- Avvio ----------------
function initTheme() {
  $('#themeBtn').addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('cd.theme', next); } catch { /* ignora */ }
  });
}

async function init() {
  initTheme();
  try { setCategories(await api('/categories')); } catch (e) { app.innerHTML = `<div class="wrap">${errorBox(e)}</div>`; return; }
  await loadFavorites();
  window.addEventListener('hashchange', route);
  route();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('/sw.js').catch(() => {});
}

init();
