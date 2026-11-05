/**
 * Modello dati canonico. Ogni fonte (Revolut, Trade Republic, future banche/broker)
 * viene normalizzata in queste strutture dai connettori in `src/connectors`.
 */

export type CurrencyCode = string; // ISO 4217, es. "EUR", "USD"

export type ProviderId = 'revolut' | 'traderepublic' | 'manual' | (string & {});

/** Come i dati sono arrivati nell'app: è fondamentale per distinguere fatti da stime. */
export type DataOrigin =
  | 'open-banking' // PSD2 AIS tramite provider autorizzato
  | 'csv'
  | 'excel'
  | 'pdf'
  | 'manual'
  | 'demo'; // dati di esempio, sempre etichettati in UI

export type AccountKind = 'current' | 'savings' | 'pocket' | 'brokerage-cash' | 'brokerage' | 'other';

export interface Account {
  id: string;
  provider: ProviderId;
  name: string;
  kind: AccountKind;
  currency: CurrencyCode;
  iban?: string;
  /** Saldo riportato dalla fonte (non ricalcolato). */
  balance?: number;
  balanceDate?: string; // ISO date
  origin: DataOrigin;
  /** Tasso di interesse annuo lordo dichiarato dall'utente / dalla fonte (es. 0.02 = 2%). */
  interestRate?: number;
}

export const CATEGORIES = [
  'alimentari',
  'ristoranti',
  'trasporti',
  'viaggi',
  'shopping',
  'abbonamenti',
  'casa',
  'salute',
  'intrattenimento',
  'altro',
] as const;
export type SpendingCategory = (typeof CATEGORIES)[number];

/**
 * Tipo economico della transazione: serve a evitare doppi conteggi
 * (es. un bonifico Revolut → Trade Republic non è una spesa né un'entrata).
 */
export type TxKind =
  | 'expense'
  | 'income'
  | 'transfer' // movimento tra conti propri
  | 'investment-buy'
  | 'investment-sell'
  | 'dividend'
  | 'interest'
  | 'fee'
  | 'fx' // cambio valuta interno
  | 'refund'
  | 'cashback'
  | 'tax';

export interface Transaction {
  id: string;
  accountId: string;
  provider: ProviderId;
  date: string; // ISO date (yyyy-mm-dd)
  description: string;
  merchant?: string;
  /** Importo con segno nella valuta della transazione: negativo = uscita. */
  amount: number;
  currency: CurrencyCode;
  /** Commissione separata riportata dalla fonte (valore positivo). */
  fee?: number;
  kind: TxKind;
  category?: SpendingCategory;
  /** True se la categoria è stata impostata manualmente dall'utente. */
  categoryLocked?: boolean;
  /** Strumento collegato (ISIN) per acquisti/vendite/dividendi. */
  isin?: string;
  quantity?: number;
  price?: number;
  /** Tipo originale della fonte (es. "CARD_PAYMENT", "TOPUP"). */
  sourceType?: string;
  origin: DataOrigin;
  /** Paese/valuta del merchant se disponibile (per analisi cambio valuta). */
  originalCurrency?: CurrencyCode;
  originalAmount?: number;
}

export type AssetClass = 'stock' | 'etf' | 'bond' | 'crypto' | 'fund' | 'derivative' | 'cash' | 'other';

export interface Holding {
  id: string;
  accountId: string;
  provider: ProviderId;
  isin: string;
  name: string;
  assetClass: AssetClass;
  quantity: number;
  /** Prezzo medio di carico nella valuta dello strumento. */
  avgCost: number;
  /** Ultimo prezzo noto + data (se assente, il valore è stimato dal costo). */
  lastPrice?: number;
  lastPriceDate?: string;
  currency: CurrencyCode;
  origin: DataOrigin;
}

export interface SavingsPlan {
  id: string;
  isin: string;
  name: string;
  amount: number;
  currency: CurrencyCode;
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly';
  nextExecution?: string;
  active: boolean;
}

/** Metadati di uno strumento: esposizione geografica e settoriale (pesi 0..1). */
export interface InstrumentMeta {
  isin: string;
  name?: string;
  ter?: number; // costo annuo ETF, es. 0.002 = 0.20%
  geography?: Record<string, number>;
  sectors?: Record<string, number>;
  /** 'reference' = tabella interna indicativa, 'user' = inserito dall'utente. */
  source: 'reference' | 'user';
  asOf?: string;
}

export interface PricePoint {
  date: string;
  value: number;
}

export interface Benchmark {
  id: string;
  name: string;
  currency: CurrencyCode;
  series: PricePoint[];
  origin: DataOrigin;
}

/** Istantanea del patrimonio salvata ad ogni sincronizzazione/import. */
export interface NetWorthSnapshot {
  date: string;
  cash: number;
  investments: number;
  total: number;
  origin: DataOrigin;
}

export interface Goal {
  id: string;
  name: string;
  type: 'emergency' | 'investment' | 'savings' | 'purchase';
  target: number;
  current?: number; // se assente → calcolato automaticamente dalla fonte collegata
  linkedTo?: 'cash' | 'investments' | 'networth' | 'manual';
  deadline?: string;
  monthlyContribution?: number;
  createdAt: string;
  achievedAt?: string;
}

/** Consenso Open Banking (PSD2 AIS). */
export interface Consent {
  id: string;
  provider: ProviderId;
  aggregator: 'enablebanking' | (string & {});
  aspspName: string;
  sessionId: string;
  scope: 'ais-read-only';
  grantedAt: string;
  validUntil: string;
  accountIds: string[];
  /** Metadati dei conti autorizzati (uid aggregatore, nome, valuta). */
  accounts?: { uid: string; name?: string; currency?: string; iban?: string; product?: string; cash_account_type?: string }[];
  lastSync?: string;
  lastError?: string;
  status: 'active' | 'expired' | 'revoked';
}

export interface ImportRecord {
  id: string;
  provider: ProviderId;
  fileName: string;
  format: 'csv' | 'excel' | 'pdf';
  importedAt: string;
  transactions: number;
  holdings: number;
}

export type MetalBenefitStatus = 'confirmed' | 'not-available' | 'unverified';

export interface MetalPlanConfig {
  /** Paese di residenza (le condizioni Revolut cambiano per paese). */
  country: string;
  plan: 'Standard' | 'Plus' | 'Premium' | 'Metal' | 'Ultra';
  billing: 'monthly' | 'annual';
  /** Costo del piano verificato dall'utente nell'app Revolut. */
  monthlyFee: number;
  /** Stato di verifica di ogni vantaggio (chiave = id vantaggio). */
  benefits: Record<string, MetalBenefitStatus>;
  /** Parametri contrattuali verificati (possono cambiare: l'utente li conferma). */
  terms: {
    cashbackRate?: number; // es. 0.001 = 0,1%
    freeAtmMonthly?: number; // EUR
    atmFeeAfterLimit?: number; // es. 0.02
    weekendFxMarkup?: number; // es. 0.01
    fxFairUsageMonthly?: number | null; // null = illimitato
  };
  lastVerified?: string;
  /** Utilizzi dichiarati dall'utente non visibili dalle transazioni. */
  declaredUsage: Record<string, boolean>;
}

export interface Settings {
  baseCurrency: CurrencyCode;
  locale: string;
  fxRates: Record<CurrencyCode, number>; // 1 EUR = x valuta
  fxRatesDate?: string;
  fxSource: 'ecb' | 'manual';
  aiEnabled: boolean;
  aiConsentAt?: string;
  notificationsBrowser: boolean;
  autoLockMinutes: number;
  dashboardWidgets: { id: string; visible: boolean }[];
  anomalyThreshold: number; // z-score
  tradeRepublicCashRate?: number; // tasso sulla liquidità verificato
  idleCashBuffer: number; // mesi di spese da tenere liquidi prima di considerare la liquidità "ferma"
  apiToken?: string;
}

export interface NotificationItem {
  id: string;
  type:
    | 'anomaly'
    | 'new-subscription'
    | 'unexpected-fee'
    | 'portfolio-move'
    | 'dividend'
    | 'renewal'
    | 'unused-benefit'
    | 'goal-reached'
    | 'consent-expiry';
  title: string;
  body: string;
  date: string;
  severity: 'info' | 'warning' | 'success';
  read?: boolean;
  link?: string;
}

export interface FinanceData {
  version: 1;
  accounts: Account[];
  transactions: Transaction[];
  holdings: Holding[];
  savingsPlans: SavingsPlan[];
  instrumentMeta: InstrumentMeta[];
  benchmarks: Benchmark[];
  snapshots: NetWorthSnapshot[];
  goals: Goal[];
  consents: Consent[];
  imports: ImportRecord[];
  metal: MetalPlanConfig;
  settings: Settings;
  readNotifications: string[];
  dismissedInsights: string[];
  isDemo: boolean;
}
