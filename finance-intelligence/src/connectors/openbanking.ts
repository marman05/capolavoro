import type { Account, Consent, ProviderId, Transaction, TxKind } from '../domain/types';
import { stableHash } from '../lib/id';
import { revolutKind } from './revolut';
import { trKind } from './traderepublic';
import type { ImportResult } from './types';

/**
 * Client verso il backend locale (`server/`), che firma le richieste a Enable Banking
 * con la chiave privata dell'applicazione. Il browser non vede mai chiavi o token
 * dell'aggregatore e l'utente si autentica SOLO sul sito/app della propria banca
 * (Strong Customer Authentication): l'app non riceve né memorizza credenziali bancarie.
 */

export interface Aspsp {
  name: string;
  country: string;
  logo?: string;
  psu_types?: string[];
  maximum_consent_validity?: number;
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function api<T>(path: string, token: string | undefined, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) },
  });
  // nella versione online senza server (hosting statico) /api non risponde con JSON
  if (!(res.headers.get('content-type') ?? '').includes('application/json')) throw new ApiError('Server non disponibile', 503);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.error ?? `Errore ${res.status}`, res.status);
  return body as T;
}

export interface ServerStatus {
  ok: boolean;
  enableBanking: { configured: boolean; redirectUrl?: string };
  ai: { configured: boolean; model?: string };
  authRequired: boolean;
}

export const serverStatus = (token?: string) => api<ServerStatus>('/status', token);
export const listAspsps = (country: string, token?: string) => api<{ aspsps: Aspsp[] }>(`/ob/aspsps?country=${encodeURIComponent(country)}`, token);
export const startAuth = (aspsp: { name: string; country: string }, token?: string) => api<{ url: string; state: string }>('/ob/auth', token, { method: 'POST', body: JSON.stringify({ aspsp }) });

export interface SessionResult {
  sessionId: string;
  aspsp: { name: string; country: string };
  validUntil: string;
  accounts: { uid: string; name?: string; currency?: string; iban?: string; product?: string; cash_account_type?: string }[];
}
export const completeSession = (code: string, state: string, token?: string) => api<SessionResult>('/ob/session', token, { method: 'POST', body: JSON.stringify({ code, state }) });
export const revokeSession = (sessionId: string, token?: string) => api<{ ok: true }>(`/ob/session/${encodeURIComponent(sessionId)}`, token, { method: 'DELETE' });

interface EbAmount {
  amount: string;
  currency: string;
}
interface EbTransaction {
  entry_reference?: string;
  transaction_id?: string;
  transaction_amount: EbAmount;
  credit_debit_indicator: 'CRDT' | 'DBIT';
  status?: string;
  booking_date?: string;
  value_date?: string;
  transaction_date?: string;
  creditor?: { name?: string };
  debtor?: { name?: string };
  remittance_information?: string[];
  bank_transaction_code?: { description?: string; code?: string; sub_code?: string };
  merchant_category_code?: string;
  exchange_rate?: { unit_currency?: string; source_currency?: string; instructed_amount?: EbAmount };
}
interface EbBalance {
  balance_amount: EbAmount;
  balance_type: string;
  reference_date?: string;
}
interface SyncResponse {
  accounts: { uid: string; balances: EbBalance[]; transactions: EbTransaction[]; error?: string }[];
}

export function providerFromAspsp(name: string): ProviderId {
  if (/revolut/i.test(name)) return 'revolut';
  if (/trade ?republic/i.test(name)) return 'traderepublic';
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

const BALANCE_PRIORITY = ['CLBD', 'ITBD', 'ITAV', 'CLAV', 'XPCD', 'OTHR'];

export function normalizeSync(consent: Consent, accountsMeta: SessionResult['accounts'], resp: SyncResponse): ImportResult {
  const provider = consent.provider;
  const accounts: Account[] = [];
  const transactions: Transaction[] = [];
  const warnings: string[] = [];
  for (const acc of resp.accounts) {
    const meta = accountsMeta.find((m) => m.uid === acc.uid);
    if (acc.error) warnings.push(`${meta?.name ?? acc.uid}: ${acc.error}`);
    const bal = [...acc.balances].sort((a, b) => BALANCE_PRIORITY.indexOf(a.balance_type) - BALANCE_PRIORITY.indexOf(b.balance_type))[0];
    const currency = bal?.balance_amount.currency ?? meta?.currency ?? 'EUR';
    const id = `${provider}:ob:${acc.uid}`;
    const savings = /sav|svgs|risparm/i.test(`${meta?.cash_account_type ?? ''} ${meta?.product ?? ''} ${meta?.name ?? ''}`);
    accounts.push({
      id,
      provider,
      name: meta?.name ?? `${consent.aspspName} ${currency}`,
      kind: provider === 'traderepublic' ? 'brokerage-cash' : savings ? 'savings' : 'current',
      currency,
      iban: meta?.iban,
      balance: bal ? Number(bal.balance_amount.amount) : undefined,
      balanceDate: bal?.reference_date ?? new Date().toISOString().slice(0, 10),
      origin: 'open-banking',
    });
    for (const t of acc.transactions) {
      if (t.status && t.status !== 'BOOK') continue;
      const sign = t.credit_debit_indicator === 'DBIT' ? -1 : 1;
      const amount = sign * Math.abs(Number(t.transaction_amount.amount));
      const counterparty = sign < 0 ? t.creditor?.name : t.debtor?.name;
      const description = [counterparty, ...(t.remittance_information ?? [])].filter(Boolean).join(' · ') || t.bank_transaction_code?.description || 'Movimento';
      const code = t.bank_transaction_code?.description ?? t.bank_transaction_code?.code ?? '';
      const kind: TxKind = provider === 'traderepublic' ? trKind(code, amount, description) : revolutKind(code || (sign < 0 ? 'CARD_PAYMENT' : 'TRANSFER'), amount, description);
      const date = t.booking_date ?? t.value_date ?? t.transaction_date ?? '';
      if (!date) continue;
      transactions.push({
        id: 'ob_' + stableHash(`${acc.uid}|${t.entry_reference ?? t.transaction_id ?? ''}|${date}|${amount}|${description}`),
        accountId: id,
        provider,
        date,
        description,
        merchant: counterparty ?? description,
        amount,
        currency: t.transaction_amount.currency,
        kind,
        sourceType: code || undefined,
        originalCurrency: t.exchange_rate?.instructed_amount?.currency ?? t.exchange_rate?.source_currency,
        originalAmount: t.exchange_rate?.instructed_amount ? Number(t.exchange_rate.instructed_amount.amount) : undefined,
        origin: 'open-banking',
      });
    }
  }
  return { provider, accounts, transactions, holdings: [], warnings };
}

export async function syncConsent(consent: Consent, accountsMeta: SessionResult['accounts'], token?: string): Promise<ImportResult> {
  const dateFrom = consent.lastSync ? new Date(new Date(consent.lastSync).getTime() - 7 * 86_400_000).toISOString().slice(0, 10) : undefined;
  const resp = await api<SyncResponse>('/ob/sync', token, { method: 'POST', body: JSON.stringify({ sessionId: consent.sessionId, accountUids: accountsMeta.map((a) => a.uid), dateFrom }) });
  return normalizeSync(consent, accountsMeta, resp);
}

export async function fetchEcbRates(token?: string): Promise<{ date: string; rates: Record<string, number> }> {
  try {
    return await api('/fx/latest', token);
  } catch {
    // senza server: tassi di riferimento BCE pubblici, richiesti direttamente dal browser (nessun dato personale inviato)
    const r = await fetch('https://api.frankfurter.app/latest?from=EUR');
    if (!r.ok) throw new Error('Servizio tassi BCE non raggiungibile');
    return r.json();
  }
}
