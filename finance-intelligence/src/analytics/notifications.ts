import type { FinanceData, NotificationItem } from '../domain/types';
import { addDays, daysBetween } from '../lib/dates';
import { fmtMoney, fmtPct } from '../lib/format';
import type { Analysis } from './index';
import { goalEta } from './forecast';
import { goalCurrent } from './goals';
import { isPlanFee } from './metal';

/** Notifiche derivate in modo deterministico dai dati: stessi dati → stessi id (lo stato "letto" resta stabile). */
export function buildNotifications(data: FinanceData, a: Analysis): NotificationItem[] {
  const cur = data.settings.baseCurrency;
  const m = (v: number) => fmtMoney(v, cur);
  const out: NotificationItem[] = [];
  const recent = addDays(a.asOf, -30);

  for (const an of a.anomalies.slice(0, 5)) {
    out.push({ id: `anomaly:${an.tx.id}`, type: 'anomaly', severity: 'warning', date: an.tx.date, title: `Spesa insolita: ${m(an.value)}`, body: `${an.tx.merchant ?? an.tx.description} — ${an.reason}.`, link: '/spese' });
  }
  for (const r of a.recurring.filter((x) => x.isSubscription && x.firstDate >= addDays(a.asOf, -45) && x.occurrences <= 3)) {
    out.push({ id: `newsub:${r.key}`, type: 'new-subscription', severity: 'info', date: r.firstDate, title: `Nuovo abbonamento: ${r.merchant}`, body: `${m(r.lastAmount)} con cadenza ${r.cadence === 'monthly' ? 'mensile' : r.cadence}. Costo annuo ${m(r.annualCost)}.`, link: '/spese' });
  }
  for (const r of a.recurring.filter((x) => x.priceIncrease && x.priceIncrease > 0.05 && x.lastDate >= recent)) {
    out.push({ id: `price:${r.key}:${r.lastDate}`, type: 'renewal', severity: 'warning', date: r.lastDate, title: `Aumento di prezzo: ${r.merchant}`, body: `L'addebito è salito del ${fmtPct(r.priceIncrease!)} rispetto al primo pagamento.`, link: '/spese' });
  }
  for (const t of data.transactions.filter((x) => x.date >= recent && (x.kind === 'fee' || (x.fee ?? 0) > 0) && !isPlanFee(x))) {
    const fee = t.kind === 'fee' ? Math.abs(t.amount) : t.fee!;
    if (fee >= 1) out.push({ id: `fee:${t.id}`, type: 'unexpected-fee', severity: 'warning', date: t.date, title: `Commissione addebitata: ${fmtMoney(fee, t.currency)}`, body: t.description, link: '/opportunita' });
  }
  for (const t of data.transactions.filter((x) => x.date >= recent && x.kind === 'dividend')) {
    out.push({ id: `div:${t.id}`, type: 'dividend', severity: 'success', date: t.date, title: `Dividendo ricevuto: ${fmtMoney(t.amount, t.currency)}`, body: t.description, link: '/investimenti' });
  }
  // variazione del portafoglio rispetto all'ultima istantanea di almeno 7 giorni prima
  const prev = [...data.snapshots].filter((s) => s.date <= addDays(a.asOf, -7)).sort((x, y) => y.date.localeCompare(x.date))[0];
  if (prev && prev.investments > 0) {
    const change = (a.netWorth.investments - prev.investments) / prev.investments;
    if (Math.abs(change) >= 0.05) out.push({ id: `pf:${prev.date}:${Math.round(change * 100)}`, type: 'portfolio-move', severity: change < 0 ? 'warning' : 'success', date: a.asOf, title: `Portafoglio ${change > 0 ? '+' : ''}${fmtPct(change)} dal ${prev.date}`, body: `Valore attuale ${m(a.netWorth.investments)} (inclusi nuovi versamenti).`, link: '/investimenti' });
  }
  for (const r of a.recurring.filter((x) => x.active && (x.cadence === 'yearly' || x.cadence === 'quarterly'))) {
    const days = daysBetween(a.asOf, r.nextExpected);
    if (days >= 0 && days <= 30) out.push({ id: `renew:${r.key}:${r.nextExpected}`, type: 'renewal', severity: 'info', date: a.asOf, title: `Rinnovo in arrivo: ${r.merchant}`, body: `Previsto il ${r.nextExpected} per circa ${m(r.lastAmount)}.`, link: '/spese' });
  }
  for (const c of data.consents.filter((x) => x.status === 'active')) {
    const days = daysBetween(a.asOf, c.validUntil.slice(0, 10));
    if (days <= 14) out.push({ id: `consent:${c.id}:${c.validUntil}`, type: 'consent-expiry', severity: 'warning', date: a.asOf, title: `Consenso ${c.aspspName} in scadenza`, body: days < 0 ? 'Il consenso è scaduto: rinnovalo per riprendere la sincronizzazione.' : `Scade tra ${days} giorni. Rinnovalo da Connessioni.`, link: '/connessioni' });
  }
  for (const u of a.metal.usages.filter((x) => x.status === 'confirmed' && !x.used && x.valuePotential > 10)) {
    out.push({ id: `benefit:${u.benefit.id}`, type: 'unused-benefit', severity: 'info', date: a.asOf, title: `Vantaggio Metal non sfruttato: ${u.benefit.name}`, body: `Valore potenziale stimato ${m(u.valuePotential)}/anno.`, link: '/revolut-metal' });
  }
  for (const g of data.goals) {
    const eta = goalEta(g, goalCurrent(g, a), 0, a.asOf);
    if (eta.progress >= 1) out.push({ id: `goal:${g.id}`, type: 'goal-reached', severity: 'success', date: a.asOf, title: `Obiettivo raggiunto: ${g.name}`, body: `Hai raggiunto ${m(g.target)}.`, link: '/obiettivi' });
  }
  const read = new Set(data.readNotifications);
  return out.map((n) => ({ ...n, read: read.has(n.id) })).sort((x, y) => y.date.localeCompare(x.date));
}
