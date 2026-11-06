'use strict';
// Database SQLite (modulo integrato node:sqlite, nessuna dipendenza nativa).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');

let db;

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Cache delle risposte delle API esterne, con data di aggiornamento e scadenza.
CREATE TABLE IF NOT EXISTS api_cache (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  fetched_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS cities (
  id TEXT PRIMARY KEY,           -- es. "relation/44915"
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  country TEXT,
  country_code TEXT,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  bbox TEXT,                     -- JSON [south, north, west, east]
  last_searched_at INTEGER NOT NULL,
  search_count INTEGER NOT NULL DEFAULT 0
);

-- Luoghi normalizzati (fonte: OpenStreetMap), indicizzati per ricerca full-text.
CREATE TABLE IF NOT EXISTS places (
  id TEXT PRIMARY KEY,           -- es. "node/123"
  city_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  data TEXT NOT NULL,            -- JSON con tutti i dettagli
  notability INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS places_city ON places(city_id, category);

CREATE VIRTUAL TABLE IF NOT EXISTS places_fts USING fts5(
  id UNINDEXED, name, category, description, tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY,
  item_id TEXT NOT NULL,         -- id luogo ("node/1") o evento ("tm:abc")
  item_type TEXT NOT NULL CHECK (item_type IN ('place','event')),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  overall INTEGER NOT NULL CHECK (overall BETWEEN 1 AND 10),
  experience INTEGER CHECK (experience BETWEEN 1 AND 10),
  value_for_money INTEGER CHECK (value_for_money BETWEEN 1 AND 10),
  price_level INTEGER CHECK (price_level BETWEEN 0 AND 3), -- 0 gratuito … 3 costoso (segnalato dall'utente)
  text TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (item_id, user_id)
);
CREATE INDEX IF NOT EXISTS reviews_item ON reviews(item_id);

CREATE TABLE IF NOT EXISTS lists (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_favorites INTEGER NOT NULL DEFAULT 0,
  share_token TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS list_items (
  list_id INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  item_type TEXT NOT NULL,
  snapshot TEXT NOT NULL,        -- JSON minimo (nome, categoria, coordinate, foto)
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (list_id, item_id)
);
`;

function open(file = config.dbFile) {
  if (db) return db;
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  db = new DatabaseSync(file);
  db.exec(SCHEMA);
  return db;
}

function get() {
  return db || open();
}

function close() {
  if (db) db.close();
  db = undefined;
}

/** Segreto per firmare i token di sessione: da env, altrimenti generato e salvato una volta. */
function authSecret() {
  if (config.authSecret) return config.authSecret;
  const d = get();
  const row = d.prepare("SELECT value FROM meta WHERE key = 'auth_secret'").get();
  if (row) return row.value;
  const secret = crypto.randomBytes(32).toString('hex');
  d.prepare("INSERT INTO meta (key, value) VALUES ('auth_secret', ?)").run(secret);
  return secret;
}

function transaction(fn) {
  const d = get();
  d.exec('BEGIN');
  try {
    const r = fn(d);
    d.exec('COMMIT');
    return r;
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }
}

module.exports = { open, get, close, authSecret, transaction };
