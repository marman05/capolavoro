import type { ReactNode } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fmtMoney } from '../lib/format';
import { INK } from '../lib/palette';

/**
 * Wrapper grafici con stile coerente: segni sottili, griglia recessiva, un solo asse Y,
 * tooltip su hover/crosshair, legenda presente con ≥ 2 serie.
 */

export const axisProps = {
  stroke: INK.axis,
  tick: { fill: INK.muted, fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

const compactMoney = (v: number) => fmtMoney(v, 'EUR', { compact: true });

export function ChartTooltip({ active, payload, label, labelFormatter, valueFormatter = (v: number) => fmtMoney(v) }: { active?: boolean; payload?: { name?: string; value?: number; color?: string; dataKey?: string; payload?: Record<string, unknown> }[]; label?: string | number; labelFormatter?: (l: string) => ReactNode; valueFormatter?: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-[160px] rounded-xl border border-line-strong bg-elevated/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
      <div className="mb-1.5 font-medium text-ink-2">{labelFormatter ? labelFormatter(String(label)) : label}</div>
      {payload.map((p) => (
        <div key={String(p.dataKey ?? p.name)} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-ink-2">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="font-medium text-ink tnum">{valueFormatter(Number(p.value ?? 0))}</span>
        </div>
      ))}
    </div>
  );
}

export interface SeriesDef {
  key: string;
  name: string;
  color: string;
  dashed?: boolean;
}

export function AreaSeriesChart({ data, xKey, series, height = 260, xFormatter, stacked, yDomain }: { data: Record<string, unknown>[]; xKey: string; series: SeriesDef[]; height?: number; xFormatter?: (v: string) => string; stacked?: boolean; yDomain?: [number | string, number | string] }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`g-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid stroke={INK.grid} vertical={false} />
        <XAxis dataKey={xKey} {...axisProps} tickFormatter={xFormatter} minTickGap={28} />
        <YAxis {...axisProps} tickFormatter={compactMoney} width={56} domain={yDomain ?? ['auto', 'auto']} />
        <Tooltip content={<ChartTooltip labelFormatter={xFormatter} />} cursor={{ stroke: INK.secondary, strokeDasharray: '3 3' }} />
        {series.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: INK.secondary, paddingTop: 8 }} />}
        {series.map((s) => (
          <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? '5 4' : undefined} fill={s.dashed ? 'none' : `url(#g-${s.key})`} stackId={stacked ? 'a' : undefined} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#121317' }} isAnimationActive={false} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function LineSeriesChart({ data, xKey, series, height = 260, xFormatter, yFormatter = compactMoney }: { data: Record<string, unknown>[]; xKey: string; series: SeriesDef[]; height?: number; xFormatter?: (v: string) => string; yFormatter?: (v: number) => string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={INK.grid} vertical={false} />
        <XAxis dataKey={xKey} {...axisProps} tickFormatter={xFormatter} minTickGap={28} />
        <YAxis {...axisProps} tickFormatter={yFormatter} width={56} domain={['auto', 'auto']} />
        <Tooltip content={<ChartTooltip labelFormatter={xFormatter} />} cursor={{ stroke: INK.secondary, strokeDasharray: '3 3' }} />
        {series.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: INK.secondary, paddingTop: 8 }} />}
        {series.map((s) => (
          <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? '5 4' : undefined} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#121317' }} connectNulls />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function BarSeriesChart({ data, xKey, series, height = 240, xFormatter, stacked, highlightLast, signColors }: { data: Record<string, unknown>[]; xKey: string; series: SeriesDef[]; height?: number; xFormatter?: (v: string) => string; stacked?: boolean; highlightLast?: boolean; signColors?: { positive: string; negative: string } }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="22%">
        <CartesianGrid stroke={INK.grid} vertical={false} />
        <XAxis dataKey={xKey} {...axisProps} tickFormatter={xFormatter} />
        <YAxis {...axisProps} tickFormatter={compactMoney} width={56} />
        <ReferenceLine y={0} stroke={INK.axis} />
        <Tooltip content={<ChartTooltip labelFormatter={xFormatter} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
        {series.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: INK.secondary, paddingTop: 8 }} />}
        {series.map((s, si) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} stackId={stacked ? 'a' : undefined} radius={stacked ? (si === series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]) : [4, 4, 0, 0]} stroke={stacked ? '#121317' : undefined} strokeWidth={stacked ? 2 : 0} maxBarSize={28} animationDuration={600}>
            {(highlightLast || signColors) &&
              data.map((d, i) => <Cell key={i} fill={signColors ? (Number(d[s.key]) < 0 ? signColors.negative : signColors.positive) : s.color} fillOpacity={highlightLast && i !== data.length - 1 ? 0.6 : 1} />)}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Barra orizzontale segmentata per la distribuzione (alternativa leggibile al grafico a torta). */
export function SegmentBar({ items }: { items: { label: string; value: number; color: string }[] }) {
  const total = items.reduce((s, i) => s + Math.max(0, i.value), 0);
  return (
    <div>
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full">
        {items.filter((i) => i.value > 0).map((i) => (
          <div key={i.label} className="h-full first:rounded-l-full last:rounded-r-full transition-[width] duration-700" style={{ width: `${(i.value / total) * 100}%`, background: i.color }} title={`${i.label}: ${fmtMoney(i.value)}`} />
        ))}
      </div>
      <ul className="mt-4 space-y-2.5">
        {items.map((i) => (
          <li key={i.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2 text-ink-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: i.color }} />
              <span className="truncate">{i.label}</span>
            </span>
            <span className="flex items-center gap-3 tnum">
              <span className="text-xs text-muted">{total ? Math.round((i.value / total) * 100) : 0}%</span>
              <span className="font-medium text-ink">{fmtMoney(i.value)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Lista a barre orizzontali, ordinata per valore (per le categorie di spesa). */
export function BarList({ items, max }: { items: { label: string; value: number; color?: string; extra?: ReactNode; onClick?: () => void }[]; max?: number }) {
  const top = max ?? Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="space-y-3">
      {items.map((i) => (
        <li key={i.label}>
          <button type="button" onClick={i.onClick} className="group w-full text-left" disabled={!i.onClick}>
            <div className="mb-1 flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2 truncate text-ink-2 group-hover:text-ink">
                {i.color && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: i.color }} />}
                {i.label}
              </span>
              <span className="flex items-center gap-2 tnum">
                {i.extra}
                <span className="font-medium text-ink">{fmtMoney(i.value)}</span>
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-white/[0.05]">
              <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${(i.value / top) * 100}%`, background: i.color ?? 'var(--color-s1)' }} />
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
