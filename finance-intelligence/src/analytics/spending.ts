import { CATEGORIES, type SpendingCategory, type Transaction } from '../domain/types';
import { normalizeMerchant } from '../domain/categories';
import { addDays, daysBetween, monthKey, monthRange, parseISO } from '../lib/dates';
import { mad, mean, median, round2, stdev, sum } from '../lib/stats';

export type Conv = (amount: number, currency: string) => number;

export interface Period {
  from: string; // inclusivo
  to: string; // inclusivo
  label: string;
}

export const inPeriod = (t: { date: string }, p: Period) => t.date >= p.from && t.date <= p.to;

/** Uscite di consumo (le spese vere): esclude trasferimenti tra conti propri, investimenti, cambi. */
export function isConsumption(t: Transaction): boolean {
  return t.kind === 'expense' || t.kind === 'refund';
}

/** Valore della spesa in valuta base, positivo per spese, negativo per rimborsi. */
export function spendValue(t: Transaction, conv: Conv): number {
  return -conv(t.amount, t.currency);
}

export function totalSpending(txs: Transaction[], conv: Conv, p?: Period): number {
  return round2(sum(txs.filter((t) => isConsumption(t) && (!p || inPeriod(t, p))).map((t) => spendValue(t, conv))));
}

export function totalIncome(txs: Transaction[], conv: Conv, p?: Period): number {
  return round2(sum(txs.filter((t) => t.kind === 'income' && (!p || inPeriod(t, p))).map((t) => conv(t.amount, t.currency))));
}

export interface MonthFlow {
  month: string;
  income: number;
  expenses: number;
  savings: number;
  savingsRate: number;
  investmentsNet: number;
  fees: number;
  passiveIncome: number;
}

export function monthlyFlows(txs: Transaction[], conv: Conv, endMonth: string, count: number): MonthFlow[] {
  const months = monthRange(endMonth, count);
  const idx = new Map(months.map((m, i) => [m, i]));
  const rows: MonthFlow[] = months.map((month) => ({ month, income: 0, expenses: 0, savings: 0, savingsRate: 0, investmentsNet: 0, fees: 0, passiveIncome: 0 }));
  for (const t of txs) {
    const i = idx.get(monthKey(t.date));
    if (i === undefined) continue;
    const v = conv(t.amount, t.currency);
    const r = rows[i];
    if (t.kind === 'income') r.income += v;
    else if (isConsumption(t)) r.expenses += -v;
    else if (t.kind === 'investment-buy' || t.kind === 'investment-sell') r.investmentsNet += -v;
    else if (t.kind === 'fee') r.fees += -v;
    else if (t.kind === 'dividend' || t.kind === 'interest' || t.kind === 'cashback') r.passiveIncome += v;
    if (t.fee) r.fees += conv(t.fee, t.currency);
  }
  for (const r of rows) {
    // Il risparmio considera solo entrate (lavoro + passive) meno consumi e commissioni.
    const inflow = r.income + r.passiveIncome;
    r.savings = round2(inflow - r.expenses - r.fees);
    r.savingsRate = inflow > 0 ? r.savings / inflow : 0;
    r.income = round2(r.income);
    r.expenses = round2(r.expenses);
    r.fees = round2(r.fees);
    r.investmentsNet = round2(r.investmentsNet);
    r.passiveIncome = round2(r.passiveIncome);
  }
  return rows;
}

export interface CategoryTotal {
  category: SpendingCategory;
  total: number;
  count: number;
  share: number;
  avgTicket: number;
}

export function categoryBreakdown(txs: Transaction[], conv: Conv, p: Period): CategoryTotal[] {
  const map = new Map<SpendingCategory, { total: number; count: number }>();
  for (const t of txs) {
    if (!isConsumption(t) || !inPeriod(t, p)) continue;
    const c = t.category ?? 'altro';
    const cur = map.get(c) ?? { total: 0, count: 0 };
    cur.total += spendValue(t, conv);
    if (t.kind === 'expense') cur.count++;
    map.set(c, cur);
  }
  const grand = sum([...map.values()].map((v) => v.total));
  return [...map.entries()]
    .map(([category, v]) => ({ category, total: round2(v.total), count: v.count, share: grand ? v.total / grand : 0, avgTicket: v.count ? round2(v.total / v.count) : 0 }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);
}

/** Matrice mese × categoria per i grafici impilati. */
export function categoryByMonth(txs: Transaction[], conv: Conv, endMonth: string, count: number) {
  const months = monthRange(endMonth, count);
  const rows = months.map((m) => Object.fromEntries([['month', m], ...CATEGORIES.map((c) => [c, 0])]) as Record<string, number | string>);
  const idx = new Map(months.map((m, i) => [m, i]));
  for (const t of txs) {
    if (!isConsumption(t)) continue;
    const i = idx.get(monthKey(t.date));
    if (i === undefined) continue;
    const c = t.category ?? 'altro';
    rows[i][c] = round2((rows[i][c] as number) + spendValue(t, conv));
  }
  return rows;
}

export interface CategoryDelta {
  category: SpendingCategory;
  current: number;
  previous: number;
  delta: number;
  deltaPct: number | null;
}

export function compareMonths(txs: Transaction[], conv: Conv, current: string, previous: string): CategoryDelta[] {
  const per = (m: string) => {
    const p: Period = { from: `${m}-01`, to: `${m}-31`, label: m };
    return new Map(categoryBreakdown(txs, conv, p).map((c) => [c.category, c.total]));
  };
  const a = per(current);
  const b = per(previous);
  return CATEGORIES.map((category) => {
    const cur = a.get(category) ?? 0;
    const prev = b.get(category) ?? 0;
    return { category, current: cur, previous: prev, delta: round2(cur - prev), deltaPct: prev > 0 ? (cur - prev) / prev : null };
  })
    .filter((d) => d.current || d.previous)
    .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
}

// ---------------------------------------------------------------------------
// Spese ricorrenti e abbonamenti
// ---------------------------------------------------------------------------

export type Cadence = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface RecurringItem {
  key: string;
  merchant: string;
  category: SpendingCategory;
  cadence: Cadence;
  avgAmount: number;
  lastAmount: number;
  monthlyCost: number;
  annualCost: number;
  occurrences: number;
  firstDate: string;
  lastDate: string;
  nextExpected: string;
  isSubscription: boolean;
  priceIncrease: number | null; // differenza % tra ultimo e primo addebito
  active: boolean; // ultimo addebito entro 1,5 cicli
  transactionIds: string[];
}

const CADENCES: { cadence: Cadence; days: number; tol: number; perMonth: number }[] = [
  { cadence: 'weekly', days: 7, tol: 2, perMonth: 52 / 12 },
  { cadence: 'monthly', days: 30.4, tol: 5, perMonth: 1 },
  { cadence: 'quarterly', days: 91, tol: 12, perMonth: 1 / 3 },
  { cadence: 'yearly', days: 365, tol: 25, perMonth: 1 / 12 },
];

const SERVICE_CLUSTERS: [string, RegExp][] = [
  ['streaming video', /netflix|disney|prime video|now tv|dazn|paramount|apple tv|infinity|timvision|discovery/i],
  ['musica', /spotify|apple music|deezer|tidal|youtube music|amazon music/i],
  ['cloud storage', /icloud|google one|dropbox|onedrive|pcloud/i],
  ['assistenti AI', /chatgpt|openai|claude|anthropic|gemini|perplexity|copilot/i],
  ['palestra', /palestra|\bgym\b|virgin active|mcfit|fitness|anytime fitness/i],
];

export function serviceCluster(merchant: string): string | null {
  for (const [name, re] of SERVICE_CLUSTERS) if (re.test(merchant)) return name;
  return null;
}

export function detectRecurring(txs: Transaction[], conv: Conv, asOf: string): RecurringItem[] {
  const groups = new Map<string, Transaction[]>();
  for (const t of txs) {
    if (t.kind !== 'expense') continue;
    const key = normalizeMerchant(t.merchant ?? t.description);
    if (!key) continue;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(t);
  }
  const out: RecurringItem[] = [];
  for (const [key, list] of groups) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    const gaps = sorted.slice(1).map((t, i) => daysBetween(sorted[i].date, t.date)).filter((g) => g > 0);
    if (!gaps.length) continue;
    const g = median(gaps);
    const c = CADENCES.find((x) => Math.abs(g - x.days) <= x.tol);
    if (!c) continue;
    // almeno il 70% degli intervalli deve rispettare la cadenza
    const regular = gaps.filter((x) => Math.abs(x - c.days) <= c.tol * 1.6).length / gaps.length;
    if (regular < 0.7) continue;
    if (c.cadence !== 'yearly' && sorted.length < 3) continue;
    const amounts = sorted.map((t) => spendValue(t, conv));
    const avg = mean(amounts);
    const cv = avg ? stdev(amounts) / avg : 1;
    if (cv > 0.35) continue; // importi troppo variabili: probabilmente abitudine, non ricorrenza
    const last = sorted[sorted.length - 1];
    const first = sorted[0];
    const category = last.category ?? 'altro';
    const lastAmount = amounts[amounts.length - 1];
    const firstAmount = amounts[0];
    const active = daysBetween(last.date, asOf) <= c.days * 1.5 + c.tol;
    out.push({
      key,
      merchant: last.merchant ?? last.description,
      category,
      cadence: c.cadence,
      avgAmount: round2(avg),
      lastAmount: round2(lastAmount),
      monthlyCost: round2(lastAmount * c.perMonth),
      annualCost: round2(lastAmount * c.perMonth * 12),
      occurrences: sorted.length,
      firstDate: first.date,
      lastDate: last.date,
      nextExpected: addDays(last.date, Math.round(c.days)),
      isSubscription: category === 'abbonamenti' || serviceCluster(last.merchant ?? last.description) !== null,
      priceIncrease: firstAmount > 0 && lastAmount > firstAmount * 1.02 ? (lastAmount - firstAmount) / firstAmount : null,
      active,
      transactionIds: sorted.map((t) => t.id),
    });
  }
  return out.sort((a, b) => b.annualCost - a.annualCost);
}

export interface ForgottenCandidate {
  item: RecurringItem;
  reasons: string[];
}

/**
 * "Abbonamenti dimenticati": non possiamo sapere se usi un servizio, quindi segnaliamo
 * solo indizi oggettivi e chiediamo conferma. Indizi: servizi doppi nella stessa
 * famiglia, aumenti di prezzo non notati, abbonamenti attivi da molto tempo.
 */
export function forgottenSubscriptions(rec: RecurringItem[], asOf: string, confirmedInUse: string[]): ForgottenCandidate[] {
  const subs = rec.filter((r) => r.isSubscription && r.active && !confirmedInUse.includes(r.key));
  const byCluster = new Map<string, RecurringItem[]>();
  for (const s of subs) {
    const cl = serviceCluster(s.merchant);
    if (cl) (byCluster.get(cl) ?? byCluster.set(cl, []).get(cl)!).push(s);
  }
  const out: ForgottenCandidate[] = [];
  for (const s of subs) {
    const reasons: string[] = [];
    const cl = serviceCluster(s.merchant);
    if (cl && (byCluster.get(cl)?.length ?? 0) > 1) reasons.push(`Hai più servizi di tipo "${cl}" attivi contemporaneamente`);
    if (s.priceIncrease && s.priceIncrease > 0.05) reasons.push(`Il prezzo è aumentato del ${Math.round(s.priceIncrease * 100)}% dal primo addebito`);
    if (s.cadence === 'yearly') reasons.push(`Rinnovo annuale previsto il ${s.nextExpected}: facile da dimenticare`);
    // l'anzianità da sola non è un indizio: la aggiungiamo solo come contesto
    if (reasons.length && daysBetween(s.firstDate, asOf) > 300) reasons.push('Attivo da oltre 10 mesi');
    if (reasons.length) out.push({ item: s, reasons });
  }
  return out.sort((a, b) => b.item.annualCost - a.item.annualCost);
}

// ---------------------------------------------------------------------------
// Spese insolite
// ---------------------------------------------------------------------------

export interface Anomaly {
  tx: Transaction;
  value: number;
  baseline: number;
  score: number;
  reason: string;
}

function percentile(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const sorted = [...xs].sort((x, y) => x - y);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))];
}

/**
 * Spese insolite: confronto con lo storico (precedente al periodo analizzato) dello stesso
 * esercente e della stessa categoria. Le spese ricorrenti note sono escluse.
 * `threshold` = z-score robusto minimo rispetto all'esercente.
 */
export function detectAnomalies(txs: Transaction[], conv: Conv, asOf: string, lookbackDays = 60, threshold = 3.5, recurringKeys: Set<string> = new Set()): Anomaly[] {
  const expenses = txs.filter((t) => t.kind === 'expense');
  const cutoff = addDays(asOf, -lookbackDays);
  const byCat = new Map<string, number[]>();
  const byMerchant = new Map<string, number[]>();
  for (const t of expenses) {
    if (t.date >= cutoff) continue;
    const v = spendValue(t, conv);
    const cat = t.category ?? 'altro';
    (byCat.get(cat) ?? byCat.set(cat, []).get(cat)!).push(v);
    const key = normalizeMerchant(t.merchant ?? t.description);
    (byMerchant.get(key) ?? byMerchant.set(key, []).get(key)!).push(v);
  }
  const out: Anomaly[] = [];
  for (const t of expenses) {
    if (t.date < cutoff || t.date > asOf) continue;
    const key = normalizeMerchant(t.merchant ?? t.description);
    if (recurringKeys.has(key)) continue;
    const v = spendValue(t, conv);
    if (v < 50) continue;
    const mh = byMerchant.get(key) ?? [];
    if (mh.length >= 5) {
      const m = median(mh);
      const d = mad(mh) * 1.4826 || m * 0.25 || 1;
      const z = (v - m) / d;
      if (z >= threshold && v > m * 2) out.push({ tx: t, value: round2(v), baseline: round2(m), score: z, reason: `Importo ${(v / m).toFixed(1)}× la tua spesa abituale presso questo esercente` });
      continue;
    }
    const hist = byCat.get(t.category ?? 'altro') ?? [];
    if (hist.length >= 10) {
      const p95 = percentile(hist, 0.95);
      if (v > p95 * 2 && v >= 100) {
        out.push({ tx: t, value: round2(v), baseline: round2(median(hist)), score: v / p95, reason: `Più del doppio delle tue spese più alte in ${t.category ?? 'questa categoria'} (95° percentile ${Math.round(p95)} €)` });
        continue;
      }
    }
    if (!mh.length && v >= 250) out.push({ tx: t, value: round2(v), baseline: 0, score: v / 250, reason: 'Primo pagamento elevato verso questo esercente' });
  }
  return out.sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// Abitudini di consumo
// ---------------------------------------------------------------------------

export interface Habits {
  byWeekday: { day: string; total: number; avg: number }[];
  weekendShare: number;
  microSpending: { count: number; total: number; monthlyAvg: number };
  deliveryMonthly: number;
  topMerchants: { merchant: string; total: number; count: number; category: SpendingCategory }[];
  avgDailySpend: number;
}

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

export function spendingHabits(txs: Transaction[], conv: Conv, p: Period): Habits {
  const ex = txs.filter((t) => t.kind === 'expense' && inPeriod(t, p));
  const days = Math.max(1, daysBetween(p.from, p.to) + 1);
  const weeks = days / 7;
  const months = days / 30.4;
  const wd = WEEKDAYS.map(() => 0);
  let micro = 0;
  let microCount = 0;
  let delivery = 0;
  const merchants = new Map<string, { merchant: string; total: number; count: number; category: SpendingCategory }>();
  for (const t of ex) {
    const v = spendValue(t, conv);
    wd[(parseISO(t.date).getDay() + 6) % 7] += v;
    if (v < 10 && t.category !== 'abbonamenti') {
      micro += v;
      microCount++;
    }
    if (/deliveroo|glovo|just ?eat|uber ?eats|wolt/i.test(t.description)) delivery += v;
    const k = normalizeMerchant(t.merchant ?? t.description);
    const m = merchants.get(k) ?? { merchant: t.merchant ?? t.description, total: 0, count: 0, category: t.category ?? 'altro' };
    m.total += v;
    m.count++;
    merchants.set(k, m);
  }
  const total = sum(wd);
  return {
    byWeekday: WEEKDAYS.map((day, i) => ({ day, total: round2(wd[i]), avg: round2(wd[i] / weeks) })),
    weekendShare: total ? (wd[5] + wd[6]) / total : 0,
    microSpending: { count: microCount, total: round2(micro), monthlyAvg: round2(micro / months) },
    deliveryMonthly: round2(delivery / months),
    topMerchants: [...merchants.values()].sort((a, b) => b.total - a.total).slice(0, 8).map((m) => ({ ...m, total: round2(m.total) })),
    avgDailySpend: round2(total / days),
  };
}

// ---------------------------------------------------------------------------
// Potenziale di risparmio (stime con ipotesi esplicite)
// ---------------------------------------------------------------------------

export interface SavingScenario {
  id: string;
  title: string;
  assumption: string;
  monthly: number;
  annual: number;
}

export function savingScenarios(txs: Transaction[], conv: Conv, p: Period, recurring: RecurringItem[], forgotten: ForgottenCandidate[]): SavingScenario[] {
  const months = Math.max(1, (daysBetween(p.from, p.to) + 1) / 30.4);
  const cats = new Map(categoryBreakdown(txs, conv, p).map((c) => [c.category, c.total / months]));
  const habits = spendingHabits(txs, conv, p);
  const out: SavingScenario[] = [];
  const add = (id: string, title: string, assumption: string, monthly: number) => {
    if (monthly >= 3) out.push({ id, title, assumption, monthly: round2(monthly), annual: round2(monthly * 12) });
  };
  add('restaurants', 'Ridurre ristoranti e bar del 20%', `Media attuale ${Math.round(cats.get('ristoranti') ?? 0)} €/mese; ipotesi: -20% sostituendo 1 uscita su 5 con un pasto a casa (costo stimato nullo).`, (cats.get('ristoranti') ?? 0) * 0.2);
  add('delivery', 'Dimezzare il food delivery', `Media delivery ${Math.round(habits.deliveryMonthly)} €/mese; ipotesi: -50% degli ordini, al netto di un 30% di spesa alimentare sostitutiva.`, habits.deliveryMonthly * 0.5 * 0.7);
  add('micro', 'Ridurre le micro-spese (< 10 €) del 30%', `${habits.microSpending.count} micro-acquisti nel periodo, media ${Math.round(habits.microSpending.monthlyAvg)} €/mese.`, habits.microSpending.monthlyAvg * 0.3);
  const forgottenMonthly = sum(forgotten.map((f) => f.item.monthlyCost));
  add('forgotten', 'Disdire gli abbonamenti segnalati da verificare', `Somma degli abbonamenti con indizi di non utilizzo o duplicazione (${forgotten.length}). Risparmio reale solo se confermi di non usarli.`, forgottenMonthly);
  add('shopping', 'Shopping: regola delle 48 ore', `Media shopping ${Math.round(cats.get('shopping') ?? 0)} €/mese; ipotesi: -15% degli acquisti d'impulso.`, (cats.get('shopping') ?? 0) * 0.15);
  const subsMonthly = sum(recurring.filter((r) => r.isSubscription && r.active && r.cadence === 'monthly').map((r) => r.monthlyCost));
  add('annual-billing', 'Passare a fatturazione annuale', `Abbonamenti mensili attivi: ${Math.round(subsMonthly)} €/mese; ipotesi: sconto medio del 15% sui piani annuali (variabile per servizio).`, subsMonthly * 0.15);
  return out.sort((a, b) => b.annual - a.annual);
}
