export function fmtMoney(value: number, currency = 'EUR', opts: { compact?: boolean; sign?: boolean; decimals?: number } = {}): string {
  const { compact, sign, decimals } = opts;
  const f = new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency,
    notation: compact ? 'compact' : 'standard',
    minimumFractionDigits: decimals ?? (compact ? 0 : 2),
    maximumFractionDigits: decimals ?? (compact ? 1 : 2),
    signDisplay: sign ? 'exceptZero' : 'auto',
  });
  return f.format(Number.isFinite(value) ? value : 0);
}

export function fmtPct(value: number, decimals = 1, sign = false): string {
  return new Intl.NumberFormat('it-IT', {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    signDisplay: sign ? 'exceptZero' : 'auto',
  }).format(Number.isFinite(value) ? value : 0);
}

export function fmtNum(value: number, decimals = 2): string {
  return new Intl.NumberFormat('it-IT', { maximumFractionDigits: decimals }).format(value);
}

const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

export function fmtDate(iso: string, style: 'short' | 'long' = 'short'): string {
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
  if (Number.isNaN(d.getTime())) return iso;
  if (style === 'short') return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function fmtMonth(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${String(y).slice(2)}`;
}
