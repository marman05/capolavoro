import { applyCategories } from '../domain/categories';
import { emptyData } from '../domain/defaults';
import { REFERENCE_META } from '../domain/reference';
import type { Account, Benchmark, FinanceData, Holding, NetWorthSnapshot, Transaction, TxKind } from '../domain/types';
import { deriveHoldings } from '../connectors/traderepublic';
import { reconcileTransfers } from '../connectors/registry';
import { addDays, addMonths, parseISO, toISODate } from '../lib/dates';
import { round2 } from '../lib/stats';

/**
 * DATI DIMOSTRATIVI. Generati in modo deterministico per esplorare l'interfaccia.
 * Non rappresentano conti reali e l'app li etichetta sempre come "Dati di esempio".
 */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildDemoData(asOfDate = new Date()): FinanceData {
  const r = rng(42);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const asOf = toISODate(asOfDate);
  const start = addMonths(asOf, -14);
  const tx: Transaction[] = [];
  let n = 0;
  const RV = 'revolut:current:current:EUR';
  const RV_SAV = 'revolut:savings:savings:EUR';
  const TR = 'traderepublic:cash';
  const add = (accountId: string, provider: 'revolut' | 'traderepublic', date: string, description: string, amount: number, kind: TxKind, extra: Partial<Transaction> = {}) => {
    if (date > asOf || date < start) return;
    tx.push({ id: `demo_${n++}`, accountId, provider, date, description, merchant: description, amount: round2(amount), currency: 'EUR', kind, origin: 'demo', sourceType: kind === 'expense' ? 'CARD_PAYMENT' : undefined, ...extra });
  };

  for (let d = start; d <= asOf; d = addDays(d, 1)) {
    const dt = parseISO(d);
    const dom = dt.getDate();
    const dow = dt.getDay();
    const month = dt.getMonth();
    if (dom === 27) add(RV, 'revolut', d, 'Stipendio – Acme S.r.l.', 2900 + (month === 11 ? 2100 : 0), 'income', { sourceType: 'TRANSFER' });
    if (dom === 1) add(RV, 'revolut', d, 'Affitto appartamento', -780, 'expense', { sourceType: 'TRANSFER', category: 'casa' });
    if (dom === 3) add(RV, 'revolut', d, 'Metal plan fee', -15.99, 'fee', { sourceType: 'FEE' });
    if (dom === 5) add(RV, 'revolut', d, 'Netflix', -13.99, 'expense');
    if (dom === 8) add(RV, 'revolut', d, 'Spotify', -10.99, 'expense');
    if (dom === 12 && d >= addMonths(asOf, -10)) add(RV, 'revolut', d, 'Disney Plus', -9.99, 'expense');
    if (dom === 15) add(RV, 'revolut', d, 'Apple.com/bill iCloud', -2.99, 'expense');
    if (dom === 18) add(RV, 'revolut', d, d >= addMonths(asOf, -5) ? 'OpenAI ChatGPT' : 'OpenAI ChatGPT', d >= addMonths(asOf, -5) ? -23 : -20, 'expense');
    if (dom === 2) add(RV, 'revolut', d, 'Virgin Active palestra', -59, 'expense');
    if (dom === 20) add(RV, 'revolut', d, 'Iliad', -9.99, 'expense');
    if (dom === 22 && month % 2 === 0) add(RV, 'revolut', d, 'Enel Energia bolletta', -(68 + r() * 40), 'expense');
    if (dom === 10 && month === 2) add(RV, 'revolut', d, 'Amazon Prime annuale', -49.9, 'expense');
    if (dom === 28) {
      add(RV, 'revolut', d, 'To Trade Republic', -400, 'transfer', { sourceType: 'TRANSFER' });
      add(TR, 'traderepublic', d, 'Deposito da Revolut', 400, 'transfer', { sourceType: 'Deposit' });
    }
    if (dom === 28) add(RV, 'revolut', d, 'To EUR Savings', -150, 'transfer', { sourceType: 'TRANSFER' });
    if (dom === 28) add(RV_SAV, 'revolut', d, 'From EUR Main', 150, 'transfer', { sourceType: 'TRANSFER' });
    if (dom === 1) add(RV_SAV, 'revolut', d, 'Savings interest', 4 + r() * 2, 'interest', { sourceType: 'INTEREST' });
    if (dom === 4) add(RV, 'revolut', d, 'Revolut cashback', 2 + r() * 3, 'cashback', { sourceType: 'CASHBACK' });
    // spesa alimentare
    if (dow === 6 || dow === 3) add(RV, 'revolut', d, pick(['Esselunga', 'Conad', 'Lidl', 'Carrefour Express']), -(28 + r() * 55), 'expense');
    if (r() < 0.32) add(RV, 'revolut', d, pick(['Bar Centrale', 'Starbucks', 'Caffè Vergnano', 'Pasticceria Marchesi']), -(1.5 + r() * 6), 'expense');
    if ((dow === 5 || dow === 6) && r() < 0.6) add(RV, 'revolut', d, pick(['Trattoria da Mario', 'Pizzeria Gino', 'Sushi Zen', 'Osteria del Ponte', 'Poke House']), -(22 + r() * 45), 'expense');
    if (r() < 0.12) add(RV, 'revolut', d, pick(['Deliveroo', 'Glovo', 'Just Eat']), -(14 + r() * 18), 'expense');
    if (dow >= 1 && dow <= 5 && r() < 0.35) add(RV, 'revolut', d, pick(['ATM Milano', 'Trenitalia', 'Uber', 'Lime']), -(2.2 + r() * 14), 'expense');
    if (r() < 0.05) add(RV, 'revolut', d, pick(['Eni Station', 'Q8']), -(45 + r() * 25), 'expense');
    if (r() < 0.07) add(RV, 'revolut', d, pick(['Amazon', 'Zalando', 'Decathlon', 'Uniqlo']), -(18 + r() * 70), 'expense');
    if (r() < 0.04) add(RV, 'revolut', d, pick(['Farmacia Centrale', 'Ottica Vista']), -(9 + r() * 35), 'expense');
    if (r() < 0.04) add(RV, 'revolut', d, pick(['UCI Cinemas', 'TicketOne', 'Steam']), -(9 + r() * 30), 'expense');
    if (dom === 14 && month % 3 === 0) add(RV, 'revolut', d, 'ATM cash withdrawal', -200, 'expense', { sourceType: 'ATM', category: 'altro' });
    // trade republic: PAC il 2 del mese, interessi il 1°
    if (dom === 2) {
      add(TR, 'traderepublic', d, 'iShares Core MSCI World USD (Acc)', -300, 'investment-buy', { isin: 'IE00B4L5Y983', quantity: round2(300 / (95 + monthsFrom(start, d) * 0.9)), sourceType: 'Savings plan' });
      add(TR, 'traderepublic', d, 'iShares Core MSCI EM IMI USD (Acc)', -75, 'investment-buy', { isin: 'IE00BKM4GZ66', quantity: round2(75 / (33 + monthsFrom(start, d) * 0.2)), sourceType: 'Savings plan' });
    }
    if (dom === 1) add(TR, 'traderepublic', d, 'Interessi liquidità', 3.5 + r() * 1.5, 'interest', { sourceType: 'Interest' });
  }
  // operazioni manuali e viaggi
  const m = (k: number, day: number) => addDays(addMonths(asOf, -k).slice(0, 8) + '01', day - 1);
  add(TR, 'traderepublic', m(11, 9), 'NVIDIA Corp.', -1201, 'investment-buy', { isin: 'US67066G1040', quantity: 10, fee: 1, sourceType: 'Buy' });
  add(TR, 'traderepublic', m(9, 16), 'Apple Inc.', -651, 'investment-buy', { isin: 'US0378331005', quantity: 3, fee: 1, sourceType: 'Buy' });
  add(TR, 'traderepublic', m(6, 3), 'NVIDIA Corp.', -1501, 'investment-buy', { isin: 'US67066G1040', quantity: 10, fee: 1, sourceType: 'Buy' });
  add(TR, 'traderepublic', m(4, 21), 'Apple Inc.', -151, 'investment-buy', { isin: 'US0378331005', quantity: 0.7, fee: 1, sourceType: 'Buy' });
  add(TR, 'traderepublic', m(3, 11), 'NVIDIA Corp.', 701, 'investment-sell', { isin: 'US67066G1040', quantity: 4, fee: 1, sourceType: 'Sell' });
  add(TR, 'traderepublic', m(3, 11), 'Imposte – NVIDIA Corp.', -38.2, 'tax', { isin: 'US67066G1040' });
  for (const k of [10, 7, 4, 1]) add(TR, 'traderepublic', m(k, 14), 'Dividendo Apple Inc.', 0.62 + k * 0.01, 'dividend', { isin: 'US0378331005' });
  add(TR, 'traderepublic', m(12, 2), 'Deposito iniziale', 6000, 'transfer', { sourceType: 'Deposit' });
  // viaggio estivo negli USA con pagamenti in valuta
  for (let i = 0; i < 9; i++) {
    const d = addDays(m(4, 6), i);
    add(RV, 'revolut', d, pick(['Whole Foods NYC', 'Joe’s Pizza', 'Uber', 'MoMA Store', 'Shake Shack']), -(18 + r() * 60), 'expense', { originalCurrency: 'USD', originalAmount: round2(20 + r() * 65) });
  }
  add(RV, 'revolut', m(5, 20), 'ITA Airways', -640, 'expense', { category: 'viaggi' });
  add(RV, 'revolut', m(4, 5), 'Booking.com Hotel New York', -1180, 'expense');
  add(RV, 'revolut', m(4, 6), 'Exchanged to USD', -600, 'fx', { sourceType: 'EXCHANGE' });
  add(RV, 'revolut', m(4, 13), 'Exchanged to USD', -300, 'fx', { sourceType: 'EXCHANGE' });
  add(RV, 'revolut', m(1, 24), 'Ryanair', -89, 'expense');
  add(RV, 'revolut', m(0, 2) < asOf ? m(0, 2) : addDays(asOf, -2), 'MediaWorld – TV OLED', -1349, 'expense', { category: 'shopping' });
  add(RV, 'revolut', m(8, 10), 'ATM cash withdrawal fee', -4, 'fee', { sourceType: 'FEE' });

  // domenica → aggiusta i cambi per avere un esempio di cambio nel weekend
  for (const t of tx) if (t.kind === 'fx') t.date = addDays(t.date, (7 - parseISO(t.date).getDay()) % 7);

  const transactions = applyCategories(reconcileTransfers(tx)).sort((a, b) => b.date.localeCompare(a.date));
  const prices: Record<string, number> = { IE00B4L5Y983: 112.4, IE00BKM4GZ66: 36.1, US67066G1040: 171.2, US0378331005: 228.5 };
  const holdings: Holding[] = deriveHoldings(transactions, 'demo').map((h) => ({ ...h, lastPrice: prices[h.isin], lastPriceDate: asOf }));

  const cashBalance = (acc: string, opening: number) => round2(opening + transactions.filter((t) => t.accountId === acc).reduce((s, t) => s + t.amount - (t.fee ?? 0), 0));
  const accounts: Account[] = [
    { id: RV, provider: 'revolut', name: 'Revolut Metal – Conto EUR', kind: 'current', currency: 'EUR', balance: cashBalance(RV, 4200), balanceDate: asOf, origin: 'demo' },
    { id: RV_SAV, provider: 'revolut', name: 'Revolut – Salvadanaio', kind: 'savings', currency: 'EUR', balance: cashBalance(RV_SAV, 1500), balanceDate: asOf, origin: 'demo', interestRate: 0.0225 },
    { id: TR, provider: 'traderepublic', name: 'Trade Republic – Liquidità', kind: 'brokerage-cash', currency: 'EUR', balance: cashBalance(TR, 0), balanceDate: asOf, origin: 'demo', interestRate: 0.02 },
    { id: 'traderepublic:securities', provider: 'traderepublic', name: 'Trade Republic – Deposito titoli', kind: 'brokerage', currency: 'EUR', origin: 'demo' },
  ];

  // benchmark sintetico (MSCI World in EUR) – DIMOSTRATIVO
  const bench: Benchmark = { id: 'demo-msci-world', name: 'MSCI World (dati dimostrativi)', currency: 'EUR', origin: 'demo', series: [] };
  let v = 100;
  for (let d = addMonths(asOf, -15); d <= asOf; d = addDays(d, 7)) {
    v *= 1 + (0.0017 + (r() - 0.5) * 0.035);
    bench.series.push({ date: d, value: round2(v) });
  }
  const snapshots: NetWorthSnapshot[] = [];

  const data = emptyData();
  data.metal = {
    ...data.metal,
    monthlyFee: 15.99,
    terms: { cashbackRate: 0.001, freeAtmMonthly: 800, atmFeeAfterLimit: 0.02, weekendFxMarkup: 0.01, fxFairUsageMonthly: null },
    benefits: { ...data.metal.benefits, cashback: 'confirmed', fx: 'confirmed', atm: 'confirmed', 'travel-insurance': 'confirmed', savings: 'confirmed', 'virtual-cards': 'confirmed', lounge: 'confirmed', 'disposable-cards': 'confirmed', 'partner-subscriptions': 'confirmed', budgeting: 'confirmed' },
    declaredUsage: { 'virtual-cards': true },
    lastVerified: asOf,
  };
  data.settings.tradeRepublicCashRate = 0.02;
  return {
    ...data,
    accounts,
    transactions,
    holdings,
    savingsPlans: [
      { id: 'pac1', isin: 'IE00B4L5Y983', name: 'iShares Core MSCI World', amount: 300, currency: 'EUR', frequency: 'monthly', nextExecution: addMonths(asOf.slice(0, 8) + '02', 1), active: true },
      { id: 'pac2', isin: 'IE00BKM4GZ66', name: 'iShares Core MSCI EM IMI', amount: 75, currency: 'EUR', frequency: 'monthly', nextExecution: addMonths(asOf.slice(0, 8) + '02', 1), active: true },
    ],
    instrumentMeta: REFERENCE_META.filter((x) => holdings.some((h) => h.isin === x.isin)),
    benchmarks: [bench],
    snapshots,
    goals: [
      { id: 'g1', name: 'Fondo emergenza', type: 'emergency', target: 9000, linkedTo: 'cash', createdAt: start },
      { id: 'g2', name: 'Portafoglio 25k', type: 'investment', target: 25000, linkedTo: 'investments', monthlyContribution: 375, deadline: addMonths(asOf, 36), createdAt: start },
    ],
    isDemo: true,
  };
}

function monthsFrom(a: string, b: string) {
  return (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));
}
