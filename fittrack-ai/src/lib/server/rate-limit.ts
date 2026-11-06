import "server-only";

// Rate limiter in memoria (per istanza). Sufficiente per proteggere le API costose
// da abusi accidentali; per deploy multi-istanza usare un archivio condiviso.
const buckets = new Map<string, { count: number; reset: number }>();

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return { ok: true, remaining: limit - 1 };
  }
  if (b.count >= limit) return { ok: false, remaining: 0 };
  b.count++;
  return { ok: true, remaining: limit - b.count };
}
