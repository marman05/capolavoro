import { LineChart as LineIcon, Plus, Trash2, Upload } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { allocationByClass, compareWithBenchmark, exposure, passiveIncomeByMonth } from '../analytics/portfolio';
import { BarList, BarSeriesChart, LineSeriesChart, SegmentBar } from '../components/charts';
import { Badge, Button, Card, CardHeader, Delta, EmptyState, inputBase, inputCls, Money, NatureTag, Note, PageHeader, ScoreRing, Stat } from '../components/ui';
import { readCsv } from '../connectors/files';
import { parseAmount, parseDate, rowsFromMatrix, findColumn } from '../connectors/parse';
import type { Benchmark, SavingsPlan } from '../domain/types';
import { monthKey } from '../lib/dates';
import { fmtDate, fmtMoney, fmtMonth, fmtNum, fmtPct } from '../lib/format';
import { uid } from '../lib/id';
import { NEUTRAL, SERIES } from '../lib/palette';
import { useStore } from '../state/store';
import { Link } from 'react-router-dom';

const CLASS_LABEL: Record<string, string> = { etf: 'ETF', stock: 'Azioni', bond: 'Obbligazioni', crypto: 'Cripto', fund: 'Fondi', derivative: 'Derivati', cash: 'Liquidità', other: 'Altro' };
const FREQ: Record<SavingsPlan['frequency'], string> = { weekly: 'Settimanale', biweekly: 'Ogni 2 settimane', monthly: 'Mensile', quarterly: 'Trimestrale' };

export default function PortfolioPage() {
  const { data, analysis: a, update } = useStore();
  const p = a.portfolio;
  const [benchId, setBenchId] = useState(data.benchmarks[0]?.id ?? '');
  const bench = data.benchmarks.find((b) => b.id === benchId) ?? data.benchmarks[0];
  const cmp = useMemo(() => (bench ? compareWithBenchmark(data, a.conv, bench, p.value) : null), [data, a, bench, p.value]);
  const geo = exposure(a.holdings, 'geography');
  const sec = exposure(a.holdings, 'sectors');
  const classes = allocationByClass(a.holdings);
  const passive = passiveIncomeByMonth(data.transactions.filter((t) => t.provider === 'traderepublic'), a.conv, monthKey(a.asOf), 12);
  const fileRef = useRef<HTMLInputElement>(null);
  const [benchError, setBenchError] = useState('');

  if (!a.holdings.length && !data.transactions.some((t) => t.provider === 'traderepublic')) {
    return (
      <>
        <PageHeader title="Investimenti" />
        <EmptyState icon={<LineIcon size={22} />} title="Nessun dato Trade Republic" body="Importa l'esportazione transazioni (CSV) e l'estratto del deposito titoli (PDF) di Trade Republic per vedere portafoglio, rendimenti, dividendi e commissioni." action={<Link to="/connessioni"><Button variant="primary">Importa da Trade Republic</Button></Link>} />
      </>
    );
  }

  const setPrice = (id: string, v: string) => update((d) => ({ ...d, holdings: d.holdings.map((h) => (h.id === id ? { ...h, lastPrice: v === '' ? undefined : Number(v), lastPriceDate: new Date().toISOString().slice(0, 10) } : h)) }));

  async function importBenchmark(file: File) {
    setBenchError('');
    try {
      const { headers, rows } = rowsFromMatrix(await readCsv(file));
      const dc = findColumn(headers, ['date', 'data', 'datum']);
      const vc = findColumn(headers, ['adj close', 'close', 'chiusura', 'schluss', 'price', 'prezzo', 'value', 'valore']);
      if (!dc || !vc) throw new Error('Servono colonne Data e Chiusura/Prezzo');
      const series = rows.map((r) => ({ date: parseDate(r[dc]) ?? '', value: parseAmount(r[vc]) ?? NaN })).filter((x) => x.date && Number.isFinite(x.value)).sort((x, y) => x.date.localeCompare(y.date));
      if (series.length < 10) throw new Error('Serie troppo corta');
      const b: Benchmark = { id: uid('b_'), name: file.name.replace(/\.[^.]+$/, ''), currency: 'EUR', series, origin: 'csv' };
      update((d) => ({ ...d, benchmarks: [...d.benchmarks, b] }));
      setBenchId(b.id);
    } catch (e) {
      setBenchError((e as Error).message);
    }
  }

  return (
    <>
      <PageHeader title="Investimenti" subtitle="Portafoglio Trade Republic in sola lettura: nessun ordine può essere eseguito da qui." />
      <div className="grid gap-5 lg:grid-cols-12">
        <Card glow className="lg:col-span-12">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Valore del portafoglio" value={<Money value={p.value} />} tag={p.estimatedPrices ? <NatureTag nature="stima" /> : undefined} hint={p.estimatedPrices ? `${p.estimatedPrices} posizioni al prezzo di carico` : undefined} />
            <Stat label="Capitale investito" value={<Money value={p.cost} />} hint="costo medio incl. commissioni" />
            <Stat label="Profitto / perdita" value={<Money value={p.unrealized} sign />} delta={<Delta pct={p.unrealizedPct} />} hint="non realizzato" />
            <Stat label="Rendimento totale" value={fmtPct(p.totalReturnPct, 2, true)} hint={<>{fmtMoney(p.totalReturn, 'EUR', { sign: true })} incl. realizzato e dividendi, al netto di costi e imposte</>} />
          </div>
          <div className="mt-6 grid gap-6 border-t border-line pt-6 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Dividendi" value={<Money value={p.dividends} />} />
            <Stat label="Interessi sulla liquidità" value={<Money value={p.interest} />} />
            <Stat label="Commissioni pagate" value={<Money value={p.fees} />} hint={`imposte ${fmtMoney(p.taxes)}`} />
            <Stat label="Costi ETF (TER)" value={<Money value={p.annualTerCost} />} tag={<NatureTag nature="stima" />} hint={`${fmtPct(p.weightedTer, 2)} medio ponderato, all'anno`} />
          </div>
        </Card>

        <Card className="lg:col-span-8">
          <CardHeader
            title="Confronto con il benchmark"
            subtitle="Simulazione: gli stessi importi investiti nelle stesse date nel benchmark"
            action={
              <div className="flex items-center gap-2">
                {data.benchmarks.length > 0 && (
                  <select className={`${inputBase} h-8 w-auto text-xs`} value={bench?.id} onChange={(e) => setBenchId(e.target.value)} aria-label="Benchmark">
                    {data.benchmarks.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                )}
                <Button size="sm" onClick={() => fileRef.current?.click()}>
                  <Upload size={13} /> Benchmark CSV
                </Button>
                <input ref={fileRef} type="file" accept=".csv" hidden onChange={(e) => e.target.files?.[0] && void importBenchmark(e.target.files[0])} />
              </div>
            }
          />
          {cmp ? (
            <>
              <div className="mb-4 grid grid-cols-3 gap-4">
                <Stat label="Versato netto" value={<Money value={cmp.invested} />} />
                <Stat label="Il tuo portafoglio" value={<Money value={cmp.portfolioFinal} />} />
                <Stat label={`Con ${cmp.benchmark.name}`} value={<Money value={cmp.benchmarkFinal} />} delta={<Delta value={cmp.difference} />} hint="differenza a tuo favore" />
              </div>
              <LineSeriesChart
                data={cmp.series as unknown as Record<string, unknown>[]}
                xKey="date"
                xFormatter={(v) => fmtDate(v)}
                series={[
                  { key: 'benchmark', name: 'Benchmark simulato', color: SERIES[0] },
                  { key: 'invested', name: 'Capitale versato', color: NEUTRAL, dashed: true },
                  { key: 'portfolio', name: 'Portafoglio (istantanee)', color: SERIES[1] },
                ]}
              />
              <p className="mt-2 text-[11px] text-muted">Il benchmark non include dividendi né costi. Il valore del portafoglio è disponibile solo alle date delle istantanee salvate a ogni import/sincronizzazione. {cmp.benchmark.origin === 'demo' && 'Serie dimostrativa.'}</p>
            </>
          ) : (
            <Note>Importa una serie storica del benchmark (CSV con colonne Data e Chiusura, es. esportata dal sito dell'emittente dell'ETF) per confrontare l'andamento a parità di versamenti.</Note>
          )}
          {benchError && <p className="mt-2 text-xs text-[#ff8a8a]">{benchError}</p>}
        </Card>

        <Card className="lg:col-span-4">
          <CardHeader title="Diversificazione" subtitle="Euristiche, non consulenza" />
          <div className="flex items-center gap-4">
            <ScoreRing score={a.diversification.score} size={110} />
            <div className="text-sm text-ink-2">
              <div>Posizioni effettive: <span className="font-medium text-ink tnum">{fmtNum(a.diversification.effectiveN, 1)}</span></div>
              {a.diversification.topCountry && <div>Primo paese: {a.diversification.topCountry.name} {fmtPct(a.diversification.topCountry.share, 0)}</div>}
              {a.diversification.topSector && <div>Primo settore: {a.diversification.topSector.name} {fmtPct(a.diversification.topSector.share, 0)}</div>}
            </div>
          </div>
          <ul className="mt-4 space-y-2">
            {a.diversification.warnings.map((w) => (
              <li key={w} className="rounded-lg border border-warning/20 bg-warning/[0.05] px-3 py-2 text-xs text-ink-2">{w}</li>
            ))}
            {!a.diversification.warnings.length && <li className="text-xs text-muted">Nessuna concentrazione eccessiva rilevata.</li>}
          </ul>
        </Card>

        <Card className="lg:col-span-12">
          <CardHeader title="Posizioni" subtitle="Aggiorna l'ultimo prezzo per valorizzare correttamente il portafoglio (dall'app Trade Republic o dal sito dell'emittente)" />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="text-left text-xs text-muted">
                <tr className="border-b border-line">
                  <th className="py-2 font-medium">Strumento</th>
                  <th className="py-2 text-right font-medium">Quantità</th>
                  <th className="py-2 text-right font-medium">Prezzo medio</th>
                  <th className="py-2 text-right font-medium">Ultimo prezzo</th>
                  <th className="py-2 text-right font-medium">Valore</th>
                  <th className="py-2 text-right font-medium">P/L</th>
                  <th className="py-2 text-right font-medium">Peso</th>
                </tr>
              </thead>
              <tbody>
                {a.holdings.map((h) => (
                  <tr key={h.id} className="border-b border-line/60">
                    <td className="py-2.5">
                      <div className="font-medium text-ink">{h.name}</div>
                      <div className="flex items-center gap-1.5 text-xs text-muted">
                        {h.isin} · <Badge>{CLASS_LABEL[h.assetClass]}</Badge> {h.meta?.ter !== undefined && <span>TER {fmtPct(h.meta.ter, 2)}</span>}
                      </div>
                    </td>
                    <td className="py-2.5 text-right tnum">{fmtNum(h.quantity, 4)}</td>
                    <td className="py-2.5 text-right tnum">{fmtMoney(h.avgCost, h.currency)}</td>
                    <td className="py-2.5 text-right">
                      <input type="number" step="0.01" min="0" className={`${inputBase} ml-auto h-8 w-28 text-right`} value={h.lastPrice ?? ''} placeholder="prezzo" onChange={(e) => setPrice(h.id, e.target.value)} aria-label={`Prezzo ${h.name}`} />
                      <div className="mt-0.5 text-[10px] text-muted">{h.lastPriceDate ? `al ${fmtDate(h.lastPriceDate, 'long')}` : 'non disponibile'}</div>
                    </td>
                    <td className="py-2.5 text-right font-medium tnum">{fmtMoney(h.value)}</td>
                    <td className="py-2.5 text-right">
                      <div className="tnum">{fmtMoney(h.pnl, 'EUR', { sign: true })}</div>
                      <Delta pct={h.pnlPct} />
                    </td>
                    <td className="py-2.5 text-right tnum">{fmtPct(h.weight, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="lg:col-span-4">
          <CardHeader title="Distribuzione" subtitle="Per classe di attivo" />
          <SegmentBar items={classes.map((c, i) => ({ label: CLASS_LABEL[c.name] ?? c.name, value: c.value, color: SERIES[i % SERIES.length] }))} />
        </Card>
        <Card className="lg:col-span-4">
          <CardHeader title="Esposizione geografica" subtitle={`Stima da composizioni indicative · copertura ${fmtPct(geo.coverage, 0)}`} />
          <BarList items={geo.items.slice(0, 8).map((g) => ({ label: g.name, value: g.value, color: SERIES[0], extra: <span className="text-xs text-muted">{fmtPct(g.share, 0)}</span> }))} />
        </Card>
        <Card className="lg:col-span-4">
          <CardHeader title="Esposizione settoriale" subtitle={`Stima · copertura ${fmtPct(sec.coverage, 0)}`} />
          <BarList items={sec.items.slice(0, 8).map((g) => ({ label: g.name, value: g.value, color: SERIES[2], extra: <span className="text-xs text-muted">{fmtPct(g.share, 0)}</span> }))} />
        </Card>

        <Card className="lg:col-span-7">
          <CardHeader title="Dividendi e interessi" subtitle="Trade Republic · ultimi 12 mesi" />
          <BarSeriesChart data={passive as unknown as Record<string, unknown>[]} xKey="month" xFormatter={fmtMonth} stacked series={[{ key: 'interest', name: 'Interessi', color: SERIES[0] }, { key: 'dividends', name: 'Dividendi', color: SERIES[2] }]} />
        </Card>
        <SavingsPlans />
      </div>
    </>
  );
}

function SavingsPlans() {
  const { data, update } = useStore();
  const [form, setForm] = useState({ name: '', isin: '', amount: '', frequency: 'monthly' as SavingsPlan['frequency'] });
  const add = () => {
    if (!form.name || !Number(form.amount)) return;
    update((d) => ({ ...d, savingsPlans: [...d.savingsPlans, { id: uid('pac_'), name: form.name, isin: form.isin.toUpperCase(), amount: Number(form.amount), currency: 'EUR', frequency: form.frequency, active: true }] }));
    setForm({ name: '', isin: '', amount: '', frequency: 'monthly' });
  };
  const monthly = data.savingsPlans.filter((p) => p.active).reduce((s, p) => s + p.amount * { weekly: 52 / 12, biweekly: 26 / 12, monthly: 1, quarterly: 1 / 3 }[p.frequency], 0);
  return (
    <Card className="lg:col-span-5">
      <CardHeader title="Piani di accumulo (PAC)" subtitle={`${fmtMoney(monthly)} al mese · i PAC non sono esposti dall'export: inseriscili o verificali qui`} />
      <ul className="space-y-2">
        {data.savingsPlans.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-page px-3 py-2 text-sm">
            <div className="min-w-0">
              <div className="truncate font-medium text-ink">{p.name}</div>
              <div className="text-xs text-muted">{FREQ[p.frequency]} {p.nextExecution && `· prossimo ${fmtDate(p.nextExecution, 'long')}`}</div>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium tnum">{fmtMoney(p.amount)}</span>
              <label className="flex items-center gap-1 text-xs text-muted">
                <input type="checkbox" checked={p.active} className="accent-[#9085e9]" onChange={(e) => update((d) => ({ ...d, savingsPlans: d.savingsPlans.map((x) => (x.id === p.id ? { ...x, active: e.target.checked } : x)) }))} /> attivo
              </label>
              <button className="rounded p-1 text-muted hover:text-ink" onClick={() => update((d) => ({ ...d, savingsPlans: d.savingsPlans.filter((x) => x.id !== p.id) }))} aria-label="Rimuovi">
                <Trash2 size={14} />
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <input className={inputCls} placeholder="Nome strumento" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className={inputCls} placeholder="ISIN (opz.)" value={form.isin} onChange={(e) => setForm({ ...form, isin: e.target.value })} />
        <input className={inputCls} type="number" placeholder="Importo €" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        <select className={inputCls} value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value as SavingsPlan['frequency'] })}>
          {Object.entries(FREQ).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>
      <Button size="sm" className="mt-2" onClick={add}>
        <Plus size={14} /> Aggiungi PAC
      </Button>
    </Card>
  );
}
