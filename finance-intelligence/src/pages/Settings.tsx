import { Download, KeyRound, Lock, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Card, CardHeader, Field, inputCls, Note, PageHeader } from '../components/ui';
import { fetchEcbRates, revokeSession } from '../connectors/openbanking';
import { missingRates, SUPPORTED_CURRENCIES } from '../domain/fx';
import type { Settings } from '../domain/types';
import { fmtDate } from '../lib/format';
import { useStore } from '../state/store';

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function SettingsPage() {
  const { data, update, wipe, clearDemo, lock } = useStore();
  const s = data.settings;
  const set = (patch: Partial<Settings>) => update((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
  const [fxMsg, setFxMsg] = useState('');
  const currencies = [...new Set([...data.transactions.map((t) => t.currency), ...data.accounts.map((a) => a.currency), ...data.holdings.map((h) => h.currency)])];
  const missing = missingRates(currencies, s);

  async function refreshFx() {
    setFxMsg('');
    try {
      const r = await fetchEcbRates(s.apiToken);
      set({ fxRates: r.rates, fxRatesDate: r.date, fxSource: 'ecb' });
      setFxMsg(`Tassi BCE aggiornati al ${fmtDate(r.date, 'long')}`);
    } catch (e) {
      setFxMsg((e as Error).message);
    }
  }

  async function deleteEverything() {
    if (!window.confirm('Eliminare definitivamente TUTTI i dati (movimenti, conti, obiettivi, impostazioni) e revocare i consensi Open Banking attivi? Operazione irreversibile.')) return;
    for (const c of data.consents.filter((x) => x.status === 'active')) await revokeSession(c.sessionId, s.apiToken).catch(() => undefined);
    await wipe();
  }

  const exportCsv = () => {
    const head = ['data', 'fonte', 'conto', 'descrizione', 'tipo', 'categoria', 'importo', 'valuta', 'commissione', 'isin', 'quantita', 'origine'];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = data.transactions.map((t) => [t.date, t.provider, t.accountId, t.description, t.kind, t.category ?? '', t.amount, t.currency, t.fee ?? '', t.isin ?? '', t.quantity ?? '', t.origin].map(esc).join(';'));
    download(`movimenti-${new Date().toISOString().slice(0, 10)}.csv`, [head.join(';'), ...rows].join('\n'), 'text/csv');
  };

  return (
    <>
      <PageHeader title="Privacy e impostazioni" subtitle="Controllo completo su dati, consensi e sicurezza." />
      <div className="grid gap-5 lg:grid-cols-12">
        <Card className="lg:col-span-12">
          <CardHeader icon={<ShieldCheck size={16} className="text-good" />} title="Come sono protetti i tuoi dati" />
          <ul className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {[
              ['Cifratura locale', 'AES‑256‑GCM con chiave derivata dalla tua passphrase (PBKDF2‑SHA256, 600.000 iterazioni). La chiave non viene mai salvata.'],
              ['Nessuna credenziale bancaria', "L'autenticazione avviene solo sul sito/app della banca (SCA PSD2). L'app non vede né memorizza password, PIN o OTP."],
              ['Sola lettura', 'Si usano solo servizi di informazione sui conti (AIS). Nessuna API di pagamento: impossibile eseguire bonifici o ordini.'],
              ['Chiavi API protette', 'Le chiavi di Enable Banking e Claude restano nel server (variabili d\'ambiente), mai nel browser. Sessioni Open Banking cifrate a riposo.'],
              ['File elaborati in locale', 'CSV, Excel e PDF vengono letti nel browser e non vengono caricati su alcun server.'],
              ['Blocco automatico', `La cassaforte si blocca dopo ${s.autoLockMinutes} minuti di inattività e i dati decifrati vengono rimossi dalla memoria.`],
            ].map(([t, b]) => (
              <li key={t} className="rounded-xl border border-line bg-page p-3">
                <div className="font-medium text-ink">{t}</div>
                <div className="mt-0.5 text-xs leading-relaxed text-ink-2">{b}</div>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="lg:col-span-6">
          <CardHeader title="Consensi" subtitle="Puoi revocarli in qualsiasi momento" />
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4 rounded-xl border border-line bg-page p-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-ink">Assistente AI (Claude) {s.aiEnabled ? <Badge tone="good">Attivo</Badge> : <Badge>Disattivo</Badge>}</div>
                <p className="mt-1 text-xs leading-relaxed text-ink-2">Se attivo, a ogni domanda viene inviato al server e alla Claude API un riepilogo aggregato: totali mensili, categorie, spese ricorrenti (nome esercente e importo), posizioni del portafoglio, analisi Metal. <strong className="text-ink">Non vengono inviati</strong> IBAN, identificativi dei conti, credenziali o l'elenco completo dei movimenti.</p>
                {s.aiConsentAt && <p className="mt-1 text-[11px] text-muted">Consenso dato il {new Date(s.aiConsentAt).toLocaleString('it-IT')}</p>}
              </div>
              <label className="relative inline-flex shrink-0 cursor-pointer items-center">
                <input type="checkbox" className="peer sr-only" checked={s.aiEnabled} onChange={(e) => set(e.target.checked ? { aiEnabled: true, aiConsentAt: new Date().toISOString() } : { aiEnabled: false, aiConsentAt: undefined })} aria-label="Consenso assistente AI" />
                <span className="h-6 w-11 rounded-full bg-white/10 transition-colors peer-checked:bg-accent" />
                <span className="absolute left-0.5 h-5 w-5 rounded-full bg-white transition-transform peer-checked:translate-x-5" />
              </label>
            </div>
            <div className="rounded-xl border border-line bg-page p-3 text-xs text-ink-2">
              <div className="mb-1 text-sm font-medium text-ink">Open Banking</div>
              {data.consents.filter((c) => c.status === 'active').length} consensi attivi. Gestiscili (sincronizza, scollega) dalla pagina Connessioni.
            </div>
          </div>
        </Card>

        <Card className="lg:col-span-6">
          <CardHeader title="Valuta" subtitle="Valuta principale e tassi di cambio" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Valuta principale">
              <select className={inputCls} value={s.baseCurrency} onChange={(e) => set({ baseCurrency: e.target.value })}>
                {SUPPORTED_CURRENCIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Fonte tassi" hint={s.fxRatesDate ? `Aggiornati al ${fmtDate(s.fxRatesDate, 'long')}` : 'Tassi manuali'}>
              <Button className="w-full" onClick={() => void refreshFx()}><RefreshCw size={14} /> Aggiorna da BCE</Button>
            </Field>
          </div>
          {fxMsg && <p className="mt-2 text-xs text-ink-2">{fxMsg}</p>}
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[...new Set([...currencies, s.baseCurrency])].filter((c) => c !== 'EUR').map((c) => (
              <Field key={c} label={`1 EUR = ? ${c}`}>
                <input type="number" step="0.0001" className={`${inputCls} h-9`} value={s.fxRates[c] ?? ''} onChange={(e) => set({ fxRates: { ...s.fxRates, [c]: Number(e.target.value) }, fxSource: 'manual' })} />
              </Field>
            ))}
          </div>
          {missing.length > 0 && <div className="mt-3"><Note tone="warning">Manca il tasso per: {missing.join(', ')}. Gli importi in queste valute non vengono convertiti.</Note></div>}
        </Card>

        <Card className="lg:col-span-6">
          <CardHeader title="Analisi" subtitle="Parametri usati dagli algoritmi" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Sensibilità spese insolite" hint="z-score robusto: più basso = più segnalazioni">
              <input type="number" step="0.5" min="2" max="8" className={inputCls} value={s.anomalyThreshold} onChange={(e) => set({ anomalyThreshold: Number(e.target.value) || 3.5 })} />
            </Field>
            <Field label="Riserva di liquidità (mesi di spese)" hint="oltre questa soglia la liquidità è considerata ferma">
              <input type="number" min="1" max="24" className={inputCls} value={s.idleCashBuffer} onChange={(e) => set({ idleCashBuffer: Number(e.target.value) || 3 })} />
            </Field>
            <Field label="Tasso liquidità di riferimento (%)" hint="verificato su Trade Republic o salvadanaio Revolut">
              <input type="number" step="0.05" min="0" className={inputCls} value={s.tradeRepublicCashRate !== undefined ? +(s.tradeRepublicCashRate * 100).toFixed(2) : ''} onChange={(e) => set({ tradeRepublicCashRate: e.target.value === '' ? undefined : Number(e.target.value) / 100 })} />
            </Field>
          </div>
        </Card>

        <Card className="lg:col-span-6">
          <CardHeader icon={<Lock size={16} className="text-muted" />} title="Sicurezza" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Blocco automatico (minuti)">
              <input type="number" min="1" max="120" className={inputCls} value={s.autoLockMinutes} onChange={(e) => set({ autoLockMinutes: Number(e.target.value) || 10 })} />
            </Field>
            <Field label="Token API locale" hint="solo se APP_ACCESS_TOKEN è impostato sul server">
              <input type="password" className={inputCls} value={s.apiToken ?? ''} onChange={(e) => set({ apiToken: e.target.value || undefined })} autoComplete="off" />
            </Field>
          </div>
          <Button className="mt-3" onClick={lock}><KeyRound size={14} /> Blocca ora</Button>
        </Card>

        <Card className="lg:col-span-12">
          <CardHeader title="I tuoi dati" subtitle="Esportazione e cancellazione" />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => download(`finance-intelligence-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json')}>
              <Download size={14} /> Esporta tutto (JSON)
            </Button>
            <Button onClick={exportCsv}><Download size={14} /> Esporta movimenti (CSV)</Button>
            {data.isDemo && <Button onClick={clearDemo}>Rimuovi dati di esempio</Button>}
            <Button variant="danger" onClick={() => void deleteEverything()}><Trash2 size={14} /> Elimina tutti i dati</Button>
          </div>
          <p className="mt-3 text-xs text-muted">L'esportazione JSON contiene i dati in chiaro: conservala in un luogo sicuro. La cancellazione rimuove la cassaforte da questo dispositivo e revoca i consensi Open Banking attivi.</p>
        </Card>
      </div>
    </>
  );
}
