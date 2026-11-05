import type { Account, AccountKind, Transaction, TxKind } from '../domain/types';
import { stableHash } from '../lib/id';
import { findColumn, parseAmount, parseDate } from './parse';
import type { ImportResult, SourceConnector, TabularInput, TextInput } from './types';

const COLS = {
  type: ['type', 'tipo', 'typ'],
  product: ['product', 'prodotto', 'produkt'],
  started: ['started date', 'data di inizio', 'startdatum', 'started'],
  completed: ['completed date', 'data di completamento', 'abschlussdatum', 'completed'],
  description: ['description', 'descrizione', 'beschreibung'],
  amount: ['amount', 'importo', 'betrag'],
  fee: ['fee', 'costo', 'commissione', 'gebuhr', 'gebuehr'],
  currency: ['currency', 'valuta', 'wahrung', 'waehrung'],
  state: ['state', 'stato', 'status'],
  balance: ['balance', 'saldo', 'kontostand'],
};

function productKind(product: string): AccountKind {
  const p = product.toLowerCase();
  if (/saving|risparm|deposit|vault|salvadanaio|spar/.test(p)) return 'savings';
  if (/pocket/.test(p)) return 'pocket';
  return 'current';
}

/** Mappa i tipi dell'estratto Revolut (EN/IT) sui tipi economici dell'app. */
export function revolutKind(type: string, amount: number, description: string): TxKind {
  const t = type.toUpperCase().replace(/\s+/g, '_');
  const d = description.toLowerCase();
  if (/EXCHANGE|CAMBIO/.test(t)) return 'fx';
  if (/CASHBACK/.test(t) || /cashback/.test(d)) return 'cashback';
  if (/INTEREST|INTERESS/.test(t) || /interest|interessi/.test(d)) return 'interest';
  if (/FEE|COMMISSION|COSTO/.test(t)) return 'fee';
  if (/REFUND|RIMBORSO/.test(t)) return 'refund';
  if (/TAX|TASSA|IMPOSTA/.test(t)) return 'tax';
  if (/TOPUP|TOP_UP|RICARICA/.test(t)) return 'transfer';
  if (/ATM/.test(t)) return 'expense';
  if (/CARD_PAYMENT|PAGAMENTO_CON_CARTA|CARD/.test(t)) return amount < 0 ? 'expense' : 'refund';
  if (/TRANSFER|TRASFERIMENTO|BONIFICO/.test(t)) {
    if (/to (eur|usd|gbp)? ?(savings|pocket|vault)|from (savings|pocket|vault)|salvadanaio|trade republic|to investment|deposit/.test(d)) return 'transfer';
    // bonifici in entrata da terzi = entrate; quelli tra conti propri vengono poi
    // riconosciuti da reconcileTransfers() o corretti manualmente dall'utente
    return amount > 0 ? 'income' : 'expense';
  }
  return amount < 0 ? 'expense' : 'income';
}

function detect(input: TabularInput): number {
  const h = input.headers;
  let s = 0;
  if (findColumn(h, COLS.type)) s += 0.2;
  if (findColumn(h, COLS.product)) s += 0.3;
  if (findColumn(h, COLS.started) || findColumn(h, COLS.completed)) s += 0.3;
  if (findColumn(h, COLS.state)) s += 0.1;
  if (findColumn(h, COLS.balance)) s += 0.1;
  return s;
}

function parse(input: TabularInput): ImportResult {
  const h = input.headers;
  const c = Object.fromEntries(Object.entries(COLS).map(([k, syn]) => [k, findColumn(h, syn)])) as Record<keyof typeof COLS, string | undefined>;
  const warnings: string[] = [];
  if (!c.amount || !(c.completed || c.started)) throw new Error('Formato Revolut non riconosciuto: mancano le colonne Importo/Data.');
  const accounts = new Map<string, Account>();
  const lastBalance = new Map<string, { date: string; balance: number }>();
  const transactions: Transaction[] = [];
  let skipped = 0;
  input.rows.forEach((r, i) => {
    const state = String(r[c.state ?? ''] ?? 'COMPLETED').toUpperCase();
    if (c.state && !/COMPLETED|COMPLETAT|ABGESCHLOSSEN/.test(state)) {
      skipped++;
      return;
    }
    const date = parseDate(r[c.completed ?? ''] ?? r[c.started ?? '']) ?? parseDate(r[c.started ?? '']);
    const amount = parseAmount(r[c.amount!]);
    if (!date || amount === undefined) return;
    const currency = String(r[c.currency ?? ''] ?? 'EUR').trim().toUpperCase() || 'EUR';
    const product = String(r[c.product ?? ''] ?? 'Current') || 'Current';
    const kind = productKind(product);
    const accId = `revolut:${kind}:${product.toLowerCase().replace(/\s+/g, '-')}:${currency}`;
    if (!accounts.has(accId)) {
      accounts.set(accId, { id: accId, provider: 'revolut', name: `Revolut ${product}${currency !== 'EUR' ? ` ${currency}` : ''}`, kind, currency, origin: input.origin });
    }
    const balance = parseAmount(r[c.balance ?? '']);
    const prev = lastBalance.get(accId);
    if (balance !== undefined && (!prev || date >= prev.date)) lastBalance.set(accId, { date, balance });
    const description = String(r[c.description ?? ''] ?? '').trim();
    const type = String(r[c.type ?? ''] ?? '');
    const fee = Math.abs(parseAmount(r[c.fee ?? '']) ?? 0);
    transactions.push({
      id: 'rv_' + stableHash(`${accId}|${String(r[c.started ?? ''] ?? date)}|${amount}|${description}|${i}`),
      accountId: accId,
      provider: 'revolut',
      date,
      description,
      merchant: description,
      amount,
      currency,
      fee: fee || undefined,
      kind: revolutKind(type, amount, description),
      sourceType: type.toUpperCase().replace(/\s+/g, '_'),
      origin: input.origin,
    });
  });
  for (const [id, b] of lastBalance) {
    const acc = accounts.get(id)!;
    acc.balance = b.balance;
    acc.balanceDate = b.date;
  }
  if (skipped) warnings.push(`${skipped} movimenti non completati (in sospeso, annullati o rifiutati) sono stati ignorati.`);
  if (!c.balance) warnings.push('Il file non contiene la colonna Saldo: i saldi dei conti vanno inseriti manualmente.');
  return { provider: 'revolut', accounts: [...accounts.values()], transactions, holdings: [], warnings };
}

/**
 * Estratto conto PDF Revolut: righe tipo "1 gen 2025  Descrizione  12,30 €  1.234,56 €".
 * È un parser euristico: il risultato viene sempre mostrato in anteprima prima del salvataggio.
 */
function parsePdfText(input: TextInput): ImportResult {
  const lines = input.text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const transactions: Transaction[] = [];
  const re = /^(\d{1,2}[./ ](?:\d{1,2}|[a-zA-Zäè]{3,9})\.?[./ ]\d{2,4})\s+(.+?)\s+(-?[\d.,]+)\s?€?\s+(-?[\d.,]+)\s?€?$/;
  let prevBalance: number | undefined;
  lines.forEach((l, i) => {
    const m = l.match(re);
    if (!m) return;
    const date = parseDate(m[1]);
    const amt = parseAmount(m[3]);
    const bal = parseAmount(m[4]);
    if (!date || amt === undefined) return;
    // il segno si deduce dalla variazione di saldo quando possibile
    let amount = -Math.abs(amt);
    if (prevBalance !== undefined && bal !== undefined && Math.abs(bal - prevBalance - Math.abs(amt)) < 0.01) amount = Math.abs(amt);
    prevBalance = bal;
    const description = m[2];
    transactions.push({ id: 'rvp_' + stableHash(`${date}|${description}|${amt}|${i}`), accountId: 'revolut:current:current:EUR', provider: 'revolut', date, description, merchant: description, amount, currency: 'EUR', kind: amount < 0 ? 'expense' : 'income', sourceType: 'PDF', origin: 'pdf' });
  });
  return {
    provider: 'revolut',
    accounts: [{ id: 'revolut:current:current:EUR', provider: 'revolut', name: 'Revolut Current', kind: 'current', currency: 'EUR', origin: 'pdf', balance: prevBalance }],
    transactions,
    holdings: [],
    warnings: ['Import da PDF: il segno e il tipo dei movimenti sono dedotti euristicamente. Preferisci l\'export CSV/Excel quando possibile e controlla l\'anteprima.'],
  };
}

export const revolutConnector: SourceConnector = {
  id: 'revolut',
  provider: 'revolut',
  label: 'Revolut (Metal)',
  description: 'Conto corrente, salvadanai e pocket. Collegamento Open Banking PSD2 in sola lettura o import dell\'estratto conto.',
  capabilities: {
    openBanking: { aggregator: 'enablebanking', aspspName: 'Revolut', country: 'IT', covers: 'Conti, saldi e movimenti (AIS, sola lettura). Non include: dettagli del piano Metal, vantaggi, assicurazioni.' },
    fileImport: ['csv', 'excel', 'pdf'],
  },
  detectTabular: detect,
  parseTabular: parse,
  detectText: (i) => (/revolut/i.test(i.text) && !/trade republic/i.test(i.text) ? 0.8 : 0),
  parseText: parsePdfText,
  instructions: [
    'App Revolut → tocca il conto (EUR) → ⋯ → Estratto conto',
    'Scegli formato Excel o CSV, periodo desiderato (es. ultimi 12 mesi)',
    'Ripeti per salvadanai/valute diverse se vuoi includerli',
    'Trascina qui il file: nessuna credenziale viene richiesta',
  ],
};
