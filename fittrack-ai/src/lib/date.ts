import { format, parseISO, addDays, subDays, isToday, isYesterday } from "date-fns";
import { it } from "date-fns/locale";

/** Data locale in formato yyyy-MM-dd (il diario usa il giorno dell'utente, non UTC). */
export function toISODate(d: Date = new Date()): string {
  return format(d, "yyyy-MM-dd");
}

export function fromISODate(s: string): Date {
  return parseISO(s);
}

export function shiftISODate(s: string, days: number): string {
  const d = fromISODate(s);
  return toISODate(days >= 0 ? addDays(d, days) : subDays(d, -days));
}

export function prettyDate(s: string): string {
  const d = fromISODate(s);
  if (isToday(d)) return "Oggi";
  if (isYesterday(d)) return "Ieri";
  return format(d, "EEEE d MMMM", { locale: it });
}

export function shortDate(s: string): string {
  return format(fromISODate(s), "d MMM", { locale: it });
}

export function weekdayShort(s: string): string {
  return format(fromISODate(s), "EEE", { locale: it });
}

export function timeOf(iso: string): string {
  return format(new Date(iso), "HH:mm");
}

/** Elenco di date ISO dagli ultimi `days` giorni fino a `end` incluso. */
export function dateRange(end: string, days: number): string[] {
  return Array.from({ length: days }, (_, i) => shiftISODate(end, i - days + 1));
}
