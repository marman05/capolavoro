import type { Account, FinanceData, NetWorthSnapshot } from '../domain/types';
import { addDays, monthKey, startOfWeek, toISODate } from '../lib/dates';
import { round2, sum } from '../lib/stats';
import { holdingViews, portfolioSummary } from './portfolio';
import type { Conv, Period } from './spending';
import { totalIncome, totalSpending } from './spending';

export interface NetWorth {
  total: number;
  cash: number;
  investments: number;
  byProvider: { provider: string; cash: number; investments: number; total: number }[];
  byAccount: { account: Account; value: number }[];
  revolut: number;
  tradeRepublic: number;
  investedCapital: number;
  unrealized: number;
  realized: number;
  dividends: number;
  interest: number;
  estimated: boolean;
  missingBalances: string[];
}

/**
 * Patrimonio = liquidità (saldi dei conti) + valore di mercato delle posizioni.
 * Le posizioni non vengono mai sommate due volte: la liquidità del conto titoli
 * è un conto `brokerage-cash` separato e i trasferimenti tra conti propri
 * sono classificati come `transfer` (non entrate/uscite).
 */
export function computeNetWorth(data: FinanceData, conv: Conv): NetWorth {
  const cashAccounts = data.accounts.filter((a) => a.kind !== 'brokerage');
  const byAccount = cashAccounts.map((account) => ({ account, value: round2(conv(account.balance ?? 0, account.currency)) }));
  const views = holdingViews(data, conv);
  const ps = portfolioSummary(data, conv);
  const providers = new Map<string, { cash: number; investments: number }>();
  for (const { account, value } of byAccount) {
    const p = providers.get(account.provider) ?? { cash: 0, investments: 0 };
    p.cash += value;
    providers.set(account.provider, p);
  }
  for (const v of views) {
    const p = providers.get(v.provider) ?? { cash: 0, investments: 0 };
    p.investments += v.value;
    providers.set(v.provider, p);
  }
  const byProvider = [...providers.entries()].map(([provider, v]) => ({ provider, cash: round2(v.cash), investments: round2(v.investments), total: round2(v.cash + v.investments) }));
  const cash = round2(sum(byAccount.map((b) => b.value)));
  const investments = round2(sum(views.map((v) => v.value)));
  return {
    total: round2(cash + investments),
    cash,
    investments,
    byProvider,
    byAccount,
    revolut: byProvider.find((p) => p.provider === 'revolut')?.total ?? 0,
    tradeRepublic: byProvider.find((p) => p.provider === 'traderepublic')?.total ?? 0,
    investedCapital: ps.cost,
    unrealized: ps.unrealized,
    realized: ps.realized,
    dividends: ps.dividends,
    interest: round2(sum(data.transactions.filter((t) => t.kind === 'interest').map((t) => conv(t.amount, t.currency)))),
    estimated: views.some((v) => v.priceIsEstimate),
    missingBalances: data.accounts.filter((a) => a.kind !== 'brokerage' && a.balance === undefined).map((a) => a.name),
  };
}

export type Granularity = 'day' | 'week' | 'month' | 'year';

export interface HistoryPoint {
  date: string;
  cash: number;
  investments: number;
  total: number;
  reconstructed: boolean;
}

/**
 * Serie storica del patrimonio. Usa le istantanee salvate (fatti) e, dove mancano,
 * ricostruisce la liquidità all'indietro dai movimenti a partire dal saldo attuale
 * (stima: dipende dalla completezza dei movimenti importati). Gli investimenti
 * ricostruiti sono valorizzati al costo, perché non abbiamo i prezzi storici.
 */
export function netWorthHistory(data: FinanceData, conv: Conv, asOf: string, from: string): HistoryPoint[] {
  const nw = computeNetWorth(data, conv);
  const snapshots = new Map<string, NetWorthSnapshot>(data.snapshots.map((s) => [s.date, s]));
  // flussi giornalieri di liquidità e di capitale investito
  const cashDelta = new Map<string, number>();
  const investDelta = new Map<string, number>();
  const cashAccIds = new Set(data.accounts.filter((a) => a.kind !== 'brokerage').map((a) => a.id));
  for (const t of data.transactions) {
    if (cashAccIds.has(t.accountId)) {
      const v = conv(t.amount, t.currency) - (t.fee ? conv(t.fee, t.currency) : 0);
      cashDelta.set(t.date, (cashDelta.get(t.date) ?? 0) + v);
    }
    if (t.kind === 'investment-buy' || t.kind === 'investment-sell') {
      investDelta.set(t.date, (investDelta.get(t.date) ?? 0) - conv(t.amount, t.currency));
    }
  }
  const points: HistoryPoint[] = [];
  let cash = nw.cash;
  let invested = nw.investments;
  for (let d = asOf; d >= from; d = addDays(d, -1)) {
    const snap = snapshots.get(d);
    if (snap) {
      points.push({ date: d, cash: snap.cash, investments: snap.investments, total: snap.total, reconstructed: false });
      cash = snap.cash;
      invested = snap.investments;
    } else {
      points.push({ date: d, cash: round2(cash), investments: round2(Math.max(0, invested)), total: round2(cash + Math.max(0, invested)), reconstructed: d !== asOf });
    }
    cash -= cashDelta.get(d) ?? 0;
    invested -= investDelta.get(d) ?? 0;
  }
  return points.reverse();
}

export function aggregateHistory(points: HistoryPoint[], g: Granularity): HistoryPoint[] {
  if (g === 'day') return points;
  const key = (d: string) => (g === 'week' ? startOfWeek(d) : g === 'month' ? monthKey(d) : d.slice(0, 4));
  const map = new Map<string, HistoryPoint>();
  // ultimo valore del periodo (saldo di fine periodo)
  for (const p of points) map.set(key(p.date), { ...p, date: key(p.date), reconstructed: map.get(key(p.date))?.reconstructed || p.reconstructed });
  return [...map.values()];
}

export function periodPresets(asOf: string): Record<string, Period> {
  const d = new Date(asOf + 'T00:00:00');
  const firstOfMonth = toISODate(new Date(d.getFullYear(), d.getMonth(), 1));
  const prevMonthStart = toISODate(new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const prevMonthEnd = toISODate(new Date(d.getFullYear(), d.getMonth(), 0));
  return {
    '1M': { from: addDays(asOf, -30), to: asOf, label: 'Ultimi 30 giorni' },
    MTD: { from: firstOfMonth, to: asOf, label: 'Mese corrente' },
    PM: { from: prevMonthStart, to: prevMonthEnd, label: 'Mese precedente' },
    '3M': { from: addDays(asOf, -91), to: asOf, label: 'Ultimi 3 mesi' },
    '6M': { from: addDays(asOf, -182), to: asOf, label: 'Ultimi 6 mesi' },
    YTD: { from: `${asOf.slice(0, 4)}-01-01`, to: asOf, label: 'Da inizio anno' },
    '1Y': { from: addDays(asOf, -365), to: asOf, label: 'Ultimi 12 mesi' },
    ALL: { from: '1970-01-01', to: asOf, label: 'Tutto lo storico' },
  };
}

export function periodFlows(data: FinanceData, conv: Conv, p: Period) {
  const income = totalIncome(data.transactions, conv, p);
  const expenses = totalSpending(data.transactions, conv, p);
  return { income, expenses, net: round2(income - expenses) };
}

/** Data di riferimento: ultima data con dati (evita periodi "vuoti" con dati importati in passato). */
export function dataAsOf(data: FinanceData): string {
  const todayIso = toISODate(new Date());
  const last = data.transactions.reduce((m, t) => (t.date > m ? t.date : m), '');
  if (!last) return todayIso;
  return last > todayIso ? todayIso : data.isDemo ? last : todayIso;
}

export function dataCoverage(data: FinanceData) {
  const dates = data.transactions.map((t) => t.date).sort();
  return { first: dates[0], last: dates[dates.length - 1], count: dates.length };
}
