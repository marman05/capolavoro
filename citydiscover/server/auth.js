'use strict';
// Gestione utenti: password con scrypt, token firmati HMAC (validi 30 giorni).
const crypto = require('node:crypto');
const db = require('./db');

const TOKEN_DAYS = 30;

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function verifyPassword(pw, stored) {
  const [alg, salt, hash] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(hash, 'base64');
  const got = crypto.scryptSync(pw, Buffer.from(salt, 'base64'), expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(expected, got);
}

const b64u = (b) => Buffer.from(b).toString('base64url');

function sign(payload) {
  const body = b64u(JSON.stringify(payload));
  const mac = crypto.createHmac('sha256', db.authSecret()).update(body).digest('base64url');
  return `${body}.${mac}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  const expected = crypto.createHmac('sha256', db.authSecret()).update(body).digest('base64url');
  if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!p.exp || p.exp < Date.now()) return null;
    return p;
  } catch {
    return null;
  }
}

const err = (msg, status = 400) => Object.assign(new Error(msg), { status });

function publicUser(u) {
  return { id: u.id, email: u.email, name: u.name, createdAt: u.created_at };
}

function issue(u) {
  return { token: sign({ uid: u.id, exp: Date.now() + TOKEN_DAYS * 86400000 }), user: publicUser(u) };
}

function register({ email, password, name }) {
  email = String(email || '').trim().toLowerCase();
  name = String(name || '').trim().slice(0, 60);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw err('Email non valida');
  if (String(password || '').length < 8) throw err('La password deve avere almeno 8 caratteri');
  if (!name) throw err('Inserisci il tuo nome');
  const d = db.get();
  if (d.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw err('Email già registrata', 409);
  const info = d.prepare('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)').run(email, name, hashPassword(password));
  const user = d.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  d.prepare("INSERT INTO lists (user_id, name, is_favorites) VALUES (?, 'Preferiti', 1)").run(user.id);
  return issue(user);
}

function login({ email, password }) {
  const u = db.get().prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').trim().toLowerCase());
  if (!u || !verifyPassword(String(password || ''), u.password_hash)) throw err('Email o password errate', 401);
  return issue(u);
}

function userFromRequest(req) {
  const h = req.headers.authorization || '';
  const p = verifyToken(h.startsWith('Bearer ') ? h.slice(7) : null);
  if (!p) return null;
  const u = db.get().prepare('SELECT * FROM users WHERE id = ?').get(p.uid);
  return u ? publicUser(u) : null;
}

module.exports = { register, login, userFromRequest, hashPassword, verifyPassword, sign, verifyToken };
