import clsx from 'clsx';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, ChevronDown, Landmark, LineChart as LineIcon, Percent, Receipt } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { aggregateHistory, netWorthHistory, type Granularity } from '../analytics/networth';
import type { Opportunity } from '../analytics/insights';
import { CATEGORY_META } from '../domain/categories';
import type { Transaction } from '../domain/types';
import { addDays } from '../lib/dates';
import { fmtDate, fmtMoney, fmtMonth } from '../lib/format';
import { SERIES } from '../lib/palette';
import { useStore } from '../state/store';
import { AreaSeriesChart } from './charts';
import { Badge, Money, NatureTag, Segmented } from './ui';

const RANGES = [
  { value: '1M', label: '1M', days: 30, g: 'day' as Granularity },
  { value: '3M', label: '3M', days: 91, g: 'day' as Granularity },
  { value: '6M', label: '6M', days: 182, g: 'week' as Granularity },
  { value: '1Y', label: '1A', days: 365, g: 'week' as Granularity },
  { value: 'ALL', label: 'Tutto', days: 3650, g: 'month' as Granularity },
];

export function NetWorthChart({ height = 260, showControls = true, defaultRange = '1Y', custom }: { height?: number; showControls?: boolean; defaultRange?: string; custom?: { from: string; to: string; g: Granularity } }) {
  const { data, analysis } = useStore();
  const [range, setRange] = useState(defaultRange);
  const [mode, setMode] = useState<'total' | 'split'>('total');
  const r = RANGES.find((x) => x.value === range)!;
  const first = data.transactions.reduce((m, t) => (t.date < m ? t.date : m), analysis.asOf);
  const from = custom?.from ?? (r.value === 'ALL' ? first : addDays(analysis.asOf, -r.days));
  const g = custom?.g ?? r.g;
  const points = useMemo(() => aggregateHistory(netWorthHistory(data, analysis.conv, custom?.to ?? analysis.asOf, from < first ? first : from), g), [data, analysis, from, first, g, custom?.to]);
  const reconstructed = points.some((p) => p.reconstructed);
  const xf = (v: string) => (g === 'month' ? fmtMonth(v) : g === 'year' ? v : fmtDate(v));
  return (
    <div>
      {showControls && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <Segmented value={mode} onChange={setMode} options={[{ value: 'total', label: 'Totale' }, { value: 'split', label: 'Liquidità / Investimenti' }]} />
          {!custom && <Segmented value={range} onChange={setRange} options={RANGES.map((x) => ({ value: x.value, label: x.label }))} />}
        </div>
      )}
      <AreaSeriesChart
        data={points as unknown as Record<string, unknown>[]}
        xKey="date"
        xFormatter={xf}
        height={height}
        stacked={mode === 'split'}
        series={mode === 'total' ? [{ key: 'total', name: 'Patrimonio', color: SERIES[6] }] : [{ key: 'cash', name: 'Liquidità', color: SERIES[0] }, { key: 'investments', name: 'Investimenti', color: SERIES[2] }]}
      />
      {reconstructed && (
        <p className="mt-2 flex items-center gap-2 text-[11px] text-muted">
          <NatureTag nature="ricostruito" /> I valori passati senza istantanea salvata sono ricostruiti dai movimenti; gli investimenti sono valorizzati al costo.
        </p>
      )}
    </div>
  );
}

const KIND_ICON = {
  expense: ArrowUpRight,
  income: ArrowDownLeft,
  transfer: ArrowLeftRight,
  'investment-buy': LineIcon,
  'investment-sell': LineIcon,
  dividend: Percent,
  interest: Percent,
  fee: Receipt,
  fx: ArrowLeftRight,
  refund: ArrowDownLeft,
  cashback: Percent,
  tax: Landmark,
};

export const KIND_LABEL: Record<Transaction['kind'], string> = {
  expense: 'Spesa',
  income: 'Entrata',
  transfer: 'Trasferimento',
  'investment-buy': 'Acquisto titoli',
  'investment-sell': 'Vendita titoli',
  dividend: 'Dividendo',
  interest: 'Interessi',
  fee: 'Commissione',
  fx: 'Cambio valuta',
  refund: 'Rimborso',
  cashback: 'Cashback',
  tax: 'Imposte',
};

export function TransactionRow({ t, onEdit }: { t: Transaction; onEdit?: (t: Transaction) => void }) {
  const Icon = KIND_ICON[t.kind];
  const cat = t.category ? CATEGORY_META[t.category] : undefined;
  return (
    <li>
      <button type="button" onClick={() => onEdit?.(t)} disabled={!onEdit} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-white/[0.03] disabled:hover:bg-transparent">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.05]" style={cat ? { color: cat.color } : undefined}>
          <Icon size={16} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-ink">{t.merchant || t.description}</div>
          <div className="flex items-center gap-1.5 truncate text-xs text-muted">
            {fmtDate(t.date)} · {cat && (t.kind === 'expense' || t.kind === 'refund') ? cat.label : KIND_LABEL[t.kind]} · {t.provider === 'revolut' ? 'Revolut' : t.provider === 'traderepublic' ? 'Trade Republic' : t.provider}
          </div>
        </div>
        <div className={clsx('text-right text-sm font-medium tnum', t.amount > 0 ? 'text-[#5fd35f]' : 'text-ink')}>
          {fmtMoney(t.amount, t.currency, { sign: true })}
          {t.fee ? <div className="text-[11px] font-normal text-muted">comm. {fmtMoney(t.fee, t.currency)}</div> : null}
        </div>
      </button>
    </li>
  );
}

export function TransactionList({ txs, limit = 8, onEdit }: { txs: Transaction[]; limit?: number; onEdit?: (t: Transaction) => void }) {
  if (!txs.length) return <p className="py-6 text-center text-sm text-muted">Nessun movimento.</p>;
  return (
    <ul className="-mx-2 divide-y divide-line/60">
      {txs.slice(0, limit).map((t) => (
        <TransactionRow key={t.id} t={t} onEdit={onEdit} />
      ))}
    </ul>
  );
}

export function OpportunityCard({ o, compact, onDismiss }: { o: Opportunity; compact?: boolean; onDismiss?: () => void }) {
  const [open, setOpen] = useState(!compact);
  const { data } = useStore();
  return (
    <article className="rounded-2xl border border-line bg-elevated/60 p-4 transition-colors hover:border-line-strong">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <Badge tone="accent">{o.area}</Badge>
            <NatureTag nature={o.amountNature} />
          </div>
          <h3 className="text-sm font-semibold leading-snug text-ink">{o.title}</h3>
        </div>
        <div className="shrink-0 text-right">
          {o.amount > 0 ? (
            <>
              <div className="text-base font-semibold text-ink tnum">{fmtMoney(o.amount, data.settings.baseCurrency, { decimals: 0 })}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted">all'anno</div>
            </>
          ) : (
            <div className="text-xs text-muted">non quantificabile</div>
          )}
        </div>
      </div>
      {compact && (
        <button onClick={() => setOpen(!open)} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-ink-2 hover:text-ink" aria-expanded={open}>
          {open ? 'Nascondi dettagli' : 'Dettagli'} <ChevronDown size={14} className={clsx('transition-transform', open && 'rotate-180')} />
        </button>
      )}
      {open && (
        <dl className="mt-3 space-y-2.5 text-[13px] leading-relaxed">
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">1 · Cosa abbiamo individuato</dt>
            <dd className="text-ink-2">{o.found}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">2 · Perché è importante</dt>
            <dd className="text-ink-2">{o.why}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">3 · Denaro coinvolto</dt>
            <dd className="text-ink-2">
              {o.amount > 0 ? <Money value={o.amount} className="font-medium text-ink" /> : '—'} {o.amount > 0 && "all'anno"} · {o.amountNote}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">4 · Come intervenire</dt>
            <dd>
              <ul className="list-disc space-y-0.5 pl-4 text-ink-2 marker:text-muted">
                {o.how.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">5 · Rischi e limiti</dt>
            <dd className="text-ink-2">{o.risks}</dd>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Link to={o.link} className="rounded-lg bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-ink hover:bg-white/10">
              Approfondisci
            </Link>
            {onDismiss && (
              <button onClick={onDismiss} className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted hover:bg-white/5 hover:text-ink-2">
                Non mi interessa
              </button>
            )}
          </div>
        </dl>
      )}
    </article>
  );
}
