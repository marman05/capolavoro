import clsx from 'clsx';
import { Info, TrendingDown, TrendingUp } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { fmtMoney, fmtPct } from '../lib/format';
import { useStore } from '../state/store';

export function Card({ children, className, glow }: { children: ReactNode; className?: string; glow?: boolean }) {
  return <section className={clsx('rounded-2xl border border-line p-5 animate-fade-in', glow ? 'card-glow' : 'bg-surface', className)}>{children}</section>;
}

export function CardHeader({ title, subtitle, action, icon }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-ink">
          {icon}
          {title}
        </h2>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-2">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Money({ value, currency, className, sign, compact }: { value: number; currency?: string; className?: string; sign?: boolean; compact?: boolean }) {
  const { data } = useStore();
  return <span className={clsx('tnum', className)}>{fmtMoney(value, currency ?? data.settings.baseCurrency, { sign, compact })}</span>;
}

export function Delta({ value, pct, inverse, className }: { value?: number; pct?: number; inverse?: boolean; className?: string }) {
  const v = pct ?? value ?? 0;
  const good = inverse ? v < 0 : v > 0;
  const Icon = v >= 0 ? TrendingUp : TrendingDown;
  if (!v) return <span className={clsx('text-xs text-muted', className)}>—</span>;
  return (
    <span className={clsx('inline-flex items-center gap-1 text-xs font-medium tnum', good ? 'text-good' : 'text-serious', className)}>
      <Icon size={13} aria-hidden />
      {pct !== undefined ? fmtPct(pct, 1, true) : <Money value={value!} sign />}
    </span>
  );
}

export function Stat({ label, value, hint, delta, tag }: { label: ReactNode; value: ReactNode; hint?: ReactNode; delta?: ReactNode; tag?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 text-xs font-medium text-muted">
        {label}
        {tag}
      </div>
      <div className="mt-1 truncate text-xl font-semibold tracking-tight text-ink tnum sm:text-2xl">{value}</div>
      {(hint || delta) && (
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
          {delta}
          {hint}
        </div>
      )}
    </div>
  );
}

type Tone = 'neutral' | 'accent' | 'good' | 'warning' | 'serious' | 'critical' | 'info';
const TONES: Record<Tone, string> = {
  neutral: 'bg-white/5 text-ink-2 border-line',
  accent: 'bg-accent/15 text-[#c9c2ff] border-accent/30',
  good: 'bg-good/12 text-[#5fd35f] border-good/30',
  warning: 'bg-warning/12 text-warning border-warning/30',
  serious: 'bg-serious/12 text-serious border-serious/30',
  critical: 'bg-critical/15 text-[#ff8a8a] border-critical/30',
  info: 'bg-s1/15 text-[#8fbaf2] border-s1/30',
};

export function Badge({ children, tone = 'neutral', className, title }: { children: ReactNode; tone?: Tone; className?: string; title?: string }) {
  return (
    <span title={title} className={clsx('inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium', TONES[tone], className)}>
      {children}
    </span>
  );
}

/** Etichetta che distingue sempre i fatti dalle stime. */
export function NatureTag({ nature }: { nature: 'fatto' | 'stima' | 'demo' | 'ricostruito' }) {
  const map = {
    fatto: { tone: 'good' as const, label: 'Fatto', title: 'Dato calcolato da movimenti o saldi reali' },
    stima: { tone: 'warning' as const, label: 'Stima', title: 'Valore stimato con ipotesi dichiarate' },
    demo: { tone: 'accent' as const, label: 'Dati di esempio', title: 'Dati dimostrativi, non reali' },
    ricostruito: { tone: 'info' as const, label: 'Ricostruito', title: 'Ricostruito a ritroso dai movimenti' },
  }[nature];
  return (
    <Badge tone={map.tone} title={map.title}>
      {map.label}
    </Badge>
  );
}

export function Button({ variant = 'secondary', size = 'md', className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md' }) {
  return (
    <button
      {...props}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        size === 'sm' ? 'h-8 px-3 text-xs' : 'h-10 px-4 text-sm',
        variant === 'primary' && 'bg-ink text-page hover:bg-white',
        variant === 'secondary' && 'border border-line-strong bg-elevated text-ink hover:bg-hover',
        variant === 'ghost' && 'text-ink-2 hover:bg-white/5 hover:text-ink',
        variant === 'danger' && 'border border-critical/40 bg-critical/10 text-[#ff8a8a] hover:bg-critical/20',
        className,
      )}
    />
  );
}

export function Segmented<T extends string>({ options, value, onChange, size = 'sm' }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; size?: 'sm' | 'md' }) {
  return (
    <div role="tablist" className="inline-flex rounded-xl border border-line bg-page p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={clsx('rounded-[10px] font-medium transition-colors', size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm', o.value === value ? 'bg-elevated text-ink shadow-sm' : 'text-muted hover:text-ink-2')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong px-6 py-12 text-center">
      <div className="mb-3 rounded-2xl bg-white/5 p-3 text-ink-2">{icon}</div>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-ink-2">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Note({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'warning' }) {
  return (
    <div className={clsx('flex gap-2 rounded-xl border px-3 py-2.5 text-xs leading-relaxed', tone === 'warning' ? 'border-warning/25 bg-warning/5 text-ink-2' : 'border-line bg-white/[0.02] text-ink-2')}>
      <Info size={14} className={clsx('mt-0.5 shrink-0', tone === 'warning' ? 'text-warning' : 'text-muted')} aria-hidden />
      <div>{children}</div>
    </div>
  );
}

export function ProgressBar({ value, color = 'var(--color-accent)', className }: { value: number; color?: string; className?: string }) {
  return (
    <div className={clsx('h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]', className)} role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, background: color }} />
    </div>
  );
}

/** Indicatore circolare (es. Metal Utilization Score). */
export function ScoreRing({ score, size = 132, label }: { score: number | null; size?: number; label?: string }) {
  const r = (size - 14) / 2;
  const c = 2 * Math.PI * r;
  const v = score ?? 0;
  const color = score === null ? '#5f5e59' : v >= 70 ? '#0ca30c' : v >= 40 ? '#fab219' : '#ec835a';
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.06)" strokeWidth={8} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={8} fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} style={{ transition: 'stroke-dashoffset 1s ease' }} />
      </svg>
      <div className="absolute text-center">
        <div className="text-3xl font-semibold tracking-tight text-ink tnum">{score ?? '–'}</div>
        <div className="text-[10px] uppercase tracking-wider text-muted">{label ?? '/ 100'}</div>
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted">{hint}</span>}
    </label>
  );
}

export const inputBase = 'h-10 rounded-xl border border-line-strong bg-page px-3 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none';
export const inputCls = `${inputBase} w-full`;
