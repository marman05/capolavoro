export const DAY = 86_400_000;

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseISO(iso: string): Date {
  return new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function addDays(iso: string, n: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function addMonths(iso: string, n: number): string {
  const d = parseISO(iso);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toISODate(d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / DAY);
}

export function monthRange(endMonth: string, count: number): string[] {
  const out: string[] = [];
  const [y, m] = endMonth.split('-').map(Number);
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

export function today(): string {
  return toISODate(new Date());
}

export function startOfWeek(iso: string): string {
  const d = parseISO(iso);
  const dow = (d.getDay() + 6) % 7; // lunedì = 0
  d.setDate(d.getDate() - dow);
  return toISODate(d);
}
