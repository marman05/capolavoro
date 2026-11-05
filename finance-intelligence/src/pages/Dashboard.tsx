import clsx from 'clsx';
import { ArrowDown, ArrowUp, Cable, Eye, EyeOff, LayoutGrid, Sparkles, Wallet } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { findOpportunities } from '../analytics/insights';
import { netWorthHistory } from '../analytics/networth';
import { addDays } from '../lib/dates';
import { BarList, SegmentBar } from '../components/charts';
import { Badge, Button, Card, CardHeader, Delta, EmptyState, Money, NatureTag, PageHeader, ScoreRing, Stat } from '../components/ui';
import { NetWorthChart, OpportunityCard, TransactionList } from '../components/widgets';
import { CATEGORY_META } from '../domain/categories';
import { DASHBOARD_WIDGETS } from '../domain/defaults';
import { fmtDate, fmtPct } from '../lib/format';
import { SERIES } from '../lib/palette';
import { useStore } from '../state/store';

export default function Dashboard() {
  const { data, analysis: a, update, loadDemo } = useStore();
  const [editing, setEditing] = useState(false);
  const ops = useMemo(() => findOpportunities(data, a), [data, a]);

  if (!data.transactions.length && !data.holdings.length) {
    return (
      <>
        <PageHeader title="Benvenuto" subtitle="Il tuo Personal Finance Intelligence Center per Revolut Metal e Trade Republic." />
        <EmptyState
          icon={<Wallet size={22} />}
          title="Nessun dato ancora"
          body="Collega Revolut tramite Open Banking (sola lettura) oppure importa gli estratti conto CSV, Excel o PDF di Revolut e Trade Republic. Puoi anche esplorare l'app con dati di esempio chiaramente etichettati."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link to="/connessioni">
                <Button variant="primary">
                  <Cable size={16} /> Collega o importa
                </Button>
              </Link>
              <Button onClick={() => void loadDemo()}>Esplora con dati di esempio</Button>
            </div>
          }
        />
      </>
    );
  }

  const nw = a.netWorth;
  // performance mensile: variazione del patrimonio negli ultimi 30 giorni (risparmio + andamento investimenti)
  const hist30 = netWorthHistory(data, a.conv, a.asOf, addDays(a.asOf, -30));
  const monthPerf = nw.total - (hist30[0]?.total ?? nw.total);
  const month = a.flows12[a.flows12.length - 1];
  const prevMonth = a.flows12[a.flows12.length - 2];
  const widgets = data.settings.dashboardWidgets;
  const move = (id: string, dir: -1 | 1) =>
    update((d) => {
      const list = [...d.settings.dashboardWidgets];
      const i = list.findIndex((w) => w.id === id);
      const j = i + dir;
      if (j < 0 || j >= list.length) return d;
      [list[i], list[j]] = [list[j], list[i]];
      return { ...d, settings: { ...d.settings, dashboardWidgets: list } };
    });
  const toggle = (id: string) => update((d) => ({ ...d, settings: { ...d.settings, dashboardWidgets: d.settings.dashboardWidgets.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w)) } }));


  const blocks: Record<string, { node: ReactNode; span: string }> = {
    kpis: {
      span: 'lg:col-span-12',
      node: (
        <Card glow className="!p-6">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
            <div className="sm:col-span-2 lg:col-span-2">
              <div className="flex items-center gap-2 text-xs font-medium text-muted">
                Patrimonio netto {nw.estimated ? <NatureTag nature="stima" /> : <NatureTag nature="fatto" />}
              </div>
              <div className="mt-1 text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
                <Money value={nw.total} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                <span>al {fmtDate(a.asOf, 'long')}</span>
                {nw.estimated && <span>· alcune posizioni valorizzate al costo</span>}
              </div>
            </div>
            <Stat label="Liquidità totale" value={<Money value={nw.cash} />} hint={`${Math.round((nw.cash / (nw.total || 1)) * 100)}% del patrimonio`} />
            <Stat label="Investimenti" value={<Money value={nw.investments} />} delta={<Delta pct={a.portfolio.unrealizedPct} />} hint="vs capitale investito" />
            <Stat label="Performance mensile" value={<Money value={monthPerf} sign />} delta={<Delta pct={hist30[0]?.total ? monthPerf / hist30[0].total : 0} />} hint="variazione patrimonio, ultimi 30 giorni" tag={hist30[0]?.reconstructed ? <NatureTag nature="ricostruito" /> : undefined} />
          </div>
        </Card>
      ),
    },
    'networth-chart': {
      span: 'lg:col-span-8',
      node: (
        <Card className="h-full">
          <CardHeader title="Evoluzione del patrimonio" subtitle="Liquidità + investimenti, senza doppi conteggi" action={<Link to="/patrimonio" className="text-xs text-muted hover:text-ink">Dettagli →</Link>} />
          <NetWorthChart height={250} />
        </Card>
      ),
    },
    flows: {
      span: 'lg:col-span-4',
      node: (
        <Card className="h-full">
          <CardHeader title="Entrate e uscite del mese" subtitle={a.periods.MTD.label} />
          <div className="space-y-4">
            <Stat label="Entrate" value={<Money value={month?.income ?? 0} className="text-[#5fd35f]" />} />
            <Stat label="Uscite (consumi)" value={<Money value={month?.expenses ?? 0} />} delta={prevMonth ? <Delta pct={prevMonth.expenses ? (month.expenses - prevMonth.expenses) / prevMonth.expenses : 0} inverse /> : undefined} hint="vs mese scorso (intero)" />
            <div className="grid grid-cols-2 gap-3 border-t border-line pt-4">
              <Stat label="Investito" value={<Money value={month?.investmentsNet ?? 0} />} />
              <Stat label="Interessi e dividendi" value={<Money value={month?.passiveIncome ?? 0} />} />
            </div>
          </div>
        </Card>
      ),
    },
    distribution: {
      span: 'lg:col-span-4',
      node: (
        <Card className="h-full">
          <CardHeader title="Distribuzione del denaro" />
          <SegmentBar
            items={[
              ...nw.byAccount.filter((b) => b.value > 0).map((b, i) => ({ label: b.account.name, value: b.value, color: SERIES[[0, 6, 3, 4][i % 4]] })),
              ...(nw.investments > 0 ? [{ label: 'Trade Republic – Investimenti', value: nw.investments, color: SERIES[2] }] : []),
            ]}
          />
        </Card>
      ),
    },
    opportunities: {
      span: 'lg:col-span-8',
      node: (
        <Card className="h-full">
          <CardHeader icon={<Sparkles size={16} className="text-accent" />} title="Le 3 migliori opportunità" subtitle="Ordinate per impatto economico e rilevanza" action={<Link to="/opportunita" className="text-xs text-muted hover:text-ink">Tutte ({ops.length}) →</Link>} />
          <div className="grid gap-3 md:grid-cols-3">
            {ops.slice(0, 3).map((o) => (
              <OpportunityCard key={o.id} o={o} compact />
            ))}
            {!ops.length && <p className="text-sm text-muted">Nessuna opportunità rilevata al momento.</p>}
          </div>
        </Card>
      ),
    },
    'metal-score': {
      span: 'lg:col-span-4',
      node: (
        <Card className="h-full">
          <CardHeader title="Metal Utilization Score" subtitle={a.metal.score === null ? 'Verifica i vantaggi del tuo piano' : `${a.metal.verifiedCount} vantaggi verificati`} action={<Link to="/revolut-metal" className="text-xs text-muted hover:text-ink">Analisi →</Link>} />
          <div className="flex items-center gap-5">
            <ScoreRing score={a.metal.score} size={120} />
            <div className="space-y-2 text-sm">
              <div>
                <div className="text-xs text-muted">Valore ottenuto (stima)</div>
                <Money value={a.metal.valueCaptured} className="font-semibold" />
              </div>
              <div>
                <div className="text-xs text-muted">Costo annuo piano</div>
                <Money value={a.metal.annualFee} className="font-semibold" />
              </div>
              {a.metal.valuePotential > 0 && <Badge tone="warning">+<Money value={a.metal.valuePotential} /> potenziali</Badge>}
            </div>
          </div>
        </Card>
      ),
    },
    'top-spending': {
      span: 'lg:col-span-4',
      node: (
        <Card className="h-full">
          <CardHeader title="Principali spese" subtitle={a.periods.MTD.label} action={<Link to="/spese" className="text-xs text-muted hover:text-ink">Analisi →</Link>} />
          <BarList items={a.categoriesMonth.slice(0, 6).map((c) => ({ label: CATEGORY_META[c.category].label, value: c.total, color: CATEGORY_META[c.category].color }))} />
          {!a.categoriesMonth.length && <p className="text-sm text-muted">Nessuna spesa questo mese.</p>}
        </Card>
      ),
    },
    investments: {
      span: 'lg:col-span-4',
      node: (
        <Card className="h-full">
          <CardHeader title="Rendimento investimenti" subtitle="Trade Republic" action={<Link to="/investimenti" className="text-xs text-muted hover:text-ink">Portafoglio →</Link>} />
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Valore" value={<Money value={a.portfolio.value} />} />
            <Stat label="Plus/minus non realizzata" value={<Money value={a.portfolio.unrealized} sign />} delta={<Delta pct={a.portfolio.unrealizedPct} />} />
            <Stat label="Dividendi" value={<Money value={a.portfolio.dividends} />} />
            <Stat label="Interessi liquidità" value={<Money value={a.portfolio.interest} />} />
          </div>
          <p className="mt-4 text-xs text-muted">Rendimento totale (incl. realizzato, dividendi, al netto di costi e imposte): <span className="font-medium text-ink-2">{fmtPct(a.portfolio.totalReturnPct, 1, true)}</span></p>
        </Card>
      ),
    },
    transactions: {
      span: 'lg:col-span-4',
      node: (
        <Card className="h-full">
          <CardHeader title="Ultime transazioni" action={<Link to="/spese" className="text-xs text-muted hover:text-ink">Tutte →</Link>} />
          <TransactionList txs={data.transactions} limit={6} />
        </Card>
      ),
    },
  };

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`Dati aggiornati al ${fmtDate(a.asOf, 'long')} · ${data.accounts.length} conti · ${data.transactions.length} movimenti`}
        action={
          <Button size="sm" variant={editing ? 'primary' : 'secondary'} onClick={() => setEditing(!editing)}>
            <LayoutGrid size={14} /> {editing ? 'Fine' : 'Personalizza'}
          </Button>
        }
      />
      {editing && (
        <Card className="mb-5">
          <CardHeader title="Personalizza la dashboard" subtitle="Mostra, nascondi e riordina i widget" />
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {widgets.map((w, i) => (
              <li key={w.id} className="flex items-center justify-between gap-2 rounded-xl border border-line bg-page px-3 py-2 text-sm">
                <span className={clsx('truncate', !w.visible && 'text-muted line-through')}>{DASHBOARD_WIDGETS.find((x) => x.id === w.id)?.label}</span>
                <span className="flex shrink-0 gap-1">
                  <button className="rounded p-1 text-muted hover:bg-white/5 hover:text-ink disabled:opacity-30" disabled={i === 0} onClick={() => move(w.id, -1)} aria-label="Sposta su"><ArrowUp size={14} /></button>
                  <button className="rounded p-1 text-muted hover:bg-white/5 hover:text-ink disabled:opacity-30" disabled={i === widgets.length - 1} onClick={() => move(w.id, 1)} aria-label="Sposta giù"><ArrowDown size={14} /></button>
                  <button className="rounded p-1 text-muted hover:bg-white/5 hover:text-ink" onClick={() => toggle(w.id)} aria-label={w.visible ? 'Nascondi' : 'Mostra'}>{w.visible ? <Eye size={14} /> : <EyeOff size={14} />}</button>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {widgets
          .filter((w) => w.visible && blocks[w.id])
          .map((w) => (
            <div key={w.id} className={blocks[w.id].span}>
              {blocks[w.id].node}
            </div>
          ))}
      </div>
    </>
  );
}
