import type { FinanceData } from '../domain/types';
import { CATEGORY_META } from '../domain/categories';
import { addDays, monthKey } from '../lib/dates';
import { fmtDate, fmtMoney, fmtMonth, fmtPct } from '../lib/format';
import { round2, sum } from '../lib/stats';
import type { Analysis } from './index';
import { findOpportunities } from './insights';
import { isPlanFee } from './metal';
import { computeNetWorth, netWorthHistory } from './networth';
import { categoryBreakdown, totalIncome, totalSpending, type Period } from './spending';

export interface AssistantAnswer {
  text: string;
  period?: string;
  facts: string[];
  estimates: string[];
  source: 'local' | 'ai';
}

export const SUGGESTED_QUESTIONS = [
  'Quanto ho speso questo mese?',
  'Quanto ho risparmiato negli ultimi sei mesi?',
  'Quali sono le mie spese ricorrenti?',
  'Quanto sto guadagnando dai miei investimenti?',
  'Quanto mi costa mantenere Revolut Metal?',
  'Sto sfruttando tutti i vantaggi di Revolut Metal?',
  'Quali commissioni sto pagando?',
  'Quanto denaro tengo fermo?',
  "Come è cambiato il mio patrimonio nell'ultimo anno?",
  'Quali sono le mie spese evitabili?',
  'Quali funzionalità delle due piattaforme non sto utilizzando?',
  'Quali aspetti della mia gestione finanziaria potrei migliorare?',
];

type Handler = (data: FinanceData, a: Analysis) => AssistantAnswer;

const periodText = (p: Period) => `${p.label} (${fmtDate(p.from, 'long')} – ${fmtDate(p.to, 'long')})`;

const INTENTS: { re: RegExp; handle: Handler }[] = [
  {
    re: /(speso|spese|spendo).*(mese|mensil)|questo mese/i,
    handle: (d, a) => {
      const m = (v: number) => fmtMoney(v, d.settings.baseCurrency);
      const p = a.periods.MTD;
      const prev = a.periods.PM;
      const spent = totalSpending(d.transactions, a.conv, p);
      const prevSpent = totalSpending(d.transactions, a.conv, prev);
      const cats = categoryBreakdown(d.transactions, a.conv, p).slice(0, 3);
      return {
        source: 'local',
        period: periodText(p),
        text: `Questo mese hai speso **${m(spent)}** in consumi (esclusi trasferimenti tra conti, investimenti e cambi valuta). Nell'intero mese precedente avevi speso ${m(prevSpent)}.`,
        facts: [
          ...cats.map((c) => `${CATEGORY_META[c.category].label}: ${m(c.total)} (${fmtPct(c.share)})`),
          `Entrate del mese: ${m(totalIncome(d.transactions, a.conv, p))}`,
        ],
        estimates: [],
      };
    },
  },
  {
    re: /risparmiat|risparmio.*(sei|6) mesi|quanto.*risparm/i,
    handle: (d, a) => {
      const m = (v: number) => fmtMoney(v, d.settings.baseCurrency);
      const months = a.flows12.slice(-7, -1);
      const total = sum(months.map((f) => f.savings));
      return {
        source: 'local',
        period: `Mesi completi da ${fmtMonth(months[0].month)} a ${fmtMonth(months[months.length - 1].month)}`,
        text: `Negli ultimi sei mesi completi hai risparmiato **${m(total)}** (entrate + interessi/dividendi − consumi − commissioni), in media ${m(total / 6)} al mese.`,
        facts: months.map((f) => `${fmtMonth(f.month)}: ${m(f.savings)} (tasso di risparmio ${fmtPct(f.savingsRate)})`),
        estimates: [`Proiezione annua al ritmo attuale: ${m(a.savings.annualProjection)} (stima, non garantita)`],
      };
    },
  },
  {
    re: /ricorrent|abbonament/i,
    handle: (d, a) => {
      const m = (v: number) => fmtMoney(v, d.settings.baseCurrency);
      const act = a.recurring.filter((r) => r.active);
      return {
        source: 'local',
        period: 'Tutto lo storico importato',
        text: `Ho individuato **${act.length} spese ricorrenti attive** per circa **${m(sum(act.map((r) => r.monthlyCost)))} al mese** (${m(sum(act.map((r) => r.annualCost)))} all'anno).`,
        facts: act.slice(0, 10).map((r) => `${r.merchant}: ${m(r.lastAmount)} ${r.cadence === 'monthly' ? '/mese' : r.cadence === 'yearly' ? '/anno' : r.cadence === 'weekly' ? '/settimana' : '/trimestre'} — prossimo ~${fmtDate(r.nextExpected)}`),
        estimates: a.forgotten.length ? [`${a.forgotten.length} abbonamenti hanno indizi di possibile non utilizzo o duplicazione (${m(sum(a.forgotten.map((f) => f.item.annualCost)))}/anno)`] : [],
      };
    },
  },
  {
    re: /guadagn.*investiment|rendiment|portafoglio|investiment/i,
    handle: (d, a) => {
      const m = (v: number) => fmtMoney(v, d.settings.baseCurrency);
      const p = a.portfolio;
      return {
        source: 'local',
        period: 'Dall\'inizio dello storico importato a oggi',
        text: `Il portafoglio vale **${m(p.value)}** a fronte di ${m(p.cost)} investiti: plusvalenza non realizzata di **${m(p.unrealized)} (${fmtPct(p.unrealizedPct, 1, true)})**. Rendimento complessivo, incluse plusvalenze realizzate e dividendi e al netto di commissioni e imposte: ${m(p.totalReturn)} (${fmtPct(p.totalReturnPct, 1, true)}).`,
        facts: [`Dividendi incassati: ${m(p.dividends)}`, `Interessi sulla liquidità Trade Republic: ${m(p.interest)}`, `Plusvalenze realizzate: ${m(p.realized)}`, `Commissioni: ${m(p.fees)}`],
        estimates: p.estimatedPrices ? [`${p.estimatedPrices} posizioni senza prezzo aggiornato: valorizzate al prezzo di carico`] : [],
      };
    },
  },
  {
    re: /cost.*metal|metal.*cost|mantenere revolut/i,
    handle: (d, a) => {
      const m = (v: number) => fmtMoney(v, d.settings.baseCurrency);
      const r = a.metal;
      if (!d.metal.monthlyFee) return { source: 'local', text: 'Non hai ancora inserito il canone del tuo piano: aprilo in Revolut → Profilo → Piano e inseriscilo nella sezione Revolut Metal per ottenere un calcolo affidabile.', facts: [], estimates: [] };
      const feeTx = d.transactions.filter((t) => t.provider === 'revolut' && /metal|plan fee|canone|abbonamento piano/i.test(t.description));
      return {
        source: 'local',
        period: 'Ultimi 12 mesi',
        text: `Il piano ${d.metal.plan} ti costa **${m(r.annualFee)} all'anno** (${m(d.metal.monthlyFee)}/mese, dato inserito da te). Il valore stimato dei vantaggi verificati che usi è ${m(r.valueCaptured)}: saldo netto **${m(r.netValue)}**.`,
        facts: feeTx.length ? [`Addebiti canone trovati nei movimenti: ${feeTx.length} per ${m(sum(feeTx.map((t) => -a.conv(t.amount, t.currency))))}`] : ['Nessun addebito del canone trovato nei movimenti importati'],
        estimates: [`Valore dei vantaggi: stima basata su ${r.verifiedCount} vantaggi verificati (vedi ipotesi nella sezione Revolut Metal)`],
      };
    },
  },
  {
    re: /vantagg|sfruttando|metal/i,
    handle: (d, a) => {
      const m = (v: number) => fmtMoney(v, d.settings.baseCurrency);
      const r = a.metal;
      const unused = r.usages.filter((u) => u.status === 'confirmed' && !u.used);
      return {
        source: 'local',
        period: 'Ultimi 12 mesi',
        text: r.score === null ? 'Non hai ancora verificato nessun vantaggio del tuo piano, quindi non posso calcolare il Metal Utilization Score in modo affidabile. Verifica i vantaggi disponibili per il tuo paese nella sezione Revolut Metal.' : `Il tuo **Metal Utilization Score è ${r.score}/100** su ${r.verifiedCount} vantaggi verificati. ${unused.length ? `Non usi: ${unused.map((u) => u.benefit.name).join(', ')}.` : 'Usi tutti i vantaggi verificati.'}`,
        facts: r.usages.filter((u) => u.status === 'confirmed').map((u) => `${u.used ? '✓' : '✗'} ${u.benefit.name} — ${u.evidence}`),
        estimates: r.valuePotential ? [`Valore potenziale aggiuntivo: ${m(r.valuePotential)}/anno`] : [],
      };
    },
  },
  {
    re: /commission|costi|fee/i,
    handle: (d, a) => {
      const m = (v: number) => fmtMoney(v, d.settings.baseCurrency);
      const since = addDays(a.asOf, -365);
      const fees = d.transactions.filter((t) => t.date > since && !isPlanFee(t) && (t.kind === 'fee' || (t.fee ?? 0) > 0));
      const byProv = new Map<string, number>();
      for (const t of fees) byProv.set(t.provider, (byProv.get(t.provider) ?? 0) + (t.kind === 'fee' ? -a.conv(t.amount, t.currency) : 0) + (t.fee ? a.conv(t.fee, t.currency) : 0));
      const total = sum([...byProv.values()]);
      return {
        source: 'local',
        period: 'Ultimi 12 mesi',
        text: `Hai pagato **${m(total)} di commissioni** esplicite negli ultimi 12 mesi${d.metal.monthlyFee ? `, a cui si aggiunge il canone Metal (${m(d.metal.monthlyFee * 12)}/anno)` : ''}.`,
        facts: [...[...byProv.entries()].map(([p, v]) => `${p === 'revolut' ? 'Revolut' : p === 'traderepublic' ? 'Trade Republic' : p}: ${m(v)}`), `Costi impliciti ETF (TER): ~${m(a.portfolio.annualTerCost)}/anno`],
        estimates: ['Il TER è un costo stimato dalla tabella strumenti, già incluso nel prezzo degli ETF e non addebitato separatamente.'],
      };
    },
  },
  {
    re: /fermo|liquidit|inattiv|cash/i,
    handle: (d, a) => {
      const m = (v: number) => fmtMoney(v, d.settings.baseCurrency);
      const noInt = a.netWorth.byAccount.filter((x) => !(x.account.interestRate ?? 0));
      const idle = sum(noInt.map((x) => x.value));
      const buffer = a.savings.avgMonthlyExpenses * d.settings.idleCashBuffer;
      return {
        source: 'local',
        period: `Saldi al ${fmtDate(a.asOf, 'long')}`,
        text: `Hai **${m(a.netWorth.cash)} di liquidità** totale, di cui ${m(idle)} su conti senza interessi. Con una riserva di ${d.settings.idleCashBuffer} mesi di spese (${m(buffer)}), la liquidità ferma oltre il necessario è circa **${m(Math.max(0, idle - buffer))}**.`,
        facts: a.netWorth.byAccount.map((x) => `${x.account.name}: ${m(x.value)}${x.account.interestRate ? ` (tasso ${fmtPct(x.account.interestRate, 2)})` : ''}`),
        estimates: [`Spesa media mensile usata per la riserva: ${m(a.savings.avgMonthlyExpenses)} (${a.savings.monthsUsed} mesi)`],
      };
    },
  },
  {
    re: /patrimonio|net worth|ultimo anno/i,
    handle: (d, a) => {
      const m = (v: number) => fmtMoney(v, d.settings.baseCurrency);
      const hist = netWorthHistory(d, a.conv, a.asOf, addDays(a.asOf, -365));
      const start = hist[0];
      const now = computeNetWorth(d, a.conv);
      const delta = now.total - start.total;
      const flows = a.flows12;
      const saved = sum(flows.map((f) => f.savings));
      return {
        source: 'local',
        period: `${fmtDate(start.date, 'long')} – ${fmtDate(a.asOf, 'long')}`,
        text: `Il patrimonio è passato da ${m(start.total)} a **${m(now.total)}** (${delta >= 0 ? '+' : ''}${m(delta)}). Circa ${m(saved)} derivano dal risparmio e il resto (${m(delta - saved)}) dall'andamento degli investimenti e da movimenti non classificati.`,
        facts: [`Liquidità: ${m(now.cash)}`, `Investimenti: ${m(now.investments)}`],
        estimates: start.reconstructed ? ['Il valore iniziale è ricostruito a ritroso dai movimenti (investimenti al costo): è una stima.'] : [],
      };
    },
  },
  {
    re: /evitabil|risparmiare|tagliare/i,
    handle: (d, a) => {
      const m = (v: number) => fmtMoney(v, d.settings.baseCurrency);
      return {
        source: 'local',
        period: 'Ultimi 6 mesi',
        text: `Ecco le spese che potresti ridurre, ordinate per impatto annuo. In totale circa **${m(sum(a.scenarios.map((s) => s.annual)))} all'anno** se applicassi tutti gli scenari.`,
        facts: a.forgotten.slice(0, 5).map((f) => `Abbonamento da verificare: ${f.item.merchant} — ${m(f.item.annualCost)}/anno`),
        estimates: a.scenarios.map((s) => `${s.title}: ${m(s.annual)}/anno — ${s.assumption}`),
      };
    },
  },
  {
    re: /funzionalit|non sto utilizzando|non uso/i,
    handle: (d, a) => {
      const unused = a.metal.usages.filter((u) => u.status !== 'not-available' && !u.used);
      const facts = unused.map((u) => `Revolut: ${u.benefit.name}${u.status === 'unverified' ? ' (da verificare se incluso nel tuo piano)' : ''}`);
      if (!d.savingsPlans.some((p) => p.active)) facts.push('Trade Republic: piani di accumulo (nessuno attivo)');
      if (!d.transactions.some((t) => t.kind === 'interest' && t.provider === 'traderepublic')) facts.push('Trade Republic: interessi sulla liquidità (nessun accredito rilevato)');
      return { source: 'local', period: 'Ultimi 12 mesi', text: `Ho trovato **${facts.length} funzionalità** che non risultano utilizzate dai tuoi dati.`, facts, estimates: [] };
    },
  },
  {
    re: /miglior|consigli|ottimizz|gestione/i,
    handle: (d, a) => {
      const m = (v: number) => fmtMoney(v, d.settings.baseCurrency);
      const ops = findOpportunities(d, a).slice(0, 6);
      return {
        source: 'local',
        period: 'Analisi su tutti i dati disponibili',
        text: `Le aree con il maggiore impatto sono:`,
        facts: ops.filter((o) => o.amountNature === 'fatto').map((o) => `${o.title} — ${m(o.amount)}/anno`),
        estimates: ops.filter((o) => o.amountNature === 'stima').map((o) => `${o.title} — ${o.amount ? `${m(o.amount)}/anno` : 'impatto non quantificabile'}`),
      };
    },
  },
];

export function answerLocally(question: string, data: FinanceData, a: Analysis): AssistantAnswer {
  if (!data.transactions.length && !data.holdings.length) {
    return { source: 'local', text: 'Non ho ancora dati da analizzare. Collega un conto o importa un estratto conto dalla sezione Connessioni.', facts: [], estimates: [] };
  }
  const intent = INTENTS.find((i) => i.re.test(question));
  if (intent) return intent.handle(data, a);
  return {
    source: 'local',
    text: "Il motore locale risponde alle domande più frequenti (prova i suggerimenti). Per domande libere attiva l'assistente AI nelle Impostazioni: riceverà solo un riepilogo aggregato dei tuoi dati, mai credenziali.",
    facts: [],
    estimates: [],
  };
}

/**
 * Riepilogo aggregato inviato al modello AI (solo se l'utente ha dato il consenso).
 * Contiene totali, categorie, ricorrenze e posizioni: niente IBAN, niente ID conto,
 * niente descrizioni libere delle singole transazioni oltre al nome esercente.
 */
export function buildAiContext(data: FinanceData, a: Analysis) {
  const ops = findOpportunities(data, a);
  const hist = netWorthHistory(data, a.conv, a.asOf, addDays(a.asOf, -365));
  const monthly = hist.filter((p, i) => i === hist.length - 1 || monthKey(p.date) !== monthKey(hist[i + 1].date));
  return {
    generatedAt: a.asOf,
    baseCurrency: data.settings.baseCurrency,
    isDemoData: data.isDemo,
    dataCoverage: { firstTransaction: data.transactions.reduce((m, t) => (t.date < m ? t.date : m), a.asOf), lastTransaction: a.asOf, transactions: data.transactions.length },
    sources: data.accounts.map((x) => ({ provider: x.provider, name: x.name, kind: x.kind, origin: x.origin })),
    netWorth: { total: a.netWorth.total, cash: a.netWorth.cash, investments: a.netWorth.investments, byProvider: a.netWorth.byProvider, pricesEstimated: a.netWorth.estimated },
    netWorthMonthEnd12m: monthly.map((p) => ({ date: p.date, total: p.total, cash: p.cash, investments: p.investments, reconstructedEstimate: p.reconstructed })),
    monthlyFlows12m: a.flows12,
    spendingByCategory: { currentMonth: a.categoriesMonth, last3Months: a.categories3m },
    recurring: a.recurring.filter((r) => r.active).map((r) => ({ merchant: r.merchant, category: r.category, cadence: r.cadence, lastAmount: r.lastAmount, annualCost: r.annualCost, nextExpected: r.nextExpected, priceIncrease: r.priceIncrease })),
    possiblyForgottenSubscriptions: a.forgotten.map((f) => ({ merchant: f.item.merchant, annualCost: f.item.annualCost, reasons: f.reasons })),
    anomalies: a.anomalies.slice(0, 10).map((x) => ({ date: x.tx.date, merchant: x.tx.merchant ?? x.tx.description, amount: x.value, typical: x.baseline, reason: x.reason })),
    habits: a.habits,
    savingScenarios: a.scenarios,
    portfolio: { ...a.portfolio, diversification: { score: a.diversification.score, effectiveN: round2(a.diversification.effectiveN), warnings: a.diversification.warnings } },
    holdings: a.holdings.map((h) => ({ name: h.name, isin: h.isin, assetClass: h.assetClass, value: h.value, cost: h.cost, pnlPct: round2(h.pnlPct * 100), weightPct: round2(h.weight * 100), priceIsEstimate: h.priceIsEstimate })),
    savingsPlans: data.savingsPlans,
    revolutMetal: {
      plan: data.metal.plan,
      country: data.metal.country,
      monthlyFeeUserEntered: data.metal.monthlyFee,
      score: a.metal.score,
      verifiedBenefits: a.metal.verifiedCount,
      unverifiedBenefits: a.metal.unverifiedCount,
      valueCapturedEstimate: a.metal.valueCaptured,
      valuePotentialEstimate: a.metal.valuePotential,
      benefits: a.metal.usages.map((u) => ({ name: u.benefit.name, status: u.status, used: u.used, evidence: u.evidence, assumption: u.assumption })),
      stats: a.metal.stats,
    },
    savingsForecast: a.savings,
    goals: data.goals.map((g) => ({ name: g.name, type: g.type, target: g.target, deadline: g.deadline })),
    opportunities: ops.slice(0, 10).map((o) => ({ title: o.title, area: o.area, amount: o.amount, nature: o.amountNature, note: o.amountNote })),
  };
}
