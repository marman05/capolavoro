import clsx from 'clsx';
import { AlertCircle, Check, CheckCircle2, FileSpreadsheet, FileText, Link2, Loader2, RefreshCw, ShieldCheck, Unplug, Upload, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Badge, Button, Card, CardHeader, Field, inputBase, inputCls, Note, PageHeader } from '../components/ui';
import { fileFormat, readCsv, readExcel, readPdfText } from '../connectors/files';
import { completeSession, listAspsps, providerFromAspsp, revokeSession, serverStatus, startAuth, type Aspsp, type ServerStatus } from '../connectors/openbanking';
import { CONNECTORS, detectConnector, matrixToInput, parseWithMapping, type ColumnMapping } from '../connectors/registry';
import { useSyncConsent } from '../connectors/sync';
import type { ImportResult, TabularInput } from '../connectors/types';
import type { Consent } from '../domain/types';
import { fmtDate, fmtMoney } from '../lib/format';
import { uid } from '../lib/id';
import { useStore } from '../state/store';

/** Stato reale delle integrazioni, verificato prima dell'implementazione (vedi docs/INTEGRATIONS.md). */
const INTEGRATIONS = [
  {
    provider: 'Revolut (piano Metal)',
    rows: [
      { label: 'API ufficiale per clienti privati', status: 'no', note: 'Revolut offre API solo per Business/merchant: non esiste un\'API pubblica per i conti personali.' },
      { label: 'Open Banking PSD2 (AIS, sola lettura)', status: 'yes', note: 'Tramite provider autorizzato (Enable Banking): conti, saldi e movimenti. Consenso fino a 180 giorni.' },
      { label: 'Estratto conto CSV / Excel / PDF', status: 'yes', note: 'Dall\'app: conto → Estratto conto. Importato e analizzato localmente.' },
      { label: 'Dettagli piano Metal e vantaggi', status: 'manual', note: 'Non esposti da nessuna API: verifica manuale guidata nella sezione Revolut Metal.' },
    ],
  },
  {
    provider: 'Trade Republic',
    rows: [
      { label: 'API ufficiale per clienti privati', status: 'no', note: 'Non disponibile. Le librerie non ufficiali richiedono numero di telefono e PIN: non usate per scelta di sicurezza.' },
      { label: 'Open Banking PSD2 (conto liquidità)', status: 'partial', note: 'Trade Republic espone un\'interfaccia PSD2 per TPP autorizzati (solo conto di liquidità, non il deposito titoli). Disponibile qui solo se compare nell\'elenco banche del provider.' },
      { label: 'Esportazione transazioni CSV', status: 'yes', note: 'Dall\'app: Profilo → Documenti → Esportazione transazioni. Movimenti di conto e titoli.' },
      { label: 'Estratti PDF (deposito titoli)', status: 'yes', note: 'Parsing euristico con anteprima obbligatoria prima del salvataggio.' },
    ],
  },
];

const STATUS_ICON = {
  yes: <CheckCircle2 size={16} className="text-good" aria-label="disponibile" />,
  no: <X size={16} className="text-muted" aria-label="non disponibile" />,
  partial: <AlertCircle size={16} className="text-warning" aria-label="parziale" />,
  manual: <AlertCircle size={16} className="text-s1" aria-label="manuale" />,
};

export default function ConnectionsPage() {
  const { data } = useStore();
  const [status, setStatus] = useState<ServerStatus | null | 'offline'>(null);
  useEffect(() => {
    serverStatus(data.settings.apiToken).then(setStatus).catch(() => setStatus('offline'));
  }, [data.settings.apiToken]);

  return (
    <>
      <PageHeader title="Connessioni" subtitle="Collegamenti in sola lettura e importazione di file. L'app non chiede mai password, PIN o codici della banca." />
      <Callback />
      <div className="grid gap-5 lg:grid-cols-12">
        <Card className="lg:col-span-12">
          <CardHeader icon={<ShieldCheck size={16} className="text-accent" />} title="Integrazioni realmente disponibili" subtitle="Verificate prima dell'implementazione: nessuna connessione viene simulata" />
          <div className="grid gap-5 md:grid-cols-2">
            {INTEGRATIONS.map((i) => (
              <div key={i.provider}>
                <h3 className="mb-2 text-sm font-semibold text-ink">{i.provider}</h3>
                <ul className="space-y-2">
                  {i.rows.map((r) => (
                    <li key={r.label} className="flex gap-2.5 rounded-xl border border-line bg-page px-3 py-2.5">
                      <span className="mt-0.5">{STATUS_ICON[r.status as keyof typeof STATUS_ICON]}</span>
                      <div>
                        <div className="text-sm font-medium text-ink">{r.label}</div>
                        <div className="text-xs text-ink-2">{r.note}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>
        <OpenBankingCard status={status} />
        <ConsentsCard />
        <ImportCard />
      </div>
    </>
  );
}

function Callback() {
  const location = useLocation();
  const navigate = useNavigate();
  const { data, update } = useStore();
  const sync = useSyncConsent();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const handled = useRef(false);
  useEffect(() => {
    if (!location.pathname.endsWith('/callback') || handled.current) return;
    handled.current = true;
    const qs = new URLSearchParams(location.search);
    const code = qs.get('code');
    const state = qs.get('state');
    const err = qs.get('error');
    navigate('/connessioni', { replace: true }); // rimuove code/state dall'URL
    if (err || !code || !state) {
      setMsg({ ok: false, text: `Collegamento non completato: ${qs.get('error_description') ?? err ?? 'autorizzazione annullata'}` });
      return;
    }
    (async () => {
      try {
        const s = await completeSession(code, state, data.settings.apiToken);
        const consent: Consent = { id: uid('c_'), provider: providerFromAspsp(s.aspsp.name), aggregator: 'enablebanking', aspspName: s.aspsp.name, sessionId: s.sessionId, scope: 'ais-read-only', grantedAt: new Date().toISOString(), validUntil: s.validUntil, accountIds: s.accounts.map((a) => a.uid), accounts: s.accounts, status: 'active' };
        update((d) => ({ ...d, consents: [...d.consents, consent] }));
        const res = await sync(consent);
        setMsg({ ok: true, text: `${s.aspsp.name} collegato: ${s.accounts.length} conti, ${res.transactions.length} movimenti sincronizzati.` });
      } catch (e) {
        setMsg({ ok: false, text: (e as Error).message });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);
  if (!msg) return null;
  return (
    <div className={clsx('mb-5 flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm', msg.ok ? 'border-good/30 bg-good/10 text-ink' : 'border-critical/30 bg-critical/10 text-ink')}>
      {msg.ok ? <CheckCircle2 size={16} className="text-good" /> : <AlertCircle size={16} className="text-critical" />}
      {msg.text}
    </div>
  );
}

function OpenBankingCard({ status }: { status: ServerStatus | null | 'offline' }) {
  const { data } = useStore();
  const [country, setCountry] = useState('IT');
  const [aspsps, setAspsps] = useState<Aspsp[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const configured = status && status !== 'offline' && status.enableBanking.configured;

  useEffect(() => {
    if (!configured) return;
    setLoading(true);
    setError('');
    listAspsps(country, data.settings.apiToken)
      .then((r) => setAspsps(r.aspsps))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [configured, country, data.settings.apiToken]);

  const filtered = useMemo(() => {
    const preferred = aspsps.filter((a) => /revolut|trade republic/i.test(a.name));
    const rest = aspsps.filter((a) => !/revolut|trade republic/i.test(a.name) && (!q || a.name.toLowerCase().includes(q.toLowerCase())));
    return [...preferred, ...(q ? rest : [])].slice(0, 30);
  }, [aspsps, q]);

  async function connect(a: Aspsp) {
    setError('');
    try {
      const { url } = await startAuth({ name: a.name, country: a.country }, data.settings.apiToken);
      window.location.assign(url); // l'utente si autentica sul sito/app della banca (SCA)
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Card className="lg:col-span-6">
      <CardHeader icon={<Link2 size={16} className="text-accent" />} title="Collega via Open Banking" subtitle="PSD2 · Account Information Service · sola lettura" />
      {status === null && <Loader2 className="animate-spin text-muted" />}
      {status === 'offline' && <Note tone="warning">Il server non è disponibile: questa versione funziona senza server (ad esempio la versione online) oppure il server locale non è avviato. Il collegamento Open Banking richiede il server con le chiavi di Enable Banking (vedi README, <code className="text-ink">npm run dev</code>). L'importazione dei file qui sotto funziona comunque, interamente nel browser.</Note>}
      {status && status !== 'offline' && !configured && (
        <Note tone="warning">
          Open Banking non è configurato. Per attivarlo registra gratuitamente un'applicazione su Enable Banking (provider PSD2 autorizzato), imposta <code className="text-ink">ENABLE_BANKING_APP_ID</code> e la chiave privata nel file <code className="text-ink">.env</code> del server e usa come redirect URL <code className="break-all text-ink">{status.enableBanking.redirectUrl}</code>. Istruzioni complete in <code className="text-ink">docs/INTEGRATIONS.md</code>.
        </Note>
      )}
      {configured && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <select className={inputCls} value={country} onChange={(e) => setCountry(e.target.value)} aria-label="Paese della banca">
              {['IT', 'LT', 'DE', 'FR', 'ES', 'NL', 'IE', 'PT', 'BE', 'AT'].map((c) => <option key={c}>{c}</option>)}
            </select>
            <input className={`${inputCls} col-span-2`} placeholder="Cerca altra banca…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {loading && <Loader2 className="animate-spin text-muted" />}
          <ul className="space-y-2">
            {filtered.map((a) => (
              <li key={`${a.name}-${a.country}`} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-page px-3 py-2">
                <div className="flex items-center gap-2.5">
                  {a.logo ? <img src={a.logo} alt="" className="h-7 w-7 rounded-lg bg-white object-contain p-0.5" /> : <div className="h-7 w-7 rounded-lg bg-white/10" />}
                  <div>
                    <div className="text-sm font-medium text-ink">{a.name}</div>
                    <div className="text-[11px] text-muted">{a.country}{a.maximum_consent_validity ? ` · consenso max ${Math.round(a.maximum_consent_validity / 86400)} giorni` : ''}</div>
                  </div>
                </div>
                <Button size="sm" variant="primary" onClick={() => void connect(a)}>Collega</Button>
              </li>
            ))}
            {!loading && !filtered.length && <li className="text-sm text-muted">Nessuna banca trovata per {country}. Revolut è registrata in Lituania: prova il paese LT.</li>}
          </ul>
          <Note>Verrai reindirizzato alla tua banca per autenticarti e autorizzare l'accesso in <strong>sola lettura</strong>. L'app riceve solo saldi e movimenti: nessuna credenziale, nessuna possibilità di disporre pagamenti.</Note>
        </div>
      )}
      {error && <p className="mt-3 text-sm text-[#ff8a8a]">{error}</p>}
    </Card>
  );
}

function ConsentsCard() {
  const { data, update } = useStore();
  const sync = useSyncConsent();
  const [busy, setBusy] = useState<string | null>(null);

  async function disconnect(c: Consent, deleteData: boolean) {
    setBusy(c.id);
    await revokeSession(c.sessionId, data.settings.apiToken).catch(() => undefined);
    update((d) => {
      const accIds = new Set(d.accounts.filter((a) => a.origin === 'open-banking' && a.provider === c.provider).map((a) => a.id));
      return {
        ...d,
        consents: d.consents.map((x) => (x.id === c.id ? { ...x, status: 'revoked' as const } : x)),
        accounts: deleteData ? d.accounts.filter((a) => !accIds.has(a.id)) : d.accounts,
        transactions: deleteData ? d.transactions.filter((t) => !accIds.has(t.accountId)) : d.transactions,
      };
    });
    setBusy(null);
  }

  return (
    <Card className="lg:col-span-6">
      <CardHeader icon={<Unplug size={16} className="text-muted" />} title="Consensi attivi" subtitle="Gestisci, sincronizza o revoca l'accesso in qualsiasi momento" />
      {!data.consents.length && <p className="text-sm text-muted">Nessun conto collegato via Open Banking.</p>}
      <ul className="space-y-3">
        {data.consents.map((c) => {
          const expired = new Date(c.validUntil) < new Date();
          return (
            <li key={c.id} className="rounded-xl border border-line bg-page p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium text-ink">
                    {c.aspspName}
                    {c.status === 'active' && !expired ? <Badge tone="good">Attivo</Badge> : c.status === 'revoked' ? <Badge>Revocato</Badge> : <Badge tone="warning">Scaduto</Badge>}
                    <Badge tone="info">Sola lettura</Badge>
                  </div>
                  <div className="text-xs text-muted">
                    {c.accountIds.length} conti · valido fino al {fmtDate(c.validUntil.slice(0, 10), 'long')} · ultima sincronizzazione {c.lastSync ? new Date(c.lastSync).toLocaleString('it-IT') : 'mai'}
                  </div>
                  {c.lastError && <div className="mt-1 text-xs text-warning">{c.lastError}</div>}
                </div>
                {c.status === 'active' && (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" disabled={busy === c.id || expired} onClick={async () => { setBusy(c.id); await sync(c).catch(() => undefined); setBusy(null); }}>
                      {busy === c.id ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Sincronizza
                    </Button>
                    <Button size="sm" variant="danger" disabled={busy === c.id} onClick={() => { const del = window.confirm('Revocare il consenso. Vuoi anche cancellare i dati importati da questo collegamento? (OK = cancella, Annulla = mantieni)'); void disconnect(c, del); }}>
                      Scollega
                    </Button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[11px] text-muted">Sincronizzazione automatica all'apertura dell'app se sono passate più di 6 ore (le banche limitano gli accessi automatici a circa 4 al giorno).</p>
    </Card>
  );
}

function ImportCard() {
  const { applyImport } = useStore();
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<{ file: File; format: 'csv' | 'excel' | 'pdf'; result?: ImportResult; tabular?: TabularInput; connectorId?: string; text?: string } | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [mapProvider, setMapProvider] = useState<'revolut' | 'traderepublic'>('revolut');
  const [done, setDone] = useState('');
  const input = useRef<HTMLInputElement>(null);

  async function handle(file: File) {
    setError('');
    setDone('');
    setPreview(null);
    setMapping(null);
    const format = fileFormat(file);
    if (!format) return setError('Formato non supportato. Usa CSV, Excel (.xlsx) o PDF.');
    if (file.size > 20 * 1024 * 1024) return setError('File troppo grande (max 20 MB).');
    setBusy(true);
    try {
      if (format === 'pdf') {
        const text = await readPdfText(file);
        const ranked = CONNECTORS.filter((c) => c.detectText).map((c) => ({ c, s: c.detectText!({ text, fileName: file.name }) })).sort((a, b) => b.s - a.s);
        if (!ranked[0] || ranked[0].s === 0) throw new Error('PDF non riconosciuto come estratto Revolut o Trade Republic.');
        const result = ranked[0].c.parseText!({ text, fileName: file.name });
        setPreview({ file, format, result, connectorId: ranked[0].c.id, text });
      } else {
        const matrix = format === 'csv' ? await readCsv(file) : await readExcel(file);
        const tabular = matrixToInput(matrix, file.name, format === 'csv' ? 'csv' : 'excel');
        const ranked = detectConnector(tabular);
        const best = ranked[0];
        if (best && best.score >= 0.5) {
          setPreview({ file, format, tabular, connectorId: best.connector.id, result: best.connector.parseTabular!(tabular) });
        } else {
          setPreview({ file, format, tabular });
          setMapping({ date: tabular.headers[0] ?? '', amount: tabular.headers[1] ?? '', description: tabular.headers[2] });
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function reparse(connectorId: string) {
    if (!preview?.tabular) return;
    const c = CONNECTORS.find((x) => x.id === connectorId)!;
    try {
      setPreview({ ...preview, connectorId, result: c.parseTabular!(preview.tabular) });
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const mappedResult = preview?.tabular && mapping && !preview.connectorId ? parseWithMapping(preview.tabular.rows, mapping, mapProvider, preview.tabular.origin) : undefined;
  const result = preview?.result ?? mappedResult;

  function confirm() {
    if (!preview || !result) return;
    applyImport(result, { fileName: preview.file.name, format: preview.format });
    setDone(`Importati ${result.transactions.length} movimenti e ${result.holdings.length} posizioni da ${preview.file.name}.`);
    setPreview(null);
  }

  return (
    <Card className="lg:col-span-12">
      <CardHeader icon={<Upload size={16} className="text-accent" />} title="Importa estratti conto" subtitle="CSV, Excel o PDF di Revolut e Trade Republic · elaborati nel browser, mai inviati a server" />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <button
            type="button"
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) void handle(f); }}
            onClick={() => input.current?.click()}
            className={clsx('flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors', drag ? 'border-accent bg-accent/5' : 'border-line-strong hover:border-white/20')}
          >
            {busy ? <Loader2 className="animate-spin text-muted" /> : <div className="flex gap-2 text-muted"><FileSpreadsheet size={24} /><FileText size={24} /></div>}
            <div className="mt-3 text-sm font-medium text-ink">Trascina qui un file o clicca per sceglierlo</div>
            <div className="mt-1 text-xs text-muted">Il formato viene riconosciuto automaticamente; potrai controllare l'anteprima prima di salvare.</div>
          </button>
          <input ref={input} type="file" hidden accept=".csv,.tsv,.txt,.xlsx,.xlsm,.pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handle(f); e.target.value = ''; }} />
          {error && <p className="mt-3 text-sm text-[#ff8a8a]">{error}</p>}
          {done && <p className="mt-3 flex items-center gap-2 text-sm text-[#5fd35f]"><Check size={15} /> {done}</p>}

          {preview && (
            <div className="mt-5 rounded-2xl border border-line bg-page p-4 animate-fade-in">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-ink">Anteprima: {preview.file.name}</div>
                {preview.tabular && (
                  <select className={`${inputBase} h-8 w-auto text-xs`} value={preview.connectorId ?? 'manual'} onChange={(e) => (e.target.value === 'manual' ? (setPreview({ ...preview, connectorId: undefined, result: undefined }), setMapping({ date: preview.tabular!.headers[0], amount: preview.tabular!.headers[1] })) : reparse(e.target.value))} aria-label="Formato">
                    {CONNECTORS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                    <option value="manual">Altro formato (mappatura manuale)</option>
                  </select>
                )}
              </div>
              {preview.tabular && !preview.connectorId && mapping && (
                <div className="mb-4 grid gap-2 sm:grid-cols-3">
                  {(['date', 'amount', 'description', 'currency', 'fee'] as const).map((k) => (
                    <Field key={k} label={{ date: 'Colonna data *', amount: 'Colonna importo *', description: 'Descrizione', currency: 'Valuta', fee: 'Commissione' }[k]}>
                      <select className={`${inputCls} h-9 text-xs`} value={mapping[k] ?? ''} onChange={(e) => setMapping({ ...mapping, [k]: e.target.value || undefined })}>
                        <option value="">—</option>
                        {preview.tabular!.headers.map((h) => <option key={h}>{h}</option>)}
                      </select>
                    </Field>
                  ))}
                  <Field label="Fonte">
                    <select className={`${inputCls} h-9 text-xs`} value={mapProvider} onChange={(e) => setMapProvider(e.target.value as 'revolut' | 'traderepublic')}>
                      <option value="revolut">Revolut</option>
                      <option value="traderepublic">Trade Republic</option>
                    </select>
                  </Field>
                </div>
              )}
              {result && (
                <>
                  <div className="mb-3 flex flex-wrap gap-2 text-xs">
                    <Badge tone="info">{result.accounts.length} conti</Badge>
                    <Badge tone="info">{result.transactions.length} movimenti</Badge>
                    <Badge tone="info">{result.holdings.length} posizioni</Badge>
                  </div>
                  {result.warnings.map((w) => <div key={w} className="mb-2"><Note tone="warning">{w}</Note></div>)}
                  <div className="max-h-72 overflow-auto rounded-xl border border-line">
                    <table className="w-full text-xs">
                      <tbody>
                        {result.transactions.slice(0, 25).map((t) => (
                          <tr key={t.id} className="border-b border-line/50">
                            <td className="px-2 py-1.5 text-muted">{t.date}</td>
                            <td className="max-w-[260px] truncate px-2 py-1.5 text-ink-2">{t.description}</td>
                            <td className="px-2 py-1.5 text-muted">{t.kind}</td>
                            <td className="px-2 py-1.5 text-right tnum text-ink">{fmtMoney(t.amount, t.currency)}</td>
                          </tr>
                        ))}
                        {result.holdings.slice(0, 25).map((h) => (
                          <tr key={h.id} className="border-b border-line/50">
                            <td className="px-2 py-1.5 text-muted">{h.isin}</td>
                            <td className="max-w-[260px] truncate px-2 py-1.5 text-ink-2">{h.name}</td>
                            <td className="px-2 py-1.5 text-muted">{h.quantity} pz</td>
                            <td className="px-2 py-1.5 text-right tnum text-ink">{fmtMoney(h.quantity * (h.lastPrice ?? h.avgCost))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3 flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => setPreview(null)}>Annulla</Button>
                    <Button variant="primary" onClick={confirm} disabled={!result.transactions.length && !result.holdings.length}>Conferma importazione</Button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        <div className="space-y-4">
          {CONNECTORS.slice(0, 2).map((c) => (
            <div key={c.id} className="rounded-xl border border-line bg-page p-4">
              <div className="text-sm font-semibold text-ink">{c.label}</div>
              <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-ink-2 marker:text-muted">
                {c.instructions.map((s) => <li key={s}>{s}</li>)}
              </ol>
            </div>
          ))}
          <ImportHistory />
        </div>
      </div>
    </Card>
  );
}

function ImportHistory() {
  const { data } = useStore();
  if (!data.imports.length) return null;
  return (
    <div className="rounded-xl border border-line bg-page p-4">
      <div className="mb-2 text-sm font-semibold text-ink">Importazioni recenti</div>
      <ul className="space-y-1.5 text-xs text-ink-2">
        {[...data.imports].reverse().slice(0, 6).map((i) => (
          <li key={i.id} className="flex justify-between gap-2">
            <span className="truncate">{i.fileName}</span>
            <span className="shrink-0 text-muted">{new Date(i.importedAt).toLocaleDateString('it-IT')}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
