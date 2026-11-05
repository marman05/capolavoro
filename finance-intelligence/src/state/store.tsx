import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { analyze, type Analysis } from '../analytics';
import { computeNetWorth } from '../analytics/networth';
import { makeConverter } from '../domain/fx';
import { emptyData, DASHBOARD_WIDGETS } from '../domain/defaults';
import { withReferenceMeta } from '../domain/reference';
import type { FinanceData } from '../domain/types';
import { mergeImport } from '../connectors/registry';
import type { ImportResult } from '../connectors/types';
import { Vault } from '../storage/vault';
import { toISODate } from '../lib/dates';

type Status = 'loading' | 'setup' | 'locked' | 'ready';

interface Store {
  status: Status;
  data: FinanceData;
  analysis: Analysis;
  create(passphrase: string): Promise<void>;
  unlock(passphrase: string): Promise<void>;
  lock(): void;
  update(fn: (d: FinanceData) => FinanceData): void;
  applyImport(res: ImportResult, record?: { fileName: string; format: 'csv' | 'excel' | 'pdf' }): void;
  loadDemo(): Promise<void>;
  clearDemo(): void;
  wipe(): Promise<void>;
}

const Ctx = createContext<Store | null>(null);

/** Salva un'istantanea (fatto) del patrimonio alla data odierna dopo ogni import/sync. */
function withSnapshot(d: FinanceData): FinanceData {
  if (d.isDemo) return d;
  const nw = computeNetWorth(d, makeConverter(d.settings));
  const date = toISODate(new Date());
  const origin = d.accounts.some((a) => a.origin === 'open-banking') ? 'open-banking' : 'csv';
  return { ...d, snapshots: [...d.snapshots.filter((s) => s.date !== date), { date, cash: nw.cash, investments: nw.investments, total: nw.total, origin }] };
}

function migrate(d: FinanceData): FinanceData {
  const base = emptyData();
  const widgets = d.settings?.dashboardWidgets ?? [];
  const missing = DASHBOARD_WIDGETS.filter((w) => !widgets.some((x) => x.id === w.id)).map((w) => ({ id: w.id, visible: true }));
  return { ...base, ...d, settings: { ...base.settings, ...d.settings, dashboardWidgets: [...widgets, ...missing] }, metal: { ...base.metal, ...d.metal, benefits: { ...base.metal.benefits, ...d.metal?.benefits } } };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [data, setData] = useState<FinanceData>(emptyData);
  const vault = useRef<Vault | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    Vault.exists()
      .then((e) => setStatus(e ? 'locked' : 'setup'))
      .catch(() => setStatus('setup'));
  }, []);

  const persist = useCallback((d: FinanceData) => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      vault.current?.save(d).catch((e) => console.error('Salvataggio cifrato non riuscito', e));
    }, 300);
  }, []);

  const update = useCallback(
    (fn: (d: FinanceData) => FinanceData) => {
      setData((prev) => {
        const next = fn(prev);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const lock = useCallback(() => {
    vault.current = null;
    setData(emptyData());
    setStatus('locked');
  }, []);

  // blocco automatico per inattività
  useEffect(() => {
    if (status !== 'ready') return;
    let timer: number;
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(lock, Math.max(1, data.settings.autoLockMinutes) * 60_000);
    };
    const events = ['pointerdown', 'keydown', 'scroll'];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      window.clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [status, data.settings.autoLockMinutes, lock]);

  const store = useMemo<Store>(() => {
    const analysis = analyze(data);
    return {
      status,
      data,
      analysis,
      async create(passphrase) {
        vault.current = await Vault.create(passphrase);
        const d = emptyData();
        await vault.current.save(d);
        setData(d);
        setStatus('ready');
      },
      async unlock(passphrase) {
        const res = await Vault.unlock<FinanceData>(passphrase);
        vault.current = res.vault;
        setData(migrate(res.data));
        setStatus('ready');
      },
      lock,
      update,
      applyImport(res, record) {
        update((d) => {
          let next = mergeImport(d.isDemo ? { ...emptyData(), settings: d.settings, goals: [] } : d, res);
          next = { ...next, instrumentMeta: withReferenceMeta(next.instrumentMeta, next.holdings.map((h) => h.isin)) };
          if (record) next.imports = [...next.imports, { id: crypto.randomUUID(), provider: res.provider, fileName: record.fileName, format: record.format, importedAt: new Date().toISOString(), transactions: res.transactions.length, holdings: res.holdings.length }];
          return withSnapshot(next);
        });
      },
      async loadDemo() {
        const { buildDemoData } = await import('../demo/sampleData');
        update((d) => ({ ...buildDemoData(), settings: { ...d.settings } }));
      },
      clearDemo() {
        update((d) => ({ ...emptyData(), settings: d.settings }));
      },
      async wipe() {
        await Vault.destroy();
        vault.current = null;
        setData(emptyData());
        setStatus('setup');
      },
    };
  }, [data, status, lock, update]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider mancante');
  return s;
}
