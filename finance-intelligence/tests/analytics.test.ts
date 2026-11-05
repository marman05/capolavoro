import { describe, expect, it } from 'vitest';
import { analyze } from '../src/analytics';
import { answerLocally, SUGGESTED_QUESTIONS, buildAiContext } from '../src/analytics/assistant';
import { findOpportunities } from '../src/analytics/insights';
import { buildNotifications } from '../src/analytics/notifications';
import { netWorthHistory } from '../src/analytics/networth';
import { compareWithBenchmark } from '../src/analytics/portfolio';
import { buildDemoData } from '../src/demo/sampleData';
import { addDays } from '../src/lib/dates';

const data = buildDemoData(new Date('2026-11-05T12:00:00'));
const a = analyze(data);

describe('analisi su dati dimostrativi', () => {
  it('patrimonio = liquidità + investimenti, senza doppi conteggi', () => {
    expect(a.netWorth.total).toBeCloseTo(a.netWorth.cash + a.netWorth.investments, 1);
    expect(a.netWorth.cash).toBeGreaterThan(0);
    expect(a.netWorth.investments).toBeGreaterThan(0);
    console.log('NW', a.netWorth.total, a.netWorth.cash, a.netWorth.investments, a.netWorth.byAccount.map((b) => [b.account.name, b.value]));
  });
  it('trasferimenti tra conti non sono spese', () => {
    const tr = data.transactions.filter((t) => /trade republic/i.test(t.description) && t.provider === 'revolut');
    expect(tr.every((t) => t.kind === 'transfer')).toBe(true);
  });
  it('rileva abbonamenti ricorrenti', () => {
    const names = a.recurring.map((r) => r.merchant);
    console.log('REC', a.recurring.map((r) => `${r.merchant} ${r.cadence} ${r.lastAmount}`));
    expect(names.some((n) => /netflix/i.test(n))).toBe(true);
    expect(names.some((n) => /spotify/i.test(n))).toBe(true);
    console.log('FORGOTTEN', a.forgotten.map((f) => [f.item.merchant, f.reasons]));
  });
  it('anomalie, metal, portfolio', () => {
    console.log('ANOM', a.anomalies.map((x) => [x.tx.description, x.value, x.reason]));
    console.log('METAL', a.metal.score, a.metal.valueCaptured, a.metal.valuePotential, a.metal.stats);
    console.log('PF', a.portfolio, a.diversification.warnings);
    expect(a.metal.score).not.toBeNull();
    expect(a.portfolio.value).toBeGreaterThan(a.portfolio.cost * 0.8);
  });
  it('opportunità ordinate e con 5 elementi richiesti', () => {
    const ops = findOpportunities(data, a);
    console.log('OPS', ops.map((o) => `${o.title} ${o.amount} ${o.amountNature}`));
    for (const o of ops) {
      expect(o.found && o.why && o.how.length && o.risks).toBeTruthy();
      expect(Number.isFinite(o.amount)).toBe(true);
    }
  });
  it('assistente risponde a tutte le domande suggerite', () => {
    for (const q of SUGGESTED_QUESTIONS) {
      const r = answerLocally(q, data, a);
      expect(r.text.length).toBeGreaterThan(20);
      expect(r.text).not.toMatch(/NaN|undefined/);
      console.log('Q', q, '→', r.text.slice(0, 140));
    }
    expect(JSON.stringify(buildAiContext(data, a)).length).toBeLessThan(120_000);
  });
  it('storico e benchmark', () => {
    const h = netWorthHistory(data, a.conv, a.asOf, addDays(a.asOf, -365));
    expect(h.length).toBe(366);
    expect(h.every((p) => Number.isFinite(p.total))).toBe(true);
    const cmp = compareWithBenchmark(data, a.conv, data.benchmarks[0], a.netWorth.investments);
    expect(cmp).not.toBeNull();
    console.log('BENCH', cmp!.invested, cmp!.benchmarkFinal, cmp!.portfolioFinal);
    console.log('NOTIF', buildNotifications(data, a).map((n) => n.title));
    console.log('FLOWS', a.flows12.map((f) => `${f.month} in ${f.income} out ${f.expenses} sav ${f.savings}`));
  });
});
