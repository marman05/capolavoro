import type { Account, AssetClass, Holding, Transaction, TxKind } from '../domain/types';
import { stableHash } from '../lib/id';
import { findColumn, ISIN_RE, parseAmount, parseDate } from './parse';
import type { ImportResult, SourceConnector, TabularInput, TextInput } from './types';

/**
 * Trade Republic offre in app un "Transaktionsexport"/esportazione transazioni (CSV) con
 * movimenti di conto e titoli. Il layout esatto delle colonne non è documentato
 * pubblicamente e può variare con la lingua dell'app, quindi il riconoscimento usa
 * sinonimi in DE/EN/IT/FR/ES e l'anteprima permette di controllare il risultato.
 */
const COLS = {
  date: ['date', 'datum', 'data', 'fecha', 'booking date', 'buchungsdatum', 'valuta', 'value date'],
  type: ['type', 'typ', 'tipo', 'event', 'kategorie', 'category', 'categoria', 'transaction type'],
  description: ['description', 'beschreibung', 'descrizione', 'name', 'titel', 'title', 'nome', 'instrument', 'wertpapier', 'asset'],
  amount: ['amount', 'betrag', 'importo', 'montant', 'importe', 'value', 'wert', 'total'],
  currency: ['currency', 'wahrung', 'valuta', 'devise', 'moneda'],
  isin: ['isin'],
  shares: ['shares', 'stuck', 'stueck', 'anteile', 'quantity', 'quantita', 'quantite', 'cantidad', 'units', 'menge'],
  price: ['price', 'kurs', 'prezzo', 'prix', 'precio', 'unit price', 'preis'],
  fee: ['fee', 'fees', 'gebuhr', 'gebuehr', 'gebuhren', 'commissione', 'commissioni', 'frais', 'comision', 'costs'],
  tax: ['tax', 'taxes', 'steuer', 'steuern', 'tasse', 'imposte', 'impuestos'],
};

export function trKind(type: string, amount: number, description: string): TxKind {
  const s = `${type} ${description}`.toLowerCase();
  if (/saveback|round ?up|aufrund/.test(s)) return 'investment-buy';
  if (/dividend|ausschutt|aussch|distribuz|cedola|coupon|kupon/.test(s)) return 'dividend';
  if (/zins|interest|interess|interet/.test(s)) return 'interest';
  if (/steuer|tax|tasse|impost|vorabpausch/.test(s)) return 'tax';
  if (/gebuhr|gebühr|fee|commission|kosten/.test(s) && !/kauf|buy|acquist/.test(s)) return 'fee';
  if (/verkauf|sell|vendita|vente|venta/.test(s)) return 'investment-sell';
  if (/kauf|buy|acquist|achat|compra|sparplan|savings plan|piano di accumulo|pac|trade|order|ordine/.test(s)) return amount > 0 ? 'investment-sell' : 'investment-buy';
  if (/einzahlung|deposit|deposito|versamento|bonifico in entrata|ricarica|top ?up|incoming/.test(s)) return 'transfer';
  if (/auszahlung|withdraw|prelievo|bonifico in uscita|outgoing|payout/.test(s)) return 'transfer';
  if (/karte|card|carta/.test(s)) return amount < 0 ? 'expense' : 'refund';
  return amount < 0 ? 'expense' : 'income';
}

export function guessAssetClass(name: string, isin?: string): AssetClass {
  const n = name.toLowerCase();
  if (/etf|ucits|ishares|vanguard|xtrackers|amundi|spdr|lyxor|invesco|wisdomtree|msci|s&p|ftse|stoxx/.test(n)) return 'etf';
  if (/bitcoin|ethereum|crypto|solana|xrp|cardano|btc|eth/.test(n)) return 'crypto';
  if (/bond|anleihe|btp|bund|treasury|obbligaz|bobl|schatz/.test(n)) return 'bond';
  if (isin?.startsWith('XF')) return 'crypto';
  return 'stock';
}

const ACCOUNT_CASH: Account = { id: 'traderepublic:cash', provider: 'traderepublic', name: 'Trade Republic – Liquidità', kind: 'brokerage-cash', currency: 'EUR', origin: 'csv' };
const ACCOUNT_SEC: Account = { id: 'traderepublic:securities', provider: 'traderepublic', name: 'Trade Republic – Deposito titoli', kind: 'brokerage', currency: 'EUR', origin: 'csv' };

/**
 * Calcola le posizioni (costo medio ponderato, commissioni incluse) dalle operazioni.
 * Il prezzo dell'ultimo acquisto NON è un prezzo di mercato: lastPrice resta vuoto
 * finché l'utente non aggiorna i prezzi o importa un estratto deposito.
 */
export function deriveHoldings(txs: Transaction[], origin: Holding['origin']): Holding[] {
  const map = new Map<string, Holding & { costTotal: number }>();
  for (const t of [...txs].sort((a, b) => a.date.localeCompare(b.date))) {
    if (!t.isin || (t.kind !== 'investment-buy' && t.kind !== 'investment-sell')) continue;
    const q = Math.abs(t.quantity ?? 0);
    if (!q) continue;
    const h = map.get(t.isin) ?? { id: `tr_h_${t.isin}`, accountId: ACCOUNT_SEC.id, provider: 'traderepublic', isin: t.isin, name: t.description, assetClass: guessAssetClass(t.description, t.isin), quantity: 0, avgCost: 0, currency: 'EUR', origin, costTotal: 0 };
    if (t.kind === 'investment-buy') {
      h.costTotal += Math.abs(t.amount);
      h.quantity += q;
    } else {
      const avg = h.quantity ? h.costTotal / h.quantity : 0;
      const sold = Math.min(q, h.quantity);
      h.costTotal -= avg * sold;
      h.quantity -= sold;
    }
    h.avgCost = h.quantity ? h.costTotal / h.quantity : 0;
    if (t.description && t.description.length > h.name.length) h.name = t.description;
    map.set(t.isin, h);
  }
  return [...map.values()].filter((h) => h.quantity > 1e-9).map(({ costTotal: _c, ...h }) => h);
}

function detect(input: TabularInput): number {
  const h = input.headers;
  let s = 0;
  if (findColumn(h, COLS.isin)) s += 0.35;
  if (findColumn(h, COLS.shares)) s += 0.2;
  if (findColumn(h, COLS.date)) s += 0.15;
  if (findColumn(h, COLS.amount)) s += 0.15;
  if (/trade.?republic|tr_|transaktion/i.test(input.fileName)) s += 0.3;
  if (findColumn(h, ['product', 'prodotto'])) s -= 0.4; // tipico di Revolut
  return Math.max(0, s);
}

function parse(input: TabularInput): ImportResult {
  const h = input.headers;
  const c = Object.fromEntries(Object.entries(COLS).map(([k, syn]) => [k, findColumn(h, syn)])) as Record<keyof typeof COLS, string | undefined>;
  // evita che "valuta" (IT = currency) venga scelto come data
  if (c.date && c.date === c.currency) c.currency = undefined;
  if (!c.date || !c.amount) throw new Error('Formato Trade Republic non riconosciuto: servono almeno le colonne Data e Importo.');
  const transactions: Transaction[] = [];
  const warnings: string[] = [];
  input.rows.forEach((r, i) => {
    const date = parseDate(r[c.date!]);
    const amount = parseAmount(r[c.amount!]);
    if (!date || amount === undefined || amount === 0) return;
    const type = String(r[c.type ?? ''] ?? '');
    const description = String(r[c.description ?? ''] ?? type).trim();
    const isinRaw = String(r[c.isin ?? ''] ?? '').trim().toUpperCase();
    const isin = ISIN_RE.test(isinRaw) ? isinRaw : description.match(ISIN_RE)?.[1];
    const kind = trKind(type, amount, description);
    const quantity = parseAmount(r[c.shares ?? '']);
    const price = parseAmount(r[c.price ?? '']);
    const fee = Math.abs(parseAmount(r[c.fee ?? '']) ?? 0);
    const tax = parseAmount(r[c.tax ?? '']);
    transactions.push({
      id: 'tr_' + stableHash(`${date}|${type}|${amount}|${description}|${isin}|${i}`),
      accountId: ACCOUNT_CASH.id,
      provider: 'traderepublic',
      date,
      description,
      merchant: kind === 'expense' ? description : undefined,
      amount,
      currency: String(r[c.currency ?? ''] ?? 'EUR').trim().toUpperCase() || 'EUR',
      fee: fee || undefined,
      kind,
      isin,
      quantity: quantity !== undefined ? Math.abs(quantity) : undefined,
      price: price !== undefined ? Math.abs(price) : undefined,
      sourceType: type,
      origin: input.origin,
    });
    if (tax && Math.abs(tax) > 0 && kind !== 'tax') {
      transactions.push({ id: 'tr_tax_' + stableHash(`${date}|${description}|${tax}|${i}`), accountId: ACCOUNT_CASH.id, provider: 'traderepublic', date, description: `Imposte – ${description}`, amount: -Math.abs(tax), currency: 'EUR', kind: 'tax', isin, origin: input.origin });
    }
  });
  const holdings = deriveHoldings(transactions, input.origin);
  const missingQty = transactions.filter((t) => (t.kind === 'investment-buy' || t.kind === 'investment-sell') && !t.quantity).length;
  if (missingQty) warnings.push(`${missingQty} operazioni senza quantità: le posizioni potrebbero essere incomplete. Importa anche l'estratto del deposito titoli.`);
  if (holdings.length) warnings.push('I prezzi di mercato attuali non sono inclusi nell\'export: le posizioni sono valorizzate al costo finché non aggiorni i prezzi (Investimenti → Aggiorna prezzi) o importi un estratto deposito.');
  return {
    provider: 'traderepublic',
    accounts: [{ ...ACCOUNT_CASH, origin: input.origin }, { ...ACCOUNT_SEC, origin: input.origin }],
    transactions,
    holdings,
    holdingsDerived: true,
    warnings,
  };
}

/**
 * Estratto deposito PDF (es. "Depotauszug" / estratto titoli): estrae righe con ISIN e numeri.
 * Euristica: quantità = primo numero, prezzo = penultimo, controvalore = ultimo.
 */
function parsePdfText(input: TextInput): ImportResult {
  const lines = input.text.split(/\n/).map((l) => l.replace(/\s+/g, ' ').trim());
  const holdings: Holding[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(ISIN_RE);
    if (!m) continue;
    const ctx = `${lines[i - 1] ?? ''} ${lines[i]} ${lines[i + 1] ?? ''}`;
    const nums = (ctx.replace(m[1], '').match(/-?\d{1,3}(?:[.\s]\d{3})*(?:,\d+)|-?\d+(?:\.\d+)?/g) ?? []).map((x) => parseAmount(x)!).filter((x) => x !== undefined && x > 0);
    if (nums.length < 2) continue;
    const quantity = nums[0];
    const value = nums[nums.length - 1];
    const price = nums.length >= 3 ? nums[nums.length - 2] : value / quantity;
    const name = lines[i].replace(m[1], '').replace(/[\d.,]+/g, '').replace(/\b(Stk|pcs|pz|ISIN)\b\.?/gi, '').trim() || lines[i - 1] || m[1];
    if (Math.abs(quantity * price - value) / value > 0.05) continue; // incoerente: scarta
    holdings.push({ id: `tr_h_${m[1]}`, accountId: ACCOUNT_SEC.id, provider: 'traderepublic', isin: m[1], name, assetClass: guessAssetClass(name, m[1]), quantity, avgCost: price, lastPrice: price, lastPriceDate: undefined, currency: 'EUR', origin: 'pdf' });
  }
  const dateMatch = input.text.match(/(?:per|al|zum|as of|stand)\s*:?\s*(\d{1,2}[./]\d{1,2}[./]\d{4})/i);
  const asOf = dateMatch ? parseDate(dateMatch[1]) : undefined;
  for (const h of holdings) h.lastPriceDate = asOf;
  return {
    provider: 'traderepublic',
    accounts: [{ ...ACCOUNT_SEC, origin: 'pdf' }],
    transactions: [],
    holdings,
    holdingsDerived: false,
    warnings: [
      'Import da PDF: estrazione euristica delle posizioni. Controlla quantità e prezzi nell\'anteprima.',
      'Il PDF del deposito non contiene il prezzo medio di carico: viene impostato pari al prezzo dell\'estratto. Se importi anche l\'export transazioni, il costo medio viene ricalcolato dalle operazioni.',
    ],
  };
}

export const tradeRepublicConnector: SourceConnector = {
  id: 'traderepublic',
  provider: 'traderepublic',
  label: 'Trade Republic',
  description: 'Conto di liquidità, deposito titoli, PAC, dividendi e interessi. Import dell\'export transazioni (CSV) ed estratti PDF.',
  capabilities: {
    fileImport: ['csv', 'excel', 'pdf'],
  },
  detectTabular: detect,
  parseTabular: parse,
  detectText: (i) => (/trade republic/i.test(i.text) ? 0.9 : 0),
  parseText: parsePdfText,
  instructions: [
    'App Trade Republic → Profilo → Documenti/Estratti conto → Esportazione transazioni (CSV)',
    'Per le posizioni attuali: scarica l\'estratto del deposito titoli (PDF)',
    'Trascina qui i file: l\'app non chiede mai PIN o numero di telefono',
  ],
};
