'use strict';
// Client HTTP per le API esterne: user-agent, timeout, ritmo per host, retry e cache su database.
const config = require('./config');
const db = require('./db');

// Intervallo minimo tra richieste allo stesso host (policy d'uso dei servizi pubblici).
const MIN_GAP_MS = {
  'nominatim.openstreetmap.org': 1100,
  'overpass-api.de': 1000,
  'overpass.kumi.systems': 1000,
  'routing.openstreetmap.de': 300,
};
const lastCall = new Map();
const queues = new Map();

function throttle(host) {
  const gap = MIN_GAP_MS[host] || 0;
  if (!gap) return Promise.resolve();
  const prev = queues.get(host) || Promise.resolve();
  const next = prev.then(async () => {
    const wait = (lastCall.get(host) || 0) + gap - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCall.set(host, Date.now());
  });
  queues.set(host, next.catch(() => {}));
  return next;
}

class UpstreamError extends Error {
  constructor(message, status, source) {
    super(message);
    this.status = status;
    this.source = source;
  }
}

async function request(url, { method = 'GET', headers = {}, body, timeoutMs = 25000, retries = 1, source } = {}) {
  const u = new URL(url);
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    await throttle(u.host);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        body,
        signal: ctrl.signal,
        headers: { 'User-Agent': config.userAgent, Accept: 'application/json', ...headers },
      });
      if (res.status === 429 || res.status >= 500) {
        lastErr = new UpstreamError(`${u.host} ha risposto ${res.status}`, res.status, source || u.host);
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        continue;
      }
      if (!res.ok) throw new UpstreamError(`${u.host} ha risposto ${res.status}`, res.status, source || u.host);
      return await res.json();
    } catch (e) {
      lastErr = e instanceof UpstreamError ? e : new UpstreamError(`${u.host} non raggiungibile: ${e.message}`, 0, source || u.host);
      if (e instanceof UpstreamError && e.status && e.status < 500 && e.status !== 429) throw e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

const inflight = new Map();

/**
 * Restituisce { value, fetchedAt, fromCache, stale } usando la cache su DB.
 * Se la fonte non risponde ma esiste una copia scaduta, la restituisce marcata come "stale".
 */
async function cached(key, ttlSeconds, loader, { force = false } = {}) {
  const d = db.get();
  const now = Math.floor(Date.now() / 1000);
  const row = d.prepare('SELECT value, fetched_at, expires_at FROM api_cache WHERE key = ?').get(key);
  if (row && !force && row.expires_at > now) {
    return { value: JSON.parse(row.value), fetchedAt: row.fetched_at * 1000, fromCache: true, stale: false };
  }
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    try {
      const value = await loader();
      d.prepare(
        'INSERT INTO api_cache (key, value, fetched_at, expires_at) VALUES (?, ?, ?, ?) ' +
          'ON CONFLICT(key) DO UPDATE SET value = excluded.value, fetched_at = excluded.fetched_at, expires_at = excluded.expires_at'
      ).run(key, JSON.stringify(value), now, now + ttlSeconds);
      return { value, fetchedAt: now * 1000, fromCache: false, stale: false };
    } catch (e) {
      if (row) return { value: JSON.parse(row.value), fetchedAt: row.fetched_at * 1000, fromCache: true, stale: true, error: e.message };
      throw e;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

module.exports = { request, cached, UpstreamError };
