import { useEffect, useRef } from 'react';
import type { Consent } from '../domain/types';
import { useStore } from '../state/store';
import { syncConsent } from './openbanking';

/** Sincronizza un consenso Open Banking e aggiorna lo stato del consenso. */
export function useSyncConsent() {
  const { data, update, applyImport } = useStore();
  return async (c: Consent) => {
    try {
      const res = await syncConsent(c, c.accounts ?? c.accountIds.map((uid) => ({ uid })), data.settings.apiToken);
      applyImport(res);
      update((d) => ({ ...d, consents: d.consents.map((x) => (x.id === c.id ? { ...x, lastSync: new Date().toISOString(), lastError: res.warnings[0] } : x)) }));
      return res;
    } catch (e) {
      const msg = (e as Error).message;
      update((d) => ({ ...d, consents: d.consents.map((x) => (x.id === c.id ? { ...x, lastError: msg, status: /scadut|expired|unknown|sconosciut/i.test(msg) ? 'expired' : x.status } : x)) }));
      throw e;
    }
  };
}

/**
 * Sincronizzazione automatica: all'apertura dell'app, per i consensi attivi non
 * sincronizzati da più di 6 ore. Le banche limitano gli accessi non presenziati
 * (PSD2: tipicamente 4 al giorno), quindi non si va oltre.
 */
export function AutoSync() {
  const { data } = useStore();
  const sync = useSyncConsent();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const due = data.consents.filter((c) => c.status === 'active' && new Date(c.validUntil) > new Date() && (!c.lastSync || Date.now() - new Date(c.lastSync).getTime() > 6 * 3600_000));
    (async () => {
      for (const c of due) await sync(c).catch(() => undefined);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
