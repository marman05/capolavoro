'use strict';
/*
 * Parser del formato opening_hours di OpenStreetMap per i casi più diffusi:
 *   "24/7", "Mo-Fr 09:00-18:00; Sa 10:00-13:00,15:00-19:00; Su off",
 *   "Tu-Su 09:30-19:30", "09:00-20:00", "Mo,We,Fr 08:00-12:00", "22:00-03:00".
 * Regole non supportate (festività PH, mesi, sunrise, settimane...) rendono il risultato
 * "sconosciuto" invece di inventare un orario.
 */
const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const DAY_IT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

function parseTime(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 48 || min > 59) return null;
  return h * 60 + min;
}

function parseDays(spec) {
  const days = new Set();
  for (const part of spec.split(',')) {
    const p = part.trim();
    const range = /^(Mo|Tu|We|Th|Fr|Sa|Su)\s*-\s*(Mo|Tu|We|Th|Fr|Sa|Su)$/.exec(p);
    if (range) {
      let i = DAYS.indexOf(range[1]);
      const end = DAYS.indexOf(range[2]);
      for (let n = 0; n < 7; n++) {
        days.add(i);
        if (i === end) break;
        i = (i + 1) % 7;
      }
    } else if (DAYS.includes(p)) {
      days.add(DAYS.indexOf(p));
    } else {
      return null;
    }
  }
  return days;
}

/** Restituisce { week: Array(7) di intervalli [start,end] in minuti, complete } oppure null. */
function parse(value) {
  if (!value || typeof value !== 'string') return null;
  const v = value.trim();
  if (v === '24/7') return { week: Array.from({ length: 7 }, () => [[0, 1440]]), always: true };
  const week = Array.from({ length: 7 }, () => null);
  const rules = v.split(';').map((s) => s.trim()).filter(Boolean);
  if (!rules.length) return null;
  for (const rule of rules) {
    // es. "Mo-Fr 09:00-18:00" | "Su off" | "09:00-18:00"
    const m = /^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:\s*-\s*(?:Mo|Tu|We|Th|Fr|Sa|Su))?\s*,?\s*)+)?\s*(.*)$/.exec(rule);
    if (!m) return null;
    const daySpec = (m[1] || '').trim().replace(/,$/, '');
    const timeSpec = m[2].trim();
    const days = daySpec ? parseDays(daySpec) : new Set([0, 1, 2, 3, 4, 5, 6]);
    if (!days) return null;
    let intervals;
    if (/^(off|closed)$/i.test(timeSpec)) {
      intervals = [];
    } else {
      intervals = [];
      for (const span of timeSpec.split(',')) {
        const [a, b] = span.split('-');
        if (b === undefined) return null;
        const s = parseTime(a);
        let e = parseTime(b.replace('+', ''));
        if (s === null || e === null) return null;
        if (e <= s) e += 1440; // oltre la mezzanotte
        intervals.push([s, e]);
      }
    }
    for (const d of days) week[d] = intervals;
  }
  return { week, always: false };
}

const dayIndex = (date) => (date.getUTCDay() + 6) % 7; // 0 = lunedì

/**
 * true = aperto, false = chiuso, null = non determinabile.
 * `date` è un "orario di parete": i campi UTC rappresentano l'ora locale della città.
 */
function isOpenAt(value, date) {
  const p = typeof value === 'string' ? parse(value) : value;
  if (!p) return null;
  if (p.always) return true;
  const mins = date.getUTCHours() * 60 + date.getUTCMinutes();
  const d = dayIndex(date);
  const today = p.week[d];
  const yesterday = p.week[(d + 6) % 7];
  if (today === null && yesterday === null) return null;
  if (today && today.some(([s, e]) => mins >= s && mins < e)) return true;
  if (yesterday && yesterday.some(([, e]) => e > 1440 && mins < e - 1440)) return true;
  return today === null ? null : false;
}

/** Intervalli di apertura del giorno indicato (minuti) oppure null se ignoti. */
function intervalsOn(value, date) {
  const p = typeof value === 'string' ? parse(value) : value;
  if (!p) return null;
  return p.week[dayIndex(date)];
}

const fmt = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Tabella leggibile in italiano, es. [{ day: 'Lun', hours: '09:00–18:00' }]. */
function describe(value) {
  const p = parse(value);
  if (!p) return null;
  return p.week.map((iv, i) => ({
    day: DAY_IT[i],
    hours: iv === null ? 'n.d.' : iv.length === 0 ? 'Chiuso' : iv.map(([s, e]) => `${fmt(s)}–${fmt(e)}`).join(', '),
  }));
}

module.exports = { parse, isOpenAt, intervalsOn, describe, fmt };
