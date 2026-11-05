import clsx from 'clsx';
import { AlertTriangle, Bell, BellRing, CheckCheck, CircleCheck, Info } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { buildNotifications } from '../analytics/notifications';
import { Button, Card, EmptyState, PageHeader } from '../components/ui';
import { fmtDate } from '../lib/format';
import { useStore } from '../state/store';

const TYPE_LABEL: Record<string, string> = {
  anomaly: 'Spesa anomala',
  'new-subscription': 'Nuovo abbonamento',
  'unexpected-fee': 'Commissione',
  'portfolio-move': 'Portafoglio',
  dividend: 'Dividendo',
  renewal: 'Scadenze e rinnovi',
  'unused-benefit': 'Vantaggio non sfruttato',
  'goal-reached': 'Obiettivo',
  'consent-expiry': 'Consenso',
};

export default function NotificationsPage() {
  const { data, analysis, update } = useStore();
  const items = useMemo(() => buildNotifications(data, analysis), [data, analysis]);
  const unread = items.filter((n) => !n.read);
  const notified = useRef(false);

  // notifiche del browser (opt-in): solo il titolo, nessun importo nel centro notifiche di sistema
  useEffect(() => {
    if (notified.current || !data.settings.notificationsBrowser || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    notified.current = true;
    if (unread.length) new Notification('Finance Intelligence', { body: `Hai ${unread.length} nuove notifiche`, tag: 'fi-unread' });
  }, [unread.length, data.settings.notificationsBrowser]);

  const markAll = () => update((d) => ({ ...d, readNotifications: [...new Set([...d.readNotifications, ...items.map((n) => n.id)])] }));
  const markOne = (id: string) => update((d) => ({ ...d, readNotifications: [...new Set([...d.readNotifications, id])] }));

  return (
    <>
      <PageHeader
        title="Notifiche"
        subtitle="Spese anomale, nuovi abbonamenti, commissioni, portafoglio, dividendi, rinnovi, vantaggi e obiettivi."
        action={
          <div className="flex gap-2">
            {typeof Notification !== 'undefined' && !data.settings.notificationsBrowser && (
              <Button size="sm" onClick={async () => { if ((await Notification.requestPermission()) === 'granted') update((d) => ({ ...d, settings: { ...d.settings, notificationsBrowser: true } })); }}>
                <BellRing size={14} /> Attiva notifiche browser
              </Button>
            )}
            {unread.length > 0 && <Button size="sm" onClick={markAll}><CheckCheck size={14} /> Segna tutte come lette</Button>}
          </div>
        }
      />
      {items.length ? (
        <Card className="!p-2">
          <ul className="divide-y divide-line/60">
            {items.map((n) => {
              const Icon = n.severity === 'warning' ? AlertTriangle : n.severity === 'success' ? CircleCheck : Info;
              return (
                <li key={n.id} className={clsx('flex items-start gap-3 rounded-xl px-3 py-3.5', !n.read && 'bg-white/[0.025]')}>
                  <Icon size={18} className={clsx('mt-0.5 shrink-0', n.severity === 'warning' ? 'text-warning' : n.severity === 'success' ? 'text-good' : 'text-s1')} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-ink">{n.title}</span>
                      {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-label="non letta" />}
                    </div>
                    <p className="text-sm text-ink-2">{n.body}</p>
                    <div className="mt-1 text-[11px] text-muted">{TYPE_LABEL[n.type]} · {fmtDate(n.date, 'long')}</div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {n.link && <Link to={n.link} onClick={() => markOne(n.id)} className="text-xs text-ink-2 hover:text-ink">Apri →</Link>}
                    {!n.read && <button onClick={() => markOne(n.id)} className="text-[11px] text-muted hover:text-ink-2">Letta</button>}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : (
        <EmptyState icon={<Bell size={22} />} title="Nessuna notifica" body="Quando l'app rileverà eventi rilevanti nei tuoi dati li troverai qui." />
      )}
    </>
  );
}
