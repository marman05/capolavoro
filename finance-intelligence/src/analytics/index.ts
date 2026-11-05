import { makeConverter } from '../domain/fx';
import type { FinanceData } from '../domain/types';
import { addDays, monthKey } from '../lib/dates';
import { metalReport } from './metal';
import { computeNetWorth, dataAsOf, periodPresets } from './networth';
import { diversification, holdingViews, portfolioSummary } from './portfolio';
import {
  categoryBreakdown,
  detectAnomalies,
  detectRecurring,
  forgottenSubscriptions,
  monthlyFlows,
  savingScenarios,
  spendingHabits,
} from './spending';
import { savingsForecast } from './forecast';

export type Analysis = ReturnType<typeof analyze>;

/** Calcola tutte le analisi una volta sola; le pagine leggono da qui. */
export function analyze(data: FinanceData) {
  const conv = makeConverter(data.settings);
  const asOf = dataAsOf(data);
  const periods = periodPresets(asOf);
  const confirmedInUse = data.dismissedInsights.filter((d) => d.startsWith('inuse:')).map((d) => d.slice(6));
  const recurring = detectRecurring(data.transactions, conv, asOf);
  const forgotten = forgottenSubscriptions(recurring, asOf, confirmedInUse);
  const flows12 = monthlyFlows(data.transactions, conv, monthKey(asOf), 12);
  const views = holdingViews(data, conv);
  const sixMonths = { from: addDays(asOf, -182), to: asOf, label: 'Ultimi 6 mesi' };
  return {
    conv,
    asOf,
    periods,
    netWorth: computeNetWorth(data, conv),
    flows12,
    recurring,
    forgotten,
    anomalies: detectAnomalies(data.transactions, conv, asOf, 60, data.settings.anomalyThreshold, new Set(recurring.map((r) => r.key))),
    categories3m: categoryBreakdown(data.transactions, conv, periods['3M']),
    categoriesMonth: categoryBreakdown(data.transactions, conv, periods.MTD),
    habits: spendingHabits(data.transactions, conv, periods['3M']),
    scenarios: savingScenarios(data.transactions, conv, sixMonths, recurring, forgotten),
    holdings: views,
    portfolio: portfolioSummary(data, conv),
    diversification: diversification(views),
    metal: metalReport(data, conv, asOf),
    savings: savingsForecast(monthlyFlows(data.transactions, conv, monthKey(asOf), 7), 0.65),
  };
}
