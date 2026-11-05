import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { importPKCS8, SignJWT } from 'jose';
import { z } from 'zod';
import { EncryptedJsonStore } from './crypto';

/**
 * Integrazione Open Banking PSD2 (AIS, sola lettura) tramite Enable Banking,
 * prestatore di servizi di informazione sui conti autorizzato.
 *
 * Flusso:
 *  1. POST /auth → Enable Banking restituisce l'URL della banca (es. Revolut)
 *  2. L'utente si autentica SOLO sulla banca (SCA) e approva l'accesso in lettura
 *  3. La banca reindirizza al nostro redirect URL con ?code&state
 *  4. POST /session scambia il code con una sessione (validità max ~180 giorni)
 *  5. POST /sync legge saldi e movimenti; DELETE /session revoca il consenso
 *
 * Nessuna credenziale bancaria transita da questo server. Nessuna API di pagamento
 * (PIS) viene usata: l'app non può eseguire bonifici né ordini.
 */

const API = 'https://api.enablebanking.com';

interface StoredSession {
  sessionId: string;
  aspsp: { name: string; country: string };
  validUntil: string;
  createdAt: string;
  accounts: string[];
}

export function enableBankingRouter() {
  const appId = process.env.ENABLE_BANKING_APP_ID;
  const keyPath = process.env.ENABLE_BANKING_PRIVATE_KEY_PATH;
  const redirectUrl = process.env.ENABLE_BANKING_REDIRECT_URL ?? `${process.env.PUBLIC_APP_URL ?? 'http://localhost:5173'}/connessioni/callback`;
  let privateKeyPem: string | undefined;
  try {
    privateKeyPem = keyPath ? readFileSync(keyPath, 'utf8') : undefined;
  } catch {
    console.warn(`[enablebanking] chiave privata non leggibile: ${keyPath}`);
  }
  const configured = !!(appId && privateKeyPem);
  const store = new EncryptedJsonStore<{ sessions: StoredSession[] }>('./data/ob-sessions.enc', process.env.SERVER_ENCRYPTION_KEY, { sessions: [] });
  const pendingStates = new Map<string, { aspsp: { name: string; country: string }; createdAt: number }>();

  let cachedJwt: { token: string; exp: number } | undefined;
  async function jwt(): Promise<string> {
    if (!configured) throw Object.assign(new Error('Enable Banking non configurato sul server (vedi .env.example)'), { status: 503 });
    const now = Math.floor(Date.now() / 1000);
    if (cachedJwt && cachedJwt.exp - 60 > now) return cachedJwt.token;
    const key = await importPKCS8(privateKeyPem!, 'RS256');
    const exp = now + 3600;
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: appId! })
      .setIssuer('enablebanking.com')
      .setAudience('api.enablebanking.com')
      .setIssuedAt(now)
      .setExpirationTime(exp)
      .sign(key);
    cachedJwt = { token, exp };
    return token;
  }

  async function eb<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${await jwt()}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
    const text = await res.text();
    const body = text ? JSON.parse(text) : {};
    if (!res.ok) throw Object.assign(new Error(body.message ?? body.error ?? `Enable Banking ${res.status}`), { status: res.status === 401 ? 502 : res.status });
    return body as T;
  }

  const r = Router();
  r.get('/status', (_req, res) => res.json({ configured, redirectUrl }));

  r.get('/aspsps', async (req, res, next) => {
    try {
      const country = z.string().regex(/^[A-Z]{2}$/).parse(String(req.query.country ?? 'IT').toUpperCase());
      const body = await eb<{ aspsps: unknown[] }>(`/aspsps?country=${country}&psu_type=personal`);
      res.json(body);
    } catch (e) {
      next(e);
    }
  });

  r.post('/auth', async (req, res, next) => {
    try {
      const { aspsp } = z.object({ aspsp: z.object({ name: z.string().min(1).max(120), country: z.string().regex(/^[A-Z]{2}$/) }) }).parse(req.body);
      const state = randomUUID();
      pendingStates.set(state, { aspsp, createdAt: Date.now() });
      // validità richiesta: 180 giorni (la banca può concedere meno)
      const validUntil = new Date(Date.now() + 180 * 86_400_000).toISOString();
      const body = await eb<{ url: string }>('/auth', {
        method: 'POST',
        body: JSON.stringify({ access: { valid_until: validUntil }, aspsp, state, redirect_url: redirectUrl, psu_type: 'personal' }),
      });
      res.json({ url: body.url, state });
    } catch (e) {
      next(e);
    }
  });

  r.post('/session', async (req, res, next) => {
    try {
      const { code, state } = z.object({ code: z.string().min(4).max(500), state: z.string().uuid() }).parse(req.body);
      const pending = pendingStates.get(state);
      // protezione CSRF: accettiamo solo state generati da noi negli ultimi 30 minuti
      if (!pending || Date.now() - pending.createdAt > 30 * 60_000) throw Object.assign(new Error('Richiesta di collegamento scaduta o non valida, riprova.'), { status: 400 });
      pendingStates.delete(state);
      const body = await eb<{ session_id: string; accounts: { uid: string; name?: string; currency?: string; account_id?: { iban?: string }; product?: string; cash_account_type?: string }[]; access: { valid_until: string } }>('/sessions', { method: 'POST', body: JSON.stringify({ code }) });
      const data = await store.read();
      data.sessions.push({ sessionId: body.session_id, aspsp: pending.aspsp, validUntil: body.access?.valid_until, createdAt: new Date().toISOString(), accounts: body.accounts.map((a) => a.uid) });
      await store.write(data);
      res.json({
        sessionId: body.session_id,
        aspsp: pending.aspsp,
        validUntil: body.access?.valid_until,
        accounts: body.accounts.map((a) => ({ uid: a.uid, name: a.name, currency: a.currency, iban: a.account_id?.iban, product: a.product, cash_account_type: a.cash_account_type })),
      });
    } catch (e) {
      next(e);
    }
  });

  r.post('/sync', async (req, res, next) => {
    try {
      const { sessionId, accountUids, dateFrom } = z.object({ sessionId: z.string().min(4), accountUids: z.array(z.string()).max(30), dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).parse(req.body);
      const data = await store.read();
      const session = data.sessions.find((s) => s.sessionId === sessionId);
      if (!session) throw Object.assign(new Error('Sessione sconosciuta: ricollega il conto.'), { status: 404 });
      const from = dateFrom ?? new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
      const accounts = [];
      for (const uid of accountUids.filter((u) => session.accounts.includes(u))) {
        try {
          const balances = await eb<{ balances: unknown[] }>(`/accounts/${encodeURIComponent(uid)}/balances`);
          const transactions: unknown[] = [];
          let continuation: string | undefined;
          let pages = 0;
          do {
            const qs = new URLSearchParams({ date_from: from, ...(continuation ? { continuation_key: continuation } : {}) });
            const page = await eb<{ transactions: unknown[]; continuation_key?: string }>(`/accounts/${encodeURIComponent(uid)}/transactions?${qs}`);
            transactions.push(...(page.transactions ?? []));
            continuation = page.continuation_key || undefined;
          } while (continuation && ++pages < 50);
          accounts.push({ uid, balances: balances.balances ?? [], transactions });
        } catch (e) {
          accounts.push({ uid, balances: [], transactions: [], error: (e as Error).message });
        }
      }
      res.json({ accounts });
    } catch (e) {
      next(e);
    }
  });

  r.delete('/session/:id', async (req, res, next) => {
    try {
      const id = req.params.id;
      const data = await store.read();
      if (data.sessions.some((s) => s.sessionId === id)) {
        // revoca il consenso presso l'aggregatore (e quindi la banca)
        await eb(`/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch((e) => console.warn('[enablebanking] revoca:', e.message));
      }
      data.sessions = data.sessions.filter((s) => s.sessionId !== id);
      await store.write(data);
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  return { router: r, configured, redirectUrl };
}
