/**
 * Cassaforte locale cifrata.
 *
 * - Chiave derivata dalla passphrase con PBKDF2-SHA256 (600.000 iterazioni, salt casuale).
 * - Dati cifrati con AES-256-GCM (IV casuale a ogni salvataggio, integrità autenticata).
 * - La passphrase e la chiave non vengono mai salvate: la chiave resta solo in memoria
 *   (CryptoKey non estraibile) finché l'app è sbloccata.
 * - Persistenza in IndexedDB; nessun dato finanziario lascia il dispositivo salvo
 *   richiesta esplicita (sincronizzazione Open Banking o assistente AI con consenso).
 */

const DB_NAME = 'finance-intelligence';
const STORE = 'vault';
const KEY = 'data';
const ITERATIONS = 600_000;

interface Envelope {
  v: 1;
  salt: string;
  iv: string;
  ct: string;
  iterations: number;
  updatedAt: string;
}

function b64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export class Vault {
  private constructor(private key: CryptoKey, private salt: Uint8Array) {}

  static async exists(): Promise<boolean> {
    return !!(await idbGet<Envelope>(KEY));
  }

  static async create(passphrase: string): Promise<Vault> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    return new Vault(await deriveKey(passphrase, salt, ITERATIONS), salt);
  }

  /** Sblocca la cassaforte: la decifratura fallisce (AES-GCM) se la passphrase è errata. */
  static async unlock<T>(passphrase: string): Promise<{ vault: Vault; data: T }> {
    const env = await idbGet<Envelope>(KEY);
    if (!env) throw new Error('Nessun dato salvato');
    const salt = unb64(env.salt);
    const key = await deriveKey(passphrase, salt, env.iterations);
    try {
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(env.iv) as BufferSource }, key, unb64(env.ct) as BufferSource);
      return { vault: new Vault(key, salt), data: JSON.parse(new TextDecoder().decode(pt)) as T };
    } catch {
      throw new Error('Passphrase non corretta');
    }
  }

  async save(data: unknown): Promise<void> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, this.key, new TextEncoder().encode(JSON.stringify(data)));
    const env: Envelope = { v: 1, salt: b64(this.salt), iv: b64(iv), ct: b64(ct), iterations: ITERATIONS, updatedAt: new Date().toISOString() };
    await idbSet(KEY, env);
  }

  static async destroy(): Promise<void> {
    await idbDelete(KEY);
  }
}
