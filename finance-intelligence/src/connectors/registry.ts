import type { FinanceData, Holding, Transaction } from '../domain/types';
import { applyCategories } from '../domain/categories';
import { stableHash } from '../lib/id';
import { daysBetween } from '../lib/dates';
import { findColumn, ISIN_RE, parseAmount, parseDate, rowsFromMatrix, type Row } from './parse';
import { revolutConnector } from './revolut';
import { guessAssetClass, tradeRepublicConnector } from './traderepublic';
import type { ImportResult, SourceConnector, TabularInput } from './types';

/** Estratto posizioni generico (ISIN, nome, quantità, prezzo medio, prezzo attuale). */
export const holdingsCsvConnector: SourceConnector = {
  id: 'holdings-csv',
  provider: 'traderepublic',
  label: 'Posizioni (CSV/Excel generico)',
  description: 'Elenco posizioni con ISIN, quantità e prezzi: utile per aggiornare i prezzi di mercato.',
  capabilities: { fileImport: ['csv', 'excel'] },
  detectTabular: ({ headers }) => (findColumn(headers, ['isin']) && findColumn(headers, ['quantity', 'quantita', 'shares', 'stuck', 'anteile']) && !findColumn(headers, ['date', 'datum', 'data']) ? 0.9 : 0),
  parseTabular: ({ headers, rows, origin }) => {
    const c = {
      isin: findColumn(headers, ['isin'])!,
      name: findColumn(headers, ['name', 'nome', 'instrument', 'titolo', 'description', 'descrizione']),
      qty: findColumn(headers, ['quantity', 'quantita', 'shares', 'stuck', 'anteile', 'pezzi'])!,
      avg: findColumn(headers, ['avg', 'average', 'prezzo medio', 'pmc', 'einstand', 'buy in', 'cost']),
      price: findColumn(headers, ['last price', 'price', 'prezzo', 'kurs', 'current price', 'prezzo attuale']),
      currency: findColumn(headers, ['currency', 'valuta', 'wahrung']),
      provider: findColumn(headers, ['provider', 'broker']),
    };
    const holdings: Holding[] = [];
    for (const r of rows) {
      const isin = String(r[c.isin] ?? '').trim().toUpperCase();
      if (!ISIN_RE.test(isin)) continue;
      const quantity = parseAmount(r[c.qty]) ?? 0;
      const price = parseAmount(r[c.price ?? '']);
      const avg = parseAmount(r[c.avg ?? '']) ?? price ?? 0;
      const name = String(r[c.name ?? ''] ?? isin);
      holdings.push({ id: `h_${isin}`, accountId: 'traderepublic:securities', provider: String(r[c.provider ?? ''] ?? 'traderepublic').toLowerCase().includes('revolut') ? 'revolut' : 'traderepublic', isin, name, assetClass: guessAssetClass(name, isin), quantity, avgCost: avg, lastPrice: price, lastPriceDate: price ? new Date().toISOString().slice(0, 10) : undefined, currency: String(r[c.currency ?? ''] ?? 'EUR').toUpperCase() || 'EUR', origin });
    }
    return { provider: 'traderepublic', accounts: [{ id: 'traderepublic:securities', provider: 'traderepublic', name: 'Trade Republic – Deposito titoli', kind: 'brokerage', currency: 'EUR', origin }], transactions: [], holdings, holdingsDerived: false, warnings: [] };
  },
  instructions: ['Colonne minime: ISIN, Quantità; opzionali: Nome, Prezzo medio, Prezzo attuale, Valuta'],
};

/** Registro dei connettori. Per aggiungere una nuova banca/broker basta aggiungerlo qui. */
export const CONNECTORS: SourceConnector[] = [revolutConnector, tradeRepublicConnector, holdingsCsvConnector];

export function detectConnector(input: TabularInput): { connector: SourceConnector; score: number }[] {
  return CONNECTORS.filter((c) => c.detectTabular)
    .map((connector) => ({ connector, score: connector.detectTabular!(input) }))
    .sort((a, b) => b.score - a.score);
}

export function matrixToInput(matrix: unknown[][], fileName: string, origin: TabularInput['origin']): TabularInput {
  const { headers, rows } = rowsFromMatrix(matrix);
  return { headers, rows, fileName, origin };
}

// ---------------------------------------------------------------------------
// Import manuale con mappatura colonne (fonte generica)
// ---------------------------------------------------------------------------
export interface ColumnMapping {
  date: string;
  amount: string;
  description?: string;
  currency?: string;
  fee?: string;
}

export function parseWithMapping(rows: Row[], map: ColumnMapping, provider: 'revolut' | 'traderepublic' | 'manual', origin: TabularInput['origin']): ImportResult {
  const accId = `${provider}:import`;
  const transactions: Transaction[] = [];
  rows.forEach((r, i) => {
    const date = parseDate(r[map.date]);
    const amount = parseAmount(r[map.amount]);
    if (!date || amount === undefined) return;
    const description = String(r[map.description ?? ''] ?? '').trim();
    transactions.push({ id: 'm_' + stableHash(`${provider}|${date}|${amount}|${description}|${i}`), accountId: accId, provider, date, description, merchant: description, amount, currency: String(r[map.currency ?? ''] ?? 'EUR').toUpperCase() || 'EUR', fee: Math.abs(parseAmount(r[map.fee ?? '']) ?? 0) || undefined, kind: amount < 0 ? 'expense' : 'income', origin });
  });
  return { provider, accounts: [{ id: accId, provider, name: `${provider === 'revolut' ? 'Revolut' : provider === 'traderepublic' ? 'Trade Republic' : 'Conto'} (import)`, kind: 'current', currency: 'EUR', origin }], transactions, holdings: [], warnings: ['Import con mappatura manuale: i tipi di movimento sono dedotti dal segno dell\'importo. Puoi correggerli dall\'elenco movimenti.'] };
}

// ---------------------------------------------------------------------------
// Unione dei dati e riconciliazione
// ---------------------------------------------------------------------------

/**
 * Riconosce i trasferimenti tra conti propri (es. bonifico Revolut → Trade Republic):
 * stessa cifra con segno opposto entro 4 giorni su provider diversi. Entrambi
 * diventano `transfer`, così non risultano né spese né entrate.
 */
export function reconcileTransfers(txs: Transaction[]): Transaction[] {
  const out = txs.map((t) => ({ ...t }));
  const candidates = out.filter((t) => ['expense', 'income', 'transfer'].includes(t.kind) && Math.abs(t.amount) >= 10 && !t.categoryLocked);
  const outgoing = candidates.filter((t) => t.amount < 0);
  const incoming = candidates.filter((t) => t.amount > 0);
  const used = new Set<string>();
  for (const o of outgoing) {
    const match = incoming.find((i) => !used.has(i.id) && i.provider !== o.provider && i.currency === o.currency && Math.abs(i.amount + o.amount) < 0.005 && Math.abs(daysBetween(o.date, i.date)) <= 4);
    if (match) {
      used.add(match.id);
      o.kind = 'transfer';
      match.kind = 'transfer';
    }
  }
  return out;
}

export function mergeImport(data: FinanceData, res: ImportResult): FinanceData {
  const accounts = new Map(data.accounts.map((a) => [a.id, a]));
  for (const a of res.accounts) {
    const prev = accounts.get(a.id);
    const keepNewBalance = a.balance !== undefined && (!prev?.balanceDate || !a.balanceDate || a.balanceDate >= prev.balanceDate);
    accounts.set(a.id, { ...prev, ...a, balance: keepNewBalance ? a.balance : prev?.balance, balanceDate: keepNewBalance ? a.balanceDate : prev?.balanceDate, interestRate: prev?.interestRate ?? a.interestRate });
  }
  // deduplica: stesso id → mantieni le correzioni manuali dell'utente
  const txs = new Map(data.transactions.map((t) => [t.id, t]));
  for (const t of res.transactions) {
    const prev = txs.get(t.id);
    txs.set(t.id, prev?.categoryLocked ? { ...t, category: prev.category, categoryLocked: true, kind: prev.kind } : t);
  }
  let holdings = data.holdings;
  if (res.holdings.length) {
    const byIsin = new Map(holdings.map((h) => [`${h.provider}:${h.isin}`, h]));
    if (res.holdingsDerived) {
      // ricalcolo da transazioni: sostituisce quantità e costo ma conserva i prezzi aggiornati
      for (const h of res.holdings) {
        const prev = byIsin.get(`${h.provider}:${h.isin}`);
        byIsin.set(`${h.provider}:${h.isin}`, { ...h, lastPrice: prev?.lastPrice, lastPriceDate: prev?.lastPriceDate });
      }
      const derivedKeys = new Set(res.holdings.map((h) => `${h.provider}:${h.isin}`));
      for (const [k, h] of byIsin) if (h.provider === res.provider && !derivedKeys.has(k) && h.origin === res.holdings[0].origin) byIsin.delete(k);
    } else {
      for (const h of res.holdings) {
        const prev = byIsin.get(`${h.provider}:${h.isin}`);
        // un estratto posizioni aggiorna quantità e prezzo, ma il costo medio calcolato dalle operazioni ha priorità
        byIsin.set(`${h.provider}:${h.isin}`, { ...h, avgCost: prev && prev.avgCost > 0 && prev.origin !== 'pdf' ? prev.avgCost : h.avgCost });
      }
    }
    holdings = [...byIsin.values()];
  }
  const savingsPlans = res.savingsPlans ? [...data.savingsPlans.filter((p) => !res.savingsPlans!.some((n) => n.id === p.id)), ...res.savingsPlans] : data.savingsPlans;
  const transactions = applyCategories(reconcileTransfers([...txs.values()])).sort((a, b) => b.date.localeCompare(a.date));
  return { ...data, accounts: [...accounts.values()], transactions, holdings, savingsPlans, isDemo: false };
}
