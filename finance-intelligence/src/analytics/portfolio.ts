import type { Benchmark, FinanceData, Holding, InstrumentMeta, PricePoint, Transaction } from '../domain/types';
import { monthKey, monthRange } from '../lib/dates';
import { round2, sum } from '../lib/stats';
import type { Conv, Period } from './spending';
import { inPeriod } from './spending';

export interface HoldingView extends Holding {
  value: number; // valuta base
  cost: number;
  pnl: number;
  pnlPct: number;
  weight: number;
  priceIsEstimate: boolean;
  meta?: InstrumentMeta;
}

export function holdingViews(data: FinanceData, conv: Conv): HoldingView[] {
  const metas = new Map(data.instrumentMeta.map((m) => [m.isin, m]));
  const rows = data.holdings
    .filter((h) => h.quantity > 0)
    .map((h) => {
      const price = h.lastPrice ?? h.avgCost;
      const value = conv(h.quantity * price, h.currency);
      const cost = conv(h.quantity * h.avgCost, h.currency);
      return {
        ...h,
        value: round2(value),
        cost: round2(cost),
        pnl: round2(value - cost),
        pnlPct: cost ? (value - cost) / cost : 0,
        weight: 0,
        priceIsEstimate: h.lastPrice === undefined,
        meta: metas.get(h.isin),
      };
    });
  const total = sum(rows.map((r) => r.value));
  for (const r of rows) r.weight = total ? r.value / total : 0;
  return rows.sort((a, b) => b.value - a.value);
}

export interface PortfolioSummary {
  value: number;
  cost: number;
  unrealized: number;
  unrealizedPct: number;
  realized: number;
  dividends: number;
  interest: number;
  fees: number;
  taxes: number;
  totalReturn: number;
  totalReturnPct: number;
  estimatedPrices: number;
  annualTerCost: number;
  weightedTer: number;
}

/** Plusvalenze realizzate con il metodo del costo medio ponderato (usato in Italia per il regime amministrato). */
export function realizedGains(txs: Transaction[], conv: Conv, p?: Period): number {
  const pos = new Map<string, { qty: number; cost: number }>();
  let realized = 0;
  const sorted = txs.filter((t) => (t.kind === 'investment-buy' || t.kind === 'investment-sell') && t.isin).sort((a, b) => a.date.localeCompare(b.date));
  for (const t of sorted) {
    const cur = pos.get(t.isin!) ?? { qty: 0, cost: 0 };
    const q = Math.abs(t.quantity ?? 0);
    const v = Math.abs(conv(t.amount, t.currency));
    if (t.kind === 'investment-buy') {
      cur.qty += q;
      cur.cost += v;
    } else if (q > 0 && cur.qty > 0) {
      const avg = cur.cost / cur.qty;
      const sold = Math.min(q, cur.qty);
      if (!p || inPeriod(t, p)) realized += v - avg * sold;
      cur.qty -= sold;
      cur.cost -= avg * sold;
    }
    pos.set(t.isin!, cur);
  }
  return round2(realized);
}

const tradeRepublicTx = (t: Transaction) => t.provider === 'traderepublic';

export function portfolioSummary(data: FinanceData, conv: Conv, p?: Period): PortfolioSummary {
  const views = holdingViews(data, conv);
  const txs = data.transactions.filter((t) => !p || inPeriod(t, p));
  const value = sum(views.map((v) => v.value));
  const cost = sum(views.map((v) => v.cost));
  const dividends = sum(txs.filter((t) => t.kind === 'dividend').map((t) => conv(t.amount, t.currency)));
  const interest = sum(txs.filter((t) => t.kind === 'interest' && tradeRepublicTx(t)).map((t) => conv(t.amount, t.currency)));
  const fees = sum(txs.filter((t) => tradeRepublicTx(t)).map((t) => (t.kind === 'fee' ? -conv(t.amount, t.currency) : 0) + (t.fee ? conv(t.fee, t.currency) : 0)));
  const taxes = sum(txs.filter((t) => t.kind === 'tax' && tradeRepublicTx(t)).map((t) => -conv(t.amount, t.currency)));
  const realized = realizedGains(data.transactions, conv, p);
  const unrealized = value - cost;
  const totalReturn = unrealized + realized + dividends - fees - taxes;
  const annualTerCost = sum(views.map((v) => v.value * (v.meta?.ter ?? 0)));
  return {
    value: round2(value),
    cost: round2(cost),
    unrealized: round2(unrealized),
    unrealizedPct: cost ? unrealized / cost : 0,
    realized,
    dividends: round2(dividends),
    interest: round2(interest),
    fees: round2(fees),
    taxes: round2(taxes),
    totalReturn: round2(totalReturn),
    totalReturnPct: cost ? totalReturn / cost : 0,
    estimatedPrices: views.filter((v) => v.priceIsEstimate).length,
    annualTerCost: round2(annualTerCost),
    weightedTer: value ? annualTerCost / value : 0,
  };
}

/** Esposizione aggregata (geografica o settoriale) pesata per valore. */
export function exposure(views: HoldingView[], dim: 'geography' | 'sectors') {
  const acc = new Map<string, number>();
  let covered = 0;
  const total = sum(views.map((v) => v.value));
  for (const v of views) {
    const w = v.meta?.[dim];
    if (!w) continue;
    covered += v.value;
    for (const [k, share] of Object.entries(w)) acc.set(k, (acc.get(k) ?? 0) + v.value * share);
  }
  const items = [...acc.entries()].map(([name, value]) => ({ name, value: round2(value), share: total ? value / total : 0 })).sort((a, b) => b.value - a.value);
  return { items, coverage: total ? covered / total : 0 };
}

export function allocationByClass(views: HoldingView[]) {
  const acc = new Map<string, number>();
  for (const v of views) acc.set(v.assetClass, (acc.get(v.assetClass) ?? 0) + v.value);
  const total = sum([...acc.values()]);
  return [...acc.entries()].map(([name, value]) => ({ name, value: round2(value), share: total ? value / total : 0 })).sort((a, b) => b.value - a.value);
}

export interface DiversificationReport {
  hhi: number; // indice di Herfindahl sulle posizioni
  effectiveN: number;
  score: number; // 0..100
  topPosition?: HoldingView;
  topCountry?: { name: string; share: number };
  topSector?: { name: string; share: number };
  warnings: string[];
}

/**
 * Le soglie sono euristiche comuni (non consulenza): singolo titolo > 10%,
 * singola posizione > 40%, singolo paese > 65%, singolo settore > 30%.
 */
export function diversification(views: HoldingView[]): DiversificationReport {
  const warnings: string[] = [];
  // per gli ETF diversificati il peso "effettivo" del singolo emittente è molto più basso
  const hhi = sum(views.map((v) => (v.assetClass === 'etf' ? (v.weight ** 2) / 20 : v.weight ** 2)));
  const effectiveN = hhi ? 1 / hhi : 0;
  const geo = exposure(views, 'geography');
  const sec = exposure(views, 'sectors');
  const top = views[0];
  for (const v of views) {
    if (v.assetClass === 'stock' && v.weight > 0.1) warnings.push(`${v.name} pesa il ${Math.round(v.weight * 100)}% del portafoglio: rischio specifico del singolo titolo.`);
    if (v.assetClass !== 'stock' && v.weight > 0.4 && views.length > 1) warnings.push(`${v.name} rappresenta il ${Math.round(v.weight * 100)}% del portafoglio.`);
    if (v.assetClass === 'crypto' && v.weight > 0.1) warnings.push(`Le cripto (${v.name}) pesano il ${Math.round(v.weight * 100)}%: volatilità elevata.`);
  }
  const topCountry = geo.items[0];
  if (topCountry && topCountry.share > 0.65) warnings.push(`Esposizione a ${topCountry.name} pari al ${Math.round(topCountry.share * 100)}% (stima dalle composizioni ETF).`);
  const topSector = sec.items[0];
  if (topSector && topSector.share > 0.3) warnings.push(`Settore ${topSector.name} al ${Math.round(topSector.share * 100)}% (stima).`);
  const score = Math.max(0, Math.min(100, Math.round(Math.min(effectiveN, 20) * 4 + (geo.coverage ? (1 - (topCountry?.share ?? 0)) * 25 : 10) + (sec.coverage ? (1 - (topSector?.share ?? 0)) * 15 : 5) - warnings.length * 5)));
  return {
    hhi,
    effectiveN,
    score,
    topPosition: top,
    topCountry: topCountry && { name: topCountry.name, share: topCountry.share },
    topSector: topSector && { name: topSector.name, share: topSector.share },
    warnings,
  };
}

export function passiveIncomeByMonth(txs: Transaction[], conv: Conv, endMonth: string, count: number) {
  const months = monthRange(endMonth, count);
  const idx = new Map(months.map((m, i) => [m, i]));
  const rows = months.map((month) => ({ month, dividends: 0, interest: 0, cashback: 0 }));
  for (const t of txs) {
    const i = idx.get(monthKey(t.date));
    if (i === undefined) continue;
    const v = conv(t.amount, t.currency);
    if (t.kind === 'dividend') rows[i].dividends += v;
    else if (t.kind === 'interest') rows[i].interest += v;
    else if (t.kind === 'cashback') rows[i].cashback += v;
  }
  return rows.map((r) => ({ ...r, dividends: round2(r.dividends), interest: round2(r.interest), cashback: round2(r.cashback) }));
}

function priceAt(series: PricePoint[], date: string): number | undefined {
  // ultimo prezzo disponibile alla data (le serie sono ordinate)
  let lo = 0;
  let hi = series.length - 1;
  let ans: number | undefined;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].date <= date) {
      ans = series[mid].value;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans ?? series[0]?.value;
}

export interface BenchmarkComparison {
  benchmark: Benchmark;
  series: { date: string; invested: number; benchmark: number; portfolio?: number }[];
  benchmarkFinal: number;
  portfolioFinal: number;
  invested: number;
  difference: number;
}

/**
 * Confronto "a parità di flussi": simula di aver investito nel benchmark gli stessi importi
 * nelle stesse date dei tuoi acquisti/vendite. È più onesto di un confronto tra rendimenti
 * percentuali, perché tiene conto di quando hai effettivamente investito.
 */
export function compareWithBenchmark(data: FinanceData, conv: Conv, benchmark: Benchmark, currentValue: number): BenchmarkComparison | null {
  const series = [...benchmark.series].sort((a, b) => a.date.localeCompare(b.date));
  if (series.length < 2) return null;
  const flows = data.transactions
    .filter((t) => t.kind === 'investment-buy' || t.kind === 'investment-sell')
    .map((t) => ({ date: t.date, amount: -conv(t.amount, t.currency) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!flows.length) return null;
  const snapshots = new Map(data.snapshots.map((s) => [monthKey(s.date), s.investments]));
  const start = flows[0].date;
  const points = series.filter((p) => p.date >= start);
  let units = 0;
  let invested = 0;
  let fi = 0;
  const out: BenchmarkComparison['series'] = [];
  for (const p of points) {
    while (fi < flows.length && flows[fi].date <= p.date) {
      const px = priceAt(series, flows[fi].date)!;
      units += flows[fi].amount / px;
      invested += flows[fi].amount;
      fi++;
    }
    out.push({ date: p.date, invested: round2(invested), benchmark: round2(units * p.value), portfolio: snapshots.get(monthKey(p.date)) });
  }
  // eventuali flussi successivi all'ultimo punto della serie
  const lastPx = series[series.length - 1].value;
  while (fi < flows.length) {
    units += flows[fi].amount / lastPx;
    invested += flows[fi].amount;
    fi++;
  }
  const benchmarkFinal = round2(units * lastPx);
  if (out.length) out[out.length - 1].portfolio = round2(currentValue);
  return { benchmark, series: out, benchmarkFinal, portfolioFinal: round2(currentValue), invested: round2(invested), difference: round2(currentValue - benchmarkFinal) };
}
