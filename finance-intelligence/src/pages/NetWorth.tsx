import { useState } from 'react';
import { allocationByClass } from '../analytics/portfolio';
import type { Granularity } from '../analytics/networth';
import { BarSeriesChart } from '../components/charts';
import { Card, CardHeader, inputBase, Money, NatureTag, Note, PageHeader, Segmented, Stat } from '../components/ui';
import { NetWorthChart } from '../components/widgets';
import { addDays } from '../lib/dates';
import { fmtDate, fmtMonth, fmtPct } from '../lib/format';
import { STATUS, SERIES } from '../lib/palette';
import { useStore } from '../state/store';

const CLASS_LABEL: Record<string, string> = { etf: 'ETF', stock: 'Azioni', bond: 'Obbligazioni', crypto: 'Cripto', fund: 'Fondi', derivative: 'Derivati', cash: 'Liquidità', other: 'Altro' };

export default function NetWorthPage() {
  const { data, analysis: a, update } = useStore();
  const nw = a.netWorth;
  const [g, setG] = useState<Granularity>('week');
  const [from, setFrom] = useState(addDays(a.asOf, -365));
  const [to, setTo] = useState(a.asOf);
  const classes = allocationByClass(a.holdings);

  return (
    <>
      <PageHeader title="Patrimonio" subtitle="Liquidità, investimenti e rendimenti, chiaramente separati." />
      <div className="grid gap-5 lg:grid-cols-12">
        <Card glow className="lg:col-span-12">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Patrimonio totale" value={<Money value={nw.total} />} tag={nw.estimated ? <NatureTag nature="stima" /> : undefined} />
            <Stat label="Liquidità disponibile" value={<Money value={nw.cash} />} hint="somma dei saldi dei conti" />
            <Stat label="Saldo Revolut" value={<Money value={nw.byProvider.find((p) => p.provider === 'revolut')?.cash ?? 0} />} hint="conto + salvadanai" />
            <Stat label="Trade Republic" value={<Money value={nw.tradeRepublic} />} hint={<>liquidità <Money value={nw.byProvider.find((p) => p.provider === 'traderepublic')?.cash ?? 0} /> + titoli</>} />
          </div>
          <div className="mt-6 grid gap-6 border-t border-line pt-6 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Investimenti (valore)" value={<Money value={nw.investments} />} hint={classes.map((c) => `${CLASS_LABEL[c.name] ?? c.name} ${fmtPct(c.share, 0)}`).join(' · ') || '—'} />
            <Stat label="Plus/minus non realizzate" value={<Money value={nw.unrealized} sign />} hint={<>capitale investito <Money value={nw.investedCapital} /></>} />
            <Stat label="Plusvalenze realizzate" value={<Money value={nw.realized} sign />} hint="metodo costo medio ponderato" />
            <Stat label="Interessi + dividendi" value={<Money value={nw.interest + nw.dividends} />} hint={<>interessi <Money value={nw.interest} /> · dividendi <Money value={nw.dividends} /></>} />
          </div>
        </Card>

        <Card className="lg:col-span-12">
          <CardHeader title="Evoluzione del patrimonio" subtitle="Periodo e granularità personalizzabili" />
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <label className="text-xs text-muted">
              Dal
              <input type="date" className={`${inputBase} mt-1 h-9 w-40`} value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="text-xs text-muted">
              Al
              <input type="date" className={`${inputBase} mt-1 h-9 w-40`} value={to} min={from} max={a.asOf} onChange={(e) => setTo(e.target.value)} />
            </label>
            <Segmented value={g} onChange={setG} options={[{ value: 'day', label: 'Giornaliero' }, { value: 'week', label: 'Settimanale' }, { value: 'month', label: 'Mensile' }, { value: 'year', label: 'Annuale' }]} />
          </div>
          <NetWorthChart height={300} custom={{ from, to, g }} />
        </Card>

        <Card className="lg:col-span-7">
          <CardHeader title="Entrate e uscite mensili" subtitle="Ultimi 12 mesi · trasferimenti tra conti propri esclusi" />
          <BarSeriesChart
            data={a.flows12 as unknown as Record<string, unknown>[]}
            xKey="month"
            xFormatter={fmtMonth}
            series={[
              { key: 'income', name: 'Entrate', color: SERIES[0] },
              { key: 'expenses', name: 'Uscite', color: SERIES[1] },
            ]}
          />
        </Card>
        <Card className="lg:col-span-5">
          <CardHeader title="Risparmio netto mensile" subtitle="Entrate + rendite − consumi − commissioni · il mese in corso è parziale" />
          <BarSeriesChart data={a.flows12 as unknown as Record<string, unknown>[]} xKey="month" xFormatter={fmtMonth} series={[{ key: 'savings', name: 'Risparmio', color: STATUS.good }]} signColors={{ positive: STATUS.good, negative: STATUS.serious }} />
        </Card>

        <Card className="lg:col-span-12">
          <CardHeader title="Conti" subtitle="Saldi riportati dalle fonti. Puoi indicare il tasso d'interesse per le analisi sulla liquidità." />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs text-muted">
                <tr className="border-b border-line">
                  <th className="py-2 font-medium">Conto</th>
                  <th className="py-2 font-medium">Origine</th>
                  <th className="py-2 font-medium">Aggiornato</th>
                  <th className="py-2 font-medium">Tasso annuo</th>
                  <th className="py-2 text-right font-medium">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {data.accounts.map((acc) => (
                  <tr key={acc.id} className="border-b border-line/60">
                    <td className="py-2.5 font-medium text-ink">{acc.name}</td>
                    <td className="py-2.5 text-ink-2">{{ 'open-banking': 'Open Banking', csv: 'CSV', excel: 'Excel', pdf: 'PDF', manual: 'Manuale', demo: 'Esempio' }[acc.origin]}</td>
                    <td className="py-2.5 text-ink-2">{acc.balanceDate ? fmtDate(acc.balanceDate, 'long') : '—'}</td>
                    <td className="py-2.5">
                      {acc.kind !== 'brokerage' && (
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          aria-label={`Tasso ${acc.name}`}
                          className={`${inputBase} h-8 w-24`}
                          value={acc.interestRate !== undefined ? +(acc.interestRate * 100).toFixed(2) : ''}
                          placeholder="0"
                          onChange={(e) => update((d) => ({ ...d, accounts: d.accounts.map((x) => (x.id === acc.id ? { ...x, interestRate: e.target.value === '' ? undefined : Number(e.target.value) / 100 } : x)) }))}
                        />
                      )}
                    </td>
                    <td className="py-2.5 text-right">
                      {acc.kind === 'brokerage' ? (
                        <Money value={nw.investments} />
                      ) : (
                        <input
                          type="number"
                          step="0.01"
                          aria-label={`Saldo ${acc.name}`}
                          className={`${inputBase} ml-auto h-8 w-32 text-right`}
                          value={acc.balance ?? ''}
                          placeholder="inserisci"
                          onChange={(e) => update((d) => ({ ...d, accounts: d.accounts.map((x) => (x.id === acc.id ? { ...x, balance: e.target.value === '' ? undefined : Number(e.target.value), balanceDate: a.asOf, origin: x.origin } : x)) }))}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {nw.missingBalances.length > 0 && (
            <div className="mt-3">
              <Note tone="warning">Saldo mancante per: {nw.missingBalances.join(', ')}. Inseriscilo manualmente per un patrimonio corretto.</Note>
            </div>
          )}
          <div className="mt-3">
            <Note>Per evitare doppi conteggi: i titoli sono valorizzati una sola volta (deposito titoli), la liquidità del broker è un conto separato e i bonifici tra i tuoi conti sono classificati come trasferimenti, non come entrate o spese.</Note>
          </div>
        </Card>
      </div>
    </>
  );
}
