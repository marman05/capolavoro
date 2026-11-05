import clsx from 'clsx';
import { Bell, Bot, Cable, CreditCard, Gauge, Goal, LineChart, Lock, Menu, PieChart, Settings, Sparkles, Wallet, X } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { buildNotifications } from '../analytics/notifications';
import { useStore } from '../state/store';
import { Badge } from './ui';

export const NAV = [
  { to: '/', label: 'Dashboard', icon: Gauge },
  { to: '/patrimonio', label: 'Patrimonio', icon: Wallet },
  { to: '/spese', label: 'Spese', icon: PieChart },
  { to: '/revolut-metal', label: 'Revolut Metal', icon: CreditCard },
  { to: '/investimenti', label: 'Investimenti', icon: LineChart },
  { to: '/assistente', label: 'Assistente AI', icon: Bot },
  { to: '/opportunita', label: 'Opportunità per te', icon: Sparkles },
  { to: '/obiettivi', label: 'Previsioni e obiettivi', icon: Goal },
  { to: '/notifiche', label: 'Notifiche', icon: Bell },
  { to: '/connessioni', label: 'Connessioni', icon: Cable },
  { to: '/impostazioni', label: 'Privacy e impostazioni', icon: Settings },
];

function NavItems({ onNavigate, unread }: { onNavigate?: () => void; unread: number }) {
  return (
    <nav className="space-y-0.5">
      {NAV.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          onClick={onNavigate}
          className={({ isActive }) => clsx('group flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] font-medium transition-colors', isActive ? 'bg-white/[0.07] text-ink' : 'text-ink-2 hover:bg-white/[0.04] hover:text-ink')}
        >
          <Icon size={17} strokeWidth={1.8} className="shrink-0" aria-hidden />
          <span className="flex-1 truncate">{label}</span>
          {to === '/notifiche' && unread > 0 && <span className="rounded-full bg-accent px-1.5 text-[10px] font-semibold text-page tnum">{unread}</span>}
        </NavLink>
      ))}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <div className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-[#9085e9] to-[#3987e5] text-sm font-bold text-white shadow-lg shadow-accent/20">F</div>
      <div className="leading-tight">
        <div className="text-sm font-semibold tracking-tight text-ink">Finance Intelligence</div>
        <div className="text-[11px] text-muted">Revolut · Trade Republic</div>
      </div>
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { data, analysis, lock } = useStore();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const unread = useMemo(() => buildNotifications(data, analysis).filter((n) => !n.read).length, [data, analysis]);
  const current = NAV.find((n) => (n.to === '/' ? location.pathname === '/' : location.pathname.startsWith(n.to)));

  return (
    <div className="min-h-screen lg:pl-64">
      {/* sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-page/80 px-3 py-5 backdrop-blur-xl lg:flex">
        <Brand />
        <div className="mt-7 flex-1 overflow-y-auto">
          <NavItems unread={unread} />
        </div>
        <div className="space-y-2 border-t border-line pt-4">
          <div className="px-3 text-[11px] leading-relaxed text-muted">Accesso in sola lettura. Nessuna operazione, bonifico o ordine viene mai eseguito.</div>
          <button onClick={lock} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] font-medium text-ink-2 hover:bg-white/[0.04] hover:text-ink">
            <Lock size={16} aria-hidden /> Blocca
          </button>
        </div>
      </aside>

      {/* topbar mobile/tablet */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-page/85 px-4 py-3 backdrop-blur-xl lg:hidden">
        <button onClick={() => setOpen(true)} className="rounded-lg p-1.5 text-ink-2 hover:bg-white/5" aria-label="Apri menu">
          <Menu size={20} />
        </button>
        <div className="text-sm font-semibold">{current?.label ?? 'Finance Intelligence'}</div>
        <NavLink to="/notifiche" className="relative rounded-lg p-1.5 text-ink-2 hover:bg-white/5" aria-label="Notifiche">
          <Bell size={19} />
          {unread > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-accent" />}
        </NavLink>
      </header>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col bg-surface px-3 py-5 shadow-2xl animate-fade-in">
            <div className="mb-6 flex items-center justify-between">
              <Brand />
              <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-ink-2 hover:bg-white/5" aria-label="Chiudi menu">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <NavItems unread={unread} onNavigate={() => setOpen(false)} />
            </div>
            <button onClick={lock} className="mt-3 flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-ink-2 hover:bg-white/5">
              <Lock size={16} /> Blocca
            </button>
          </div>
        </div>
      )}

      <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
        {data.isDemo && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/25 bg-accent/[0.07] px-4 py-3 text-sm">
            <div className="flex items-center gap-2 text-ink-2">
              <Badge tone="accent">Dati di esempio</Badge>
              Stai esplorando dati dimostrativi: non sono collegati a nessun conto reale.
            </div>
            <NavLink to="/connessioni" className="text-sm font-medium text-[#c9c2ff] hover:underline">
              Collega i tuoi conti →
            </NavLink>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
