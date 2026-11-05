import { AlertTriangle, Repeat, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { categoryBreakdown, categoryByMonth, compareMonths, type Period } from '../analytics/spending';
import { BarList, BarSeriesChart } from '../components/charts';
import { Badge, Button, Card, CardHeader, Delta, inputBase, inputCls, Money, NatureTag, Note, PageHeader, Segmented, Stat } from '../components/ui';
import { KIND_LABEL, TransactionList } from '../components/widgets';
import { applyCategories, CATEGORY_META } from '../domain/categories';
import { CATEGORIES, type SpendingCategory, type Transaction, type TxKind } from '../domain/types';
import { monthKey } from '../lib/dates';
import { fmtDate, fmtMoney, fmtMonth, fmtPct } from '../lib/format';
import { NEUTRAL, SERIES } from '../lib/palette';
import { useStore } from '../state/store';

type Tab = 'overview' | 'recurring' | 'anomalies' | 'habits' | 'savings' | 'transactions';
const CADENCE: Record<string, string> = { weekly: 'settimanale', monthly: 'mensile', quarterly: 'trimestrale', yearly: 'annuale' };

export default function SpendingPage() {
  const { data, analysis: a, update } = useStore();
  const [tab, setTab] = useState<Tab>('overview');
  const [periodKey, setPeriodKey] = useState<'MTD' | 'PM' | '3M' | '6M' | '1Y'>('3M');
  const period: Period = a.periods[periodKey];
  const cats = useMemo(() => categoryBreakdown(data.transactions, a.conv, period), [data, a, period]);
  const total = cats.reduce((s, c) => s + c.total, 0);
  const months = Math.max(1, (new Date(period.to).getTime() - new Date(period.from).getTime()) / (30.4 * 86_400_000));

  // grafico impilato: le 4 categorie principali + "Altro" (identità colore stabile per categoria)
  const top4 = a.categories3m.slice(0, 4).map((c) => c.category);
  const stacked = categoryByMonth(data.transactions, a.conv, monthKey(a.asOf), 12).map((r) => {
    const row: Record<string, unknown> = { month: r.month };
    let other = 0;
    for (const c of CATEGORIES) if (top4.includes(c)) row[c] = r[c];
      else other += r[c] as number;
    row.other = Math.round(other * 100) / 100;
    return row;
  });
  const cur = monthKey(a.asOf);
  const prev = a.flows12[a.flows12.length - 2]?.month ?? cur;
  const comparison = compareMonths(data.transactions, a.conv, cur, prev);

  const confirmInUse = (key: string) => update((d) => ({ ...d, dismissedInsights: [...d.dismissedInsights, `inuse:${key}`] }));

  return (
    <>
      <PageHeader title="Analisi delle spese" subtitle="Categorie, ricorrenze, anomalie e abitudini dai movimenti Revolut (e carta Trade Republic)." />
      <div className="mb-5 overflow-x-auto">
        <Segmented
          size="md"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'overview', label: 'Panoramica' },
            { value: 'recurring', label: `Ricorrenti (${a.recurring.filter((r) => r.active).length})` },
            { value: 'anomalies', label: `Insolite (${a.anomalies.length})` },
            { value: 'habits', label: 'Abitudini' },
            { value: 'savings', label: 'Risparmio' },
            { value: 'transactions', label: 'Movimenti' },
          ]}
        />
      </div>

      {tab === 'overview' && (
        <div className="grid gap-5 lg:grid-cols-12">
          <Card className="lg:col-span-12">
            <CardHeader title="Spese mensili per categoria" subtitle="Ultimi 12 mesi · prime 4 categorie del trimestre + altre" />
            <BarSeriesChart data={stacked} xKey="month" xFormatter={fmtMonth} stacked height={280} series={[...top4.map((c) => ({ key: c, name: CATEGORY_META[c].label, color: CATEGORY_META[c].color })), { key: 'other', name: 'Altre categorie', color: NEUTRAL }]} />
          </Card>
          <Card className="lg:col-span-7">
            <CardHeader
              title="Categorie più costose"
              subtitle={`${period.label}: ${fmtMoney(total)} · media ${fmtMoney(total / months)}/mese`}
              action={<Segmented value={periodKey} onChange={setPeriodKey} options={[{ value: 'MTD', label: 'Mese' }, { value: 'PM', label: 'Mese prec.' }, { value: '3M', label: '3M' }, { value: '6M', label: '6M' }, { value: '1Y', label: '1A' }]} />}
            />
            <BarList items={cats.map((c) => ({ label: CATEGORY_META[c.category].label, value: c.total, color: CATEGORY_META[c.category].color, extra: <span className="text-xs text-muted">{fmtPct(c.share, 0)} · {c.count} mov.</span> }))} />
          </Card>
          <Card className="lg:col-span-5">
            <CardHeader title="Confronto tra mesi" subtitle={`${fmtMonth(cur)} (in corso) vs ${fmtMonth(prev)}`} />
            <ul className="space-y-2.5">
              {comparison.slice(0, 8).map((c) => (
                <li key={c.category} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2 text-ink-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: CATEGORY_META[c.category].color }} />
                    {CATEGORY_META[c.category].label}
                  </span>
                  <span className="flex items-center gap-3 tnum">
                    <span className="text-xs text-muted">{fmtMoney(c.previous)} →</span>
                    <span className="font-medium text-ink">{fmtMoney(c.current)}</span>
                    <Delta value={c.delta} inverse className="w-20 justify-end" />
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[11px] text-muted">Il mese in corso è parziale: confronta l'andamento, non il totale.</p>
          </Card>
        </div>
      )}

      {tab === 'recurring' && (
        <div className="grid gap-5 lg:grid-cols-12">
          <Card className="lg:col-span-12">
            <div className="grid gap-6 sm:grid-cols-3">
              <Stat label="Spese ricorrenti attive" value={<Money value={a.recurring.filter((r) => r.active).reduce((s, r) => s + r.monthlyCost, 0)} />} hint="al mese" />
              <Stat label="Di cui abbonamenti" value={<Money value={a.recurring.filter((r) => r.active && r.isSubscription).reduce((s, r) => s + r.annualCost, 0)} />} hint="all'anno" />
              <Stat label="Da verificare" value={<Money value={a.forgotten.reduce((s, f) => s + f.item.annualCost, 0)} />} hint={`${a.forgotten.length} abbonamenti con indizi di non utilizzo`} />
            </div>
          </Card>
          {a.forgotten.length > 0 && (
            <Card className="lg:col-span-12">
              <CardHeader icon={<AlertTriangle size={16} className="text-warning" />} title="Abbonamenti potenzialmente dimenticati" subtitle="Indizi oggettivi: servizi duplicati, aumenti di prezzo, rinnovi annuali. Conferma se li usi." />
              <div className="grid gap-3 md:grid-cols-2">
                {a.forgotten.map((f) => (
                  <div key={f.item.key} className="rounded-xl border border-warning/20 bg-warning/[0.04] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-ink">{f.item.merchant}</div>
                        <div className="text-xs text-muted">{fmtMoney(f.item.lastAmount)} {CADENCE[f.item.cadence]} · {f.item.occurrences} addebiti dal {fmtDate(f.item.firstDate, 'long')}</div>
                      </div>
                      <div className="text-right">
                        <Money value={f.item.annualCost} className="font-semibold" />
                        <div className="text-[10px] uppercase text-muted">all'anno</div>
                      </div>
                    </div>
                    <ul className="mt-2 list-disc pl-4 text-xs text-ink-2">
                      {f.reasons.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                    <Button size="sm" variant="ghost" className="mt-2" onClick={() => confirmInUse(f.item.key)}>
                      Lo uso, non segnalarlo più
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          )}
          <Card className="lg:col-span-12">
            <CardHeader icon={<Repeat size={16} className="text-muted" />} title="Tutte le spese ricorrenti" subtitle="Rilevate automaticamente da cadenza regolare e importo stabile" />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-left text-xs text-muted">
                  <tr className="border-b border-line">
                    <th className="py-2 font-medium">Esercente</th>
                    <th className="py-2 font-medium">Categoria</th>
                    <th className="py-2 font-medium">Cadenza</th>
                    <th className="py-2 font-medium">Prossimo addebito</th>
                    <th className="py-2 text-right font-medium">Importo</th>
                    <th className="py-2 text-right font-medium">Annuo</th>
                  </tr>
                </thead>
                <tbody>
                  {a.recurring.map((r) => (
                    <tr key={r.key} className="border-b border-line/60">
                      <td className="py-2.5">
                        <div className="font-medium text-ink">{r.merchant}</div>
                        <div className="flex gap-1.5 pt-0.5">
                          {r.isSubscription && <Badge tone="info">Abbonamento</Badge>}
                          {!r.active && <Badge>Non più attivo</Badge>}
                          {r.priceIncrease && <Badge tone="serious">+{fmtPct(r.priceIncrease, 0)} prezzo</Badge>}
                        </div>
                      </td>
                      <td className="py-2.5 text-ink-2">{CATEGORY_META[r.category].label}</td>
                      <td className="py-2.5 text-ink-2">{CADENCE[r.cadence]}</td>
                      <td className="py-2.5 text-ink-2">{r.active ? `~${fmtDate(r.nextExpected, 'long')}` : '—'}</td>
                      <td className="py-2.5 text-right tnum">{fmtMoney(r.lastAmount)}</td>
                      <td className="py-2.5 text-right font-medium tnum">{fmtMoney(r.annualCost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!a.recurring.length && <p className="py-6 text-center text-sm text-muted">Servono almeno 3 mesi di movimenti per rilevare le ricorrenze.</p>}
          </Card>
        </div>
      )}

      {tab === 'anomalies' && (
        <Card>
          <CardHeader title="Spese insolite" subtitle="Ultimi 60 giorni, confrontati con il tuo storico per esercente e categoria (le ricorrenze note sono escluse)" />
          {a.anomalies.length ? (
            <ul className="divide-y divide-line/60">
              {a.anomalies.map((x) => (
                <li key={x.tx.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <div className="font-medium text-ink">{x.tx.merchant ?? x.tx.description}</div>
                    <div className="text-xs text-muted">{fmtDate(x.tx.date, 'long')} · {x.reason}</div>
                  </div>
                  <div className="text-right">
                    <Money value={x.value} className="font-semibold" />
                    {x.baseline > 0 && <div className="text-xs text-muted">tipico {fmtMoney(x.baseline)}</div>}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-muted">Nessuna spesa insolita negli ultimi 60 giorni.</p>
          )}
          <div className="mt-3">
            <Note>La soglia di sensibilità si regola in Impostazioni. Una spesa "insolita" non è necessariamente un problema: è un invito a controllarla.</Note>
          </div>
        </Card>
      )}

      {tab === 'habits' && (
        <div className="grid gap-5 lg:grid-cols-12">
          <Card className="lg:col-span-7">
            <CardHeader title="Spesa media per giorno della settimana" subtitle="Ultimi 3 mesi" />
            <BarSeriesChart data={a.habits.byWeekday as unknown as Record<string, unknown>[]} xKey="day" series={[{ key: 'avg', name: 'Media settimanale', color: SERIES[0] }]} />
          </Card>
          <Card className="lg:col-span-5">
            <CardHeader title="Abitudini di consumo" subtitle="Ultimi 3 mesi" />
            <div className="grid grid-cols-2 gap-5">
              <Stat label="Spesa media giornaliera" value={<Money value={a.habits.avgDailySpend} />} />
              <Stat label="Quota weekend" value={fmtPct(a.habits.weekendShare, 0)} hint="sab + dom" />
              <Stat label="Micro‑spese (< 10 €)" value={<Money value={a.habits.microSpending.monthlyAvg} />} hint={`al mese · ${a.habits.microSpending.count} acquisti`} />
              <Stat label="Food delivery" value={<Money value={a.habits.deliveryMonthly} />} hint="al mese" />
            </div>
          </Card>
          <Card className="lg:col-span-12">
            <CardHeader title="Esercenti principali" subtitle="Ultimi 3 mesi" />
            <BarList items={a.habits.topMerchants.map((m) => ({ label: m.merchant, value: m.total, color: CATEGORY_META[m.category].color, extra: <span className="text-xs text-muted">{m.count}×</span> }))} />
          </Card>
        </div>
      )}

      {tab === 'savings' && (
        <Card>
          <CardHeader title="Quanto potresti risparmiare" subtitle="Simulazioni sulla media degli ultimi 6 mesi. Ogni scenario dichiara le sue ipotesi." />
          <div className="mb-5 flex items-center gap-3">
            <Stat label="Totale se applicassi tutti gli scenari" value={<Money value={a.scenarios.reduce((s, x) => s + x.annual, 0)} />} hint="all'anno" tag={<NatureTag nature="stima" />} />
          </div>
          <ul className="space-y-3">
            {a.scenarios.map((s) => (
              <li key={s.id} className="rounded-xl border border-line bg-elevated/50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="font-medium text-ink">{s.title}</div>
                  <div className="text-right tnum">
                    <span className="font-semibold text-ink">{fmtMoney(s.annual)}</span>
                    <span className="text-xs text-muted"> /anno · {fmtMoney(s.monthly)} /mese</span>
                  </div>
                </div>
                <p className="mt-1 text-xs text-ink-2">{s.assumption}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {tab === 'transactions' && <TransactionsTab />}
    </>
  );
}

function TransactionsTab() {
  const { data, update } = useStore();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('all');
  const [editing, setEditing] = useState<Transaction | null>(null);
  const filtered = data.transactions.filter((t) => (cat === 'all' || t.category === cat || t.kind === cat) && (!q || `${t.description} ${t.merchant ?? ''}`.toLowerCase().includes(q.toLowerCase())));

  const save = (patch: Partial<Transaction>) => {
    if (!editing) return;
    update((d) => ({ ...d, transactions: applyCategories(d.transactions.map((t) => (t.id === editing.id ? { ...t, ...patch, categoryLocked: true } : t))) }));
    setEditing(null);
  };

  return (
    <Card>
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input className={`${inputCls} pl-9`} placeholder="Cerca movimenti…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className={`${inputBase} w-auto`} value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Filtra">
          <option value="all">Tutti</option>
          <optgroup label="Categorie">
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{CATEGORY_META[c].label}</option>
            ))}
          </optgroup>
          <optgroup label="Tipo">
            {Object.entries(KIND_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </optgroup>
        </select>
      </div>
      <p className="mb-2 text-xs text-muted">{filtered.length} movimenti · tocca un movimento per correggere categoria o tipo (la correzione si applica anche ai movimenti futuri dello stesso esercente).</p>
      <TransactionList txs={filtered} limit={200} onEdit={setEditing} />
      {editing && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setEditing(null)}>
          <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-5 animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold">{editing.merchant ?? editing.description}</h3>
            <p className="mb-4 text-xs text-muted">{fmtDate(editing.date, 'long')} · {fmtMoney(editing.amount, editing.currency, { sign: true })}</p>
            <EditForm t={editing} onSave={save} onCancel={() => setEditing(null)} />
          </div>
        </div>
      )}
    </Card>
  );
}

function EditForm({ t, onSave, onCancel }: { t: Transaction; onSave: (p: Partial<Transaction>) => void; onCancel: () => void }) {
  const [kind, setKind] = useState<TxKind>(t.kind);
  const [category, setCategory] = useState<SpendingCategory>(t.category ?? 'altro');
  return (
    <div className="space-y-3">
      <label className="block text-xs text-ink-2">
        Tipo di movimento
        <select className={`${inputCls} mt-1`} value={kind} onChange={(e) => setKind(e.target.value as TxKind)}>
          {Object.entries(KIND_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </label>
      {(kind === 'expense' || kind === 'refund') && (
        <label className="block text-xs text-ink-2">
          Categoria
          <select className={`${inputCls} mt-1`} value={category} onChange={(e) => setCategory(e.target.value as SpendingCategory)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{CATEGORY_META[c].label}</option>
            ))}
          </select>
        </label>
      )}
      <p className="text-[11px] text-muted">Usa "Trasferimento" per i movimenti tra tuoi conti: non verranno contati come spese o entrate.</p>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onCancel}>Annulla</Button>
        <Button variant="primary" onClick={() => onSave({ kind, category: kind === 'expense' || kind === 'refund' ? category : undefined })}>Salva</Button>
      </div>
    </div>
  );
}
