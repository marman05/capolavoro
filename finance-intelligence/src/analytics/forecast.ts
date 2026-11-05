import type { Goal } from '../domain/types';
import { addMonths } from '../lib/dates';
import { mean, round2 } from '../lib/stats';
import type { MonthFlow, RecurringItem } from './spending';

export interface ProjectionInput {
  startValue: number;
  monthlyContribution: number;
  annualReturn: number;
  years: number;
  annualInflation?: number;
}

/** Proiezione deterministica con capitalizzazione mensile. Non è una previsione garantita. */
export function project({ startValue, monthlyContribution, annualReturn, years, annualInflation = 0 }: ProjectionInput) {
  const r = Math.pow(1 + annualReturn, 1 / 12) - 1;
  const inf = Math.pow(1 + annualInflation, 1 / 12) - 1;
  const points: { month: number; value: number; contributed: number; real: number }[] = [];
  let v = startValue;
  let contributed = startValue;
  for (let m = 0; m <= years * 12; m++) {
    if (m > 0) {
      v = v * (1 + r) + monthlyContribution;
      contributed += monthlyContribution;
    }
    points.push({ month: m, value: round2(v), contributed: round2(contributed), real: round2(v / Math.pow(1 + inf, m)) });
  }
  return points;
}

export const SCENARIOS = [
  { id: 'cash', label: 'Prudente 2%', rate: 0.02, note: 'Simile a un rendimento da liquidità/obbligazioni a breve, non garantito nel tempo.' },
  { id: 'balanced', label: 'Bilanciato 4%', rate: 0.04, note: 'Ipotesi per un portafoglio misto azioni/obbligazioni.' },
  { id: 'equity', label: 'Azionario 6%', rate: 0.06, note: 'Ipotesi di lungo periodo per un azionario globale diversificato, con ampie oscillazioni annue.' },
  { id: 'optimistic', label: 'Ottimistico 8%', rate: 0.08, note: 'Scenario favorevole: non usarlo come base per decisioni.' },
];

export interface SavingsForecast {
  avgMonthlySavings: number;
  monthsUsed: number;
  annualProjection: number;
  avgMonthlyExpenses: number;
  essentialMonthly: number;
}

export function savingsForecast(flows: MonthFlow[], essentialShare: number): SavingsForecast {
  // si escludono i mesi senza alcun dato per non sottostimare
  const valid = flows.filter((f) => f.income || f.expenses);
  const complete = valid.slice(0, -1).length >= 3 ? valid.slice(0, -1) : valid; // il mese in corso è parziale
  const avg = mean(complete.map((f) => f.savings));
  const exp = mean(complete.map((f) => f.expenses));
  return {
    avgMonthlySavings: round2(avg),
    monthsUsed: complete.length,
    annualProjection: round2(avg * 12),
    avgMonthlyExpenses: round2(exp),
    essentialMonthly: round2(exp * essentialShare),
  };
}

export function goalEta(goal: Goal, current: number, monthlyContribution: number, asOf: string): { months: number | null; date: string | null; progress: number; onTrack: boolean | null } {
  const progress = goal.target ? Math.min(1, current / goal.target) : 0;
  if (current >= goal.target) return { months: 0, date: asOf, progress: 1, onTrack: true };
  if (monthlyContribution <= 0) return { months: null, date: null, progress, onTrack: goal.deadline ? false : null };
  const months = Math.ceil((goal.target - current) / monthlyContribution);
  const date = addMonths(asOf, months);
  return { months, date, progress, onTrack: goal.deadline ? date <= goal.deadline : null };
}

export function recurringForecast(rec: RecurringItem[], asOf: string, months = 12) {
  const end = addMonths(asOf, months);
  const rows = new Map<string, number>();
  for (let i = 0; i < months; i++) rows.set(addMonths(asOf, i + 1).slice(0, 7), 0);
  const stepMonths: Record<string, number> = { monthly: 1, quarterly: 3, yearly: 12 };
  for (const r of rec.filter((x) => x.active)) {
    if (r.cadence === 'weekly') {
      for (const k of rows.keys()) rows.set(k, rows.get(k)! + r.lastAmount * (52 / 12));
      continue;
    }
    let d = r.nextExpected;
    while (d <= end) {
      const k = d.slice(0, 7);
      if (rows.has(k)) rows.set(k, rows.get(k)! + r.lastAmount);
      d = addMonths(d, stepMonths[r.cadence]);
    }
  }
  return [...rows.entries()].map(([month, total]) => ({ month, total: round2(total) }));
}
