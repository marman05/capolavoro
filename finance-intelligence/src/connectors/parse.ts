/** Utility di parsing robuste per file esportati da banche/broker (formati IT/DE/EN). */

export function parseAmount(raw: unknown): number | undefined {
  if (raw === null || raw === undefined || raw === '') return undefined;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : undefined;
  let s = String(raw).trim().replace(/[€$£\s ]|EUR|USD|GBP|CHF/gi, '');
  if (!s) return undefined;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  if (s.endsWith('-')) {
    neg = true;
    s = s.slice(0, -1);
  }
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.'); // 1.234,56
  else if (lastDot > lastComma && lastComma !== -1) s = s.replace(/,/g, ''); // 1,234.56
  else if (lastComma !== -1 && lastDot === -1) s = s.replace(',', '.');
  // "1.234" senza decimali in formato europeo (3 cifre dopo il punto) → migliaia
  else if (lastDot !== -1 && /^\-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  if (!Number.isFinite(n)) return undefined;
  return neg ? -Math.abs(n) : n;
}

export function parseDate(raw: unknown): string | undefined {
  if (raw === null || raw === undefined || raw === '') return undefined;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? undefined : raw.toISOString().slice(0, 10);
  if (typeof raw === 'number' && raw > 20000 && raw < 80000) {
    // numero seriale Excel
    const d = new Date(Date.UTC(1899, 11, 30) + raw * 86_400_000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(raw).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  const MONTHS: Record<string, string> = { gen: '01', jan: '01', feb: '02', mar: '03', mär: '03', apr: '04', mag: '05', may: '05', mai: '05', giu: '06', jun: '06', lug: '07', jul: '07', ago: '08', aug: '08', set: '09', sep: '09', ott: '10', oct: '10', okt: '10', nov: '11', dic: '12', dec: '12', dez: '12' };
  m = s.toLowerCase().match(/^(\d{1,2})\.?\s+([a-zäè]{3})[a-zäè]*\.?\s+(\d{4})/);
  if (m && MONTHS[m[2]]) return `${m[3]}-${MONTHS[m[2]]}-${m[1].padStart(2, '0')}`;
  return undefined;
}

export const norm = (h: string) =>
  h
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Trova la prima colonna il cui nome normalizzato corrisponde a uno dei sinonimi. */
export function findColumn(headers: string[], synonyms: string[]): string | undefined {
  const normalized = headers.map((h) => [h, norm(h)] as const);
  for (const syn of synonyms) {
    const hit = normalized.find(([, n]) => n === syn);
    if (hit) return hit[0];
  }
  for (const syn of synonyms) {
    const hit = normalized.find(([, n]) => n.includes(syn));
    if (hit) return hit[0];
  }
  return undefined;
}

export type Row = Record<string, unknown>;

export function rowsFromMatrix(matrix: unknown[][]): { headers: string[]; rows: Row[] } {
  // individua la riga d'intestazione: la prima con almeno 3 celle testuali non vuote
  const headerIdx = matrix.findIndex((r) => r.filter((c) => typeof c === 'string' && c.trim()).length >= 3);
  if (headerIdx < 0) return { headers: [], rows: [] };
  const headers = matrix[headerIdx].map((c, i) => (String(c ?? '').trim() || `col${i + 1}`));
  const rows = matrix
    .slice(headerIdx + 1)
    .filter((r) => r.some((c) => c !== null && c !== undefined && String(c).trim() !== ''))
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
  return { headers, rows };
}

export const ISIN_RE = /\b([A-Z]{2}[A-Z0-9]{9}\d)\b/;
