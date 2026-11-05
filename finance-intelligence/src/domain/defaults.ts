import { defaultMetalConfig } from '../analytics/metal';
import type { FinanceData, Settings } from './types';

export const DASHBOARD_WIDGETS = [
  { id: 'kpis', label: 'Patrimonio, liquidità e investimenti' },
  { id: 'networth-chart', label: 'Evoluzione del patrimonio' },
  { id: 'flows', label: 'Entrate e uscite del mese' },
  { id: 'distribution', label: 'Distribuzione del denaro' },
  { id: 'opportunities', label: 'Le 3 migliori opportunità' },
  { id: 'metal-score', label: 'Metal Utilization Score' },
  { id: 'top-spending', label: 'Principali spese' },
  { id: 'investments', label: 'Rendimento investimenti' },
  { id: 'transactions', label: 'Ultime transazioni' },
];

export function defaultSettings(): Settings {
  return {
    baseCurrency: 'EUR',
    locale: 'it-IT',
    fxRates: { USD: 1.08, GBP: 0.85, CHF: 0.94 },
    fxSource: 'manual',
    aiEnabled: false,
    notificationsBrowser: false,
    autoLockMinutes: 10,
    dashboardWidgets: DASHBOARD_WIDGETS.map((w) => ({ id: w.id, visible: true })),
    anomalyThreshold: 3.5,
    idleCashBuffer: 3,
  };
}

export function emptyData(): FinanceData {
  return {
    version: 1,
    accounts: [],
    transactions: [],
    holdings: [],
    savingsPlans: [],
    instrumentMeta: [],
    benchmarks: [],
    snapshots: [],
    goals: [],
    consents: [],
    imports: [],
    metal: defaultMetalConfig(),
    settings: defaultSettings(),
    readNotifications: [],
    dismissedInsights: [],
    isDemo: false,
  };
}
