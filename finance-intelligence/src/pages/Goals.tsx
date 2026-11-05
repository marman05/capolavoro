import { CheckCircle2, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { goalEta, project, recurringForecast, SCENARIOS } from '../analytics/forecast';
import { goalCurrent } from '../analytics/goals';
import { BarSeriesChart, LineSeriesChart } from '../components/charts';
import { Badge, Button, Card, CardHeader, Field, inputCls, Money, NatureTag, Note, PageHeader, ProgressBar, Stat } from '../components/ui';
import type { Goal } from '../domain/types';
import { fmtDate, fmtMoney, fmtMonth } from '../lib/format';
import { uid } from '../lib/id';
import { NEUTRAL, SERIES, STATUS } from '../lib/palette';
import { useStore } from '../state/store';

const TYPE_LABEL: Record<Goal['type'], string> = { emergency: 'Fondo emergenza', investment: 'Investimento', savings: 'Risparmio', purchase: 'Acquisto' };
const LINK_LABEL: Record<NonNullable<Goal['linkedTo']>, string> = { cash: 'Liquidità totale', investments: 'Investimenti', networth: 'Patrimonio netto', manual: 'Manuale' };

export default function GoalsPage() {
  const { analysis: a } = useStore();
  const s = a.savings;
  const [monthly, setMonthly] = useState(Math.max(0, Math.round(s.avgMonthlySavings)));
  const [years, setYears] = useState(10);
  const [inflation, setInflation] = useState(2);
  const [emergencyMonths, setEmergencyMonths] = useState(6);

  const projections = useMemo(() => {
    const runs = SCENARIOS.map((sc) => project({ startValue: a.netWorth.total, monthlyContribution: monthly, annualReturn: sc.rate, years, annualInflation: inflation / 100 }));
    return runs[0].filter((_, i) => i % 12 === 0).map((p, idx) => {
      const row: Record<string, number | string> = { year: `${idx}`, contributed: p.contributed };
      SCENARIOS.forEach((sc, k) => (row[sc.id] = runs[k][idx * 12].value));
      return row;
    });
  }, [a.netWorth.total, monthly, years, inflation]);
  const last = projections[projections.length - 1];
  const emergencyTarget = s.essentialMonthly * emergencyMonths;
  const recForecast = recurringForecast(a.recurring, a.asOf, 12);

  return (
    <>
      <PageHeader title="Previsioni e obiettivi" subtitle="Simulazioni con ipotesi esplicite. Nessuna previsione è un rendimento garantito." />
      <div className="grid gap-5 lg:grid-cols-12">
        <Card glow className="lg:col-span-12">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Risparmio medio mensile" value={<Money value={s.avgMonthlySavings} />} tag={<NatureTag nature="fatto" />} hint={`media degli ultimi ${s.monthsUsed} mesi completi`} />
            <Stat label="Previsione risparmio annuale" value={<Money value={s.annualProjection} />} tag={<NatureTag nature="stima" />} hint="se il ritmo resta invariato" />
            <Stat label="Spesa media mensile" value={<Money value={s.avgMonthlyExpenses} />} hint={`essenziali stimate ${fmtMoney(s.essentialMonthly)}`} />
            <Stat label="Spese ricorrenti prossimi 12 mesi" value={<Money value={recForecast.reduce((x, r) => x + r.total, 0)} />} tag={<NatureTag nature="stima" />} />
          </div>
        </Card>

        <Card className="lg:col-span-8">
          <CardHeader title="Evoluzione prevista del patrimonio" subtitle="Scenari a rendimento annuo costante · valori nominali" />
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <Field label={`Versamento mensile: ${fmtMoney(monthly)}`}>
              <input type="range" min={0} max={Math.max(3000, monthly * 2)} step={25} value={monthly} onChange={(e) => setMonthly(Number(e.target.value))} className="w-full accent-[#9085e9]" />
            </Field>
            <Field label={`Orizzonte: ${years} anni`}>
              <input type="range" min={1} max={40} value={years} onChange={(e) => setYears(Number(e.target.value))} className="w-full accent-[#9085e9]" />
            </Field>
            <Field label={`Inflazione ipotizzata: ${inflation}%`}>
              <input type="range" min={0} max={6} step={0.5} value={inflation} onChange={(e) => setInflation(Number(e.target.value))} className="w-full accent-[#9085e9]" />
            </Field>
          </div>
          <LineSeriesChart
            data={projections}
            xKey="year"
            xFormatter={(v) => `Anno ${v}`}
            height={300}
            series={[{ key: 'contributed', name: 'Solo versamenti', color: NEUTRAL, dashed: true }, ...SCENARIOS.map((sc, i) => ({ key: sc.id, name: sc.label, color: SERIES[i] }))]}
          />
        </Card>
        <Card className="lg:col-span-4">
          <CardHeader title={`Tra ${years} anni`} subtitle="Valori nominali" />
          <ul className="space-y-3">
            {SCENARIOS.map((sc, i) => {
              const nominal = Number(last[sc.id]);
              const real = nominal / Math.pow(1 + inflation / 100, years);
              return (
                <li key={sc.id} className="rounded-xl border border-line bg-page p-3">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm text-ink-2"><span className="h-2 w-2 rounded-full" style={{ background: SERIES[i] }} />{sc.label}</span>
                    <Money value={nominal} className="font-semibold" />
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted">in potere d'acquisto di oggi ≈ {fmtMoney(real)} · {sc.note}</div>
                </li>
              );
            })}
          </ul>
          <div className="mt-3">
            <Note tone="warning">
              Ipotesi: patrimonio iniziale {fmtMoney(a.netWorth.total)}, versamento costante di {fmtMoney(monthly)}/mese, rendimento annuo costante capitalizzato mensilmente, nessuna imposta né costo, inflazione {inflation}%. I mercati reali hanno anni negativi: i risultati possono essere molto diversi.
            </Note>
          </div>
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader title="Fondo emergenza" subtitle="Quanto tenere in liquidità per gli imprevisti" />
          <Field label={`Mesi di spese essenziali da coprire: ${emergencyMonths}`}>
            <input type="range" min={3} max={12} value={emergencyMonths} onChange={(e) => setEmergencyMonths(Number(e.target.value))} className="w-full accent-[#9085e9]" />
          </Field>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <Stat label="Obiettivo consigliato" value={<Money value={emergencyTarget} />} tag={<NatureTag nature="stima" />} hint={`${emergencyMonths} × ${fmtMoney(s.essentialMonthly)}`} />
            <Stat label="Liquidità attuale" value={<Money value={a.netWorth.cash} />} hint={a.netWorth.cash >= emergencyTarget ? 'coperto' : `mancano ${fmtMoney(emergencyTarget - a.netWorth.cash)}`} />
          </div>
          <ProgressBar className="mt-4" value={emergencyTarget ? a.netWorth.cash / emergencyTarget : 0} color={a.netWorth.cash >= emergencyTarget ? STATUS.good : STATUS.warning} />
          <p className="mt-3 text-[11px] text-muted">Spese essenziali stimate come il 65% della spesa media (affitto, utenze, spesa alimentare, trasporti). Modifica l'obiettivo in base alla tua situazione lavorativa e familiare.</p>
        </Card>
        <Card className="lg:col-span-7">
          <CardHeader title="Previsione delle spese ricorrenti" subtitle="Prossimi 12 mesi, dalle ricorrenze attive rilevate" />
          <BarSeriesChart data={recForecast as unknown as Record<string, unknown>[]} xKey="month" xFormatter={fmtMonth} series={[{ key: 'total', name: 'Spese ricorrenti', color: SERIES[1] }]} />
        </Card>

        <GoalsList />
      </div>
    </>
  );
}

function GoalsList() {
  const { data, analysis: a, update } = useStore();
  const [form, setForm] = useState({ name: '', type: 'savings' as Goal['type'], target: '', linkedTo: 'cash' as NonNullable<Goal['linkedTo']>, deadline: '', monthly: '' });
  const defaultContribution = Math.max(0, a.savings.avgMonthlySavings);
  const add = () => {
    if (!form.name || !Number(form.target)) return;
    update((d) => ({ ...d, goals: [...d.goals, { id: uid('g_'), name: form.name, type: form.type, target: Number(form.target), linkedTo: form.linkedTo, current: form.linkedTo === 'manual' ? 0 : undefined, deadline: form.deadline || undefined, monthlyContribution: form.monthly ? Number(form.monthly) : undefined, createdAt: a.asOf }] }));
    setForm({ ...form, name: '', target: '', deadline: '', monthly: '' });
  };
  return (
    <Card className="lg:col-span-12">
      <CardHeader title="I tuoi obiettivi" subtitle="Il progresso si aggiorna automaticamente quando l'obiettivo è collegato a liquidità, investimenti o patrimonio" />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data.goals.map((g) => {
          const current = goalCurrent(g, a);
          const contribution = g.monthlyContribution ?? defaultContribution;
          const eta = goalEta(g, current, contribution, a.asOf);
          return (
            <div key={g.id} className="rounded-2xl border border-line bg-elevated/50 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 font-medium text-ink">
                    {g.name} {eta.progress >= 1 && <CheckCircle2 size={15} className="text-good" />}
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-1.5">
                    <Badge>{TYPE_LABEL[g.type]}</Badge>
                    <Badge tone="info">{LINK_LABEL[g.linkedTo ?? 'manual']}</Badge>
                  </div>
                </div>
                <button className="rounded p-1 text-muted hover:text-ink" onClick={() => update((d) => ({ ...d, goals: d.goals.filter((x) => x.id !== g.id) }))} aria-label="Elimina obiettivo">
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="mt-3 flex items-baseline justify-between text-sm">
                <Money value={current} className="text-lg font-semibold" />
                <span className="text-muted">di {fmtMoney(g.target)}</span>
              </div>
              <ProgressBar className="mt-2" value={eta.progress} color={eta.progress >= 1 ? STATUS.good : 'var(--color-accent)'} />
              <div className="mt-2 text-xs text-ink-2">
                {eta.progress >= 1 ? 'Obiettivo raggiunto 🎉' : eta.date ? <>Previsto: <strong className="text-ink">{fmtDate(eta.date, 'long')}</strong> con {fmtMoney(contribution)}/mese</> : 'Imposta un versamento mensile per stimare la data'}
                {g.deadline && eta.progress < 1 && <span className={eta.onTrack ? ' text-good' : ' text-serious'}> · scadenza {fmtDate(g.deadline, 'long')} {eta.onTrack ? '(in linea)' : '(in ritardo)'}</span>}
              </div>
              {g.linkedTo === 'manual' && (
                <input type="number" className={`${inputCls} mt-2 h-8`} placeholder="Importo attuale" value={g.current ?? ''} onChange={(e) => update((d) => ({ ...d, goals: d.goals.map((x) => (x.id === g.id ? { ...x, current: Number(e.target.value) } : x)) }))} />
              )}
              <div className="mt-1 text-[10px] text-muted">Stima a versamento costante, senza considerare rendimenti.</div>
            </div>
          );
        })}
      </div>
      <div className="mt-5 grid gap-2 border-t border-line pt-5 sm:grid-cols-2 lg:grid-cols-6">
        <input className={`${inputCls} lg:col-span-2`} placeholder="Nome obiettivo" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <select className={inputCls} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as Goal['type'] })}>
          {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input className={inputCls} type="number" placeholder="Importo obiettivo €" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} />
        <select className={inputCls} value={form.linkedTo} onChange={(e) => setForm({ ...form, linkedTo: e.target.value as NonNullable<Goal['linkedTo']> })}>
          {Object.entries(LINK_LABEL).map(([k, v]) => <option key={k} value={k}>Collega a: {v}</option>)}
        </select>
        <input className={inputCls} type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} aria-label="Scadenza" />
        <input className={`${inputCls} lg:col-span-2`} type="number" placeholder={`Versamento mensile (default ${Math.round(defaultContribution)} €)`} value={form.monthly} onChange={(e) => setForm({ ...form, monthly: e.target.value })} />
        <Button onClick={add} className="lg:col-span-1">
          <Plus size={15} /> Aggiungi
        </Button>
      </div>
    </Card>
  );
}
