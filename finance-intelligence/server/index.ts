import 'dotenv/config';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { aiRouter } from './ai';
import { enableBankingRouter } from './enablebanking';

const app = express();
const PORT = Number(process.env.PORT ?? 8787);
const TOKEN = process.env.APP_ACCESS_TOKEN;

app.disable('x-powered-by');
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'https://api.frankfurter.app'],
        manifestSrc: ["'self'"],
        workerSrc: ["'self'", 'blob:'],
        frameAncestors: ["'none'"],
      },
    },
    referrerPolicy: { policy: 'no-referrer' },
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use('/api', rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false }));
app.use('/api/ai', rateLimit({ windowMs: 60_000, limit: 15 }));

// Autenticazione opzionale dell'API locale (consigliata se il server non è solo su localhost)
app.use('/api', (req, res, next) => {
  if (!TOKEN || req.path === '/status') return next();
  const got = Buffer.from((req.headers.authorization ?? '').replace(/^Bearer /, ''));
  const want = Buffer.from(TOKEN);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return res.status(401).json({ error: 'Token di accesso non valido' });
  next();
});

const ob = enableBankingRouter();
const ai = aiRouter();
app.use('/api/ob', ob.router);
app.use('/api/ai', ai.router);

// Tassi di cambio di riferimento BCE (fonte pubblica, senza chiave) con cache di 6 ore
let fxCache: { at: number; body: unknown } | undefined;
app.get('/api/fx/latest', async (_req, res, next) => {
  try {
    if (fxCache && Date.now() - fxCache.at < 6 * 3600_000) return res.json(fxCache.body);
    const r = await fetch('https://api.frankfurter.app/latest?from=EUR');
    if (!r.ok) throw Object.assign(new Error('Servizio tassi BCE non raggiungibile'), { status: 502 });
    const j = (await r.json()) as { date: string; rates: Record<string, number> };
    fxCache = { at: Date.now(), body: { date: j.date, rates: j.rates, source: 'BCE via frankfurter.app' } };
    res.json(fxCache.body);
  } catch (e) {
    next(e);
  }
});

app.get('/api/status', (_req, res) => {
  res.json({ ok: true, enableBanking: { configured: ob.configured, redirectUrl: ob.redirectUrl }, ai: { configured: ai.configured, model: ai.model }, authRequired: !!TOKEN });
});

// In produzione serve il frontend compilato
const dist = resolve('dist');
if (process.env.NODE_ENV === 'production' && existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(resolve(dist, 'index.html')));
}

app.use((err: Error & { status?: number; issues?: unknown }, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.issues ? 400 : (err.status ?? 500);
  if (status >= 500) console.error('[api]', err);
  res.status(status).json({ error: err.issues ? 'Parametri non validi' : err.message });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`API in ascolto su http://127.0.0.1:${PORT}`);
  console.log(`  Open Banking (Enable Banking): ${ob.configured ? 'configurato' : 'non configurato'}`);
  console.log(`  Assistente AI: ${ai.configured ? `configurato (${ai.model})` : 'non configurato'}`);
});
