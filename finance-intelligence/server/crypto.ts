import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Store cifrato a riposo (AES-256-GCM) per le sole sessioni Open Banking.
 * Il server NON salva movimenti o saldi: li inoltra al browser, che li cifra nella propria cassaforte.
 */
export class EncryptedJsonStore<T> {
  private key: Buffer;
  constructor(private path: string, keyB64: string | undefined, private fallback: T) {
    if (!keyB64) {
      // chiave effimera: le sessioni non sopravvivono al riavvio, ma nulla finisce in chiaro su disco
      this.key = randomBytes(32);
      console.warn('[security] SERVER_ENCRYPTION_KEY non impostata: uso una chiave temporanea (le sessioni andranno perse al riavvio).');
    } else {
      this.key = Buffer.from(keyB64, 'base64');
      if (this.key.length !== 32) throw new Error('SERVER_ENCRYPTION_KEY deve essere di 32 byte in base64');
    }
  }

  async read(): Promise<T> {
    try {
      const raw = await readFile(this.path);
      const iv = raw.subarray(0, 12);
      const tag = raw.subarray(12, 28);
      const ct = raw.subarray(28);
      const d = createDecipheriv('aes-256-gcm', this.key, iv);
      d.setAuthTag(tag);
      return JSON.parse(Buffer.concat([d.update(ct), d.final()]).toString('utf8')) as T;
    } catch {
      return structuredClone(this.fallback);
    }
  }

  async write(value: T): Promise<void> {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.key, iv);
    const ct = Buffer.concat([c.update(JSON.stringify(value), 'utf8'), c.final()]);
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, Buffer.concat([iv, c.getAuthTag(), ct]), { mode: 0o600 });
  }
}
