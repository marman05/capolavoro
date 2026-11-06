// Client delle API REST di CityDiscover.
const store = {
  get(k, d = null) {
    try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; }
  },
  set(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage non disponibile */ }
  },
  del(k) {
    try { localStorage.removeItem(k); } catch { /* ignora */ }
  },
};

export const session = {
  get token() { return store.get('cd.token'); },
  get user() { return store.get('cd.user'); },
  set(data) { store.set('cd.token', data.token); store.set('cd.user', data.user); },
  clear() { store.del('cd.token'); store.del('cd.user'); },
};

export const prefs = {
  get lang() { return store.get('cd.lang', (navigator.language || 'it').slice(0, 2)); },
  set lang(v) { store.set('cd.lang', v); },
  get recent() { return store.get('cd.recent', []); },
  addRecent(c) {
    const list = [{ id: c.id, name: c.name, country: c.country }, ...this.recent.filter((x) => x.id !== c.id)].slice(0, 8);
    store.set('cd.recent', list);
  },
};

export { store };

function qs(params) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) if (v !== undefined && v !== null && v !== '') u.set(k, v);
  const s = u.toString();
  return s ? `?${s}` : '';
}

export async function api(path, { method = 'GET', params, body } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (session.token) headers.Authorization = `Bearer ${session.token}`;
  const res = await fetch(`/api${path}${qs(params)}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await res.json(); } catch { /* risposta vuota */ }
  if (!res.ok) {
    if (res.status === 401 && session.token && path !== '/auth/login') session.clear();
    const err = new Error((data && data.error) || `Errore ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}
