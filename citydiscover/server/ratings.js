'use strict';
/*
 * Voto 1–10 calcolato SOLO da recensioni reali degli utenti registrati.
 * Ogni recensione contiene: gradimento generale (obbligatorio), qualità dell'esperienza
 * e rapporto qualità-prezzo (facoltativi). Il voto finale è una media pesata
 * (60% generale, 25% esperienza, 15% qualità-prezzo); se mancano i sotto-voti si usa il generale.
 * Sotto la soglia minima di recensioni il voto NON viene mostrato.
 * Popolarità e interesse turistico sono indicatori separati, basati su dati oggettivi
 * (pagine Wikipedia in più lingue, visitatori annui da Wikidata, salvataggi tra i preferiti).
 */
const config = require('./config');
const db = require('./db');

function reviewScore(r) {
  const exp = r.experience ?? r.overall;
  const val = r.value_for_money ?? r.overall;
  return 0.6 * r.overall + 0.25 * exp + 0.15 * val;
}

function aggregateRows(rows) {
  const count = rows.length;
  if (!count) return { score: null, count: 0, available: false };
  const avg = (k) => {
    const v = rows.map((r) => r[k]).filter((x) => x != null);
    return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
  };
  const score = Math.round((rows.reduce((a, r) => a + reviewScore(r), 0) / count) * 10) / 10;
  const prices = rows.map((r) => r.price_level).filter((x) => x != null).sort();
  const available = count >= config.minReviewsForScore;
  return {
    score: available ? score : null,
    available,
    count,
    minRequired: config.minReviewsForScore,
    breakdown: available ? { overall: avg('overall'), experience: avg('experience'), valueForMoney: avg('value_for_money') } : null,
    reportedPriceLevel: prices.length >= 2 ? prices[Math.floor(prices.length / 2)] : null,
  };
}

function forItems(ids) {
  const out = {};
  if (!ids.length) return out;
  const d = db.get();
  const rows = [];
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    rows.push(
      ...d
        .prepare(`SELECT item_id, overall, experience, value_for_money, price_level FROM reviews WHERE item_id IN (${chunk.map(() => '?').join(',')})`)
        .all(...chunk)
    );
  }
  const by = new Map();
  for (const r of rows) {
    if (!by.has(r.item_id)) by.set(r.item_id, []);
    by.get(r.item_id).push(r);
  }
  const favs = favoritesCount(ids);
  for (const id of ids) out[id] = { ...aggregateRows(by.get(id) || []), favorites: favs[id] || 0 };
  return out;
}

function favoritesCount(ids) {
  const out = {};
  const d = db.get();
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    for (const r of d
      .prepare(
        `SELECT li.item_id, COUNT(*) n FROM list_items li JOIN lists l ON l.id = li.list_id
         WHERE l.is_favorites = 1 AND li.item_id IN (${chunk.map(() => '?').join(',')}) GROUP BY li.item_id`
      )
      .all(...chunk))
      out[r.item_id] = r.n;
  }
  return out;
}

function reviewsFor(itemId, limit = 50) {
  return db
    .get()
    .prepare(
      `SELECT r.id, r.overall, r.experience, r.value_for_money AS valueForMoney, r.price_level AS priceLevel, r.text,
              r.created_at AS createdAt, r.updated_at AS updatedAt, u.name AS author, r.user_id AS userId
       FROM reviews r JOIN users u ON u.id = r.user_id WHERE r.item_id = ? ORDER BY r.updated_at DESC LIMIT ?`
    )
    .all(itemId, limit);
}

function clampInt(v, lo, hi) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < lo || n > hi) throw Object.assign(new Error(`Valore non valido (${lo}-${hi})`), { status: 400 });
  return n;
}

function upsertReview(userId, { itemId, itemType, overall, experience, valueForMoney, priceLevel, text }) {
  if (!itemId || !/^[\w:/.-]{3,120}$/.test(itemId)) throw Object.assign(new Error('Elemento non valido'), { status: 400 });
  if (!['place', 'event'].includes(itemType)) throw Object.assign(new Error('Tipo non valido'), { status: 400 });
  const o = clampInt(overall, 1, 10);
  if (o === null) throw Object.assign(new Error('Il voto generale è obbligatorio'), { status: 400 });
  const body = text ? String(text).trim().slice(0, 2000) : null;
  db.get()
    .prepare(
      `INSERT INTO reviews (item_id, item_type, user_id, overall, experience, value_for_money, price_level, text)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(item_id, user_id) DO UPDATE SET overall = excluded.overall, experience = excluded.experience,
         value_for_money = excluded.value_for_money, price_level = excluded.price_level, text = excluded.text,
         updated_at = datetime('now')`
    )
    .run(itemId, itemType, userId, o, clampInt(experience, 1, 10), clampInt(valueForMoney, 1, 10), clampInt(priceLevel, 0, 3), body);
  return forItems([itemId])[itemId];
}

function deleteReview(userId, itemId) {
  db.get().prepare('DELETE FROM reviews WHERE user_id = ? AND item_id = ?').run(userId, itemId);
}

/** Indice di popolarità 0–100 basato su dati oggettivi (non è un voto). */
function popularity(place, rating) {
  const links = place.sitelinks || 0;
  const visitors = place.visitorsPerYear || 0;
  let p = Math.log2(1 + links) * 9 + (visitors ? Math.log10(visitors) * 6 : 0) + Math.log2(1 + (rating?.count || 0)) * 6 + Math.log2(1 + (rating?.favorites || 0)) * 5;
  if (place.notability) p += place.notability;
  return Math.max(0, Math.min(100, Math.round(p)));
}

module.exports = { forItems, reviewsFor, upsertReview, deleteReview, aggregateRows, popularity };
