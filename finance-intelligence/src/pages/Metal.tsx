import clsx from 'clsx';
import { CheckCircle2, CircleHelp, ExternalLink, XCircle } from 'lucide-react';
import type { MetalBenefit } from '../analytics/metal';
import { Badge, Card, CardHeader, Field, inputCls, Money, NatureTag, Note, PageHeader, ScoreRing, Stat } from '../components/ui';
import type { MetalBenefitStatus, MetalPlanConfig } from '../domain/types';
import { fmtDate, fmtMoney } from '../lib/format';
import { useStore } from '../state/store';

const STATUS_OPTS: { value: MetalBenefitStatus; label: string }[] = [
  { value: 'unverified', label: 'Da verificare' },
  { value: 'confirmed', label: 'Incluso nel mio piano' },
  { value: 'not-available', label: 'Non disponibile' },
];

export default function MetalPage() {
  const { data, analysis: a, update } = useStore();
  const r = a.metal;
  const cfg = data.metal;
  const set = (patch: Partial<MetalPlanConfig>) => update((d) => ({ ...d, metal: { ...d.metal, ...patch, lastVerified: new Date().toISOString().slice(0, 10) } }));
  const setTerm = (k: keyof MetalPlanConfig['terms'], v: string, pct = false) => set({ terms: { ...cfg.terms, [k]: v === '' ? undefined : pct ? Number(v) / 100 : Number(v) } });
  const groups = [...new Set(r.usages.map((u) => u.benefit.group))];

  return (
    <>
      <PageHeader title="Revolut Metal" subtitle="Quanto stai sfruttando l'abbonamento che paghi, vantaggio per vantaggio." />
      <div className="grid gap-5 lg:grid-cols-12">
        <Card glow className="lg:col-span-12">
          <div className="flex flex-col items-center gap-8 md:flex-row">
            <div className="flex flex-col items-center">
              <ScoreRing score={r.score} size={150} />
              <div className="mt-2 text-sm font-medium text-ink">Metal Utilization Score</div>
              <div className="text-xs text-muted">{r.verifiedCount} vantaggi verificati · {r.unverifiedCount} da verificare</div>
            </div>
            <div className="grid flex-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Costo annuo del piano" value={<Money value={r.annualFee} />} hint={cfg.monthlyFee ? `${fmtMoney(cfg.monthlyFee)}/mese (inserito da te)` : 'inserisci il canone qui sotto'} />
              <Stat label="Valore ottenuto" value={<Money value={r.valueCaptured} />} tag={<NatureTag nature="stima" />} hint="ultimi 12 mesi" />
              <Stat label="Valore non sfruttato" value={<Money value={r.valuePotential} />} tag={<NatureTag nature="stima" />} hint="potenziale annuo aggiuntivo" />
              <Stat label="Saldo netto" value={<Money value={r.netValue} sign />} hint="valore ottenuto − canone" />
            </div>
          </div>
          <div className="mt-6">
            <Note tone="warning">
              Le condizioni di Revolut Metal (cashback, limiti ATM, assicurazioni, partner) cambiano per <strong>paese</strong>, nel tempo e talvolta per cliente. Il punteggio considera solo i vantaggi che hai segnato come <strong>inclusi nel tuo piano</strong> dopo averli verificati in app (Profilo → Il tuo piano → Vantaggi) o nei documenti contrattuali. Nessun vantaggio è dato per scontato.
            </Note>
          </div>
        </Card>

        <Card className="lg:col-span-4">
          <CardHeader title="Il tuo piano" subtitle={cfg.lastVerified ? `Ultima verifica: ${fmtDate(cfg.lastVerified, 'long')}` : 'Non ancora verificato'} />
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Paese">
                <select className={inputCls} value={cfg.country} onChange={(e) => set({ country: e.target.value })}>
                  {['IT', 'DE', 'FR', 'ES', 'NL', 'IE', 'PT', 'BE', 'AT', 'GB', 'CH', 'Altro'].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Piano">
                <select className={inputCls} value={cfg.plan} onChange={(e) => set({ plan: e.target.value as MetalPlanConfig['plan'] })}>
                  {['Standard', 'Plus', 'Premium', 'Metal', 'Ultra'].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Canone mensile (€)">
                <input type="number" step="0.01" min="0" className={inputCls} value={cfg.monthlyFee || ''} placeholder="es. dal tuo estratto" onChange={(e) => set({ monthlyFee: Number(e.target.value) || 0 })} />
              </Field>
              <Field label="Fatturazione">
                <select className={inputCls} value={cfg.billing} onChange={(e) => set({ billing: e.target.value as 'monthly' | 'annual' })}>
                  <option value="monthly">Mensile</option>
                  <option value="annual">Annuale</option>
                </select>
              </Field>
            </div>
            <div className="border-t border-line pt-3 text-xs font-medium text-ink-2">Condizioni verificate (usate nelle stime)</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cashback (%)">
                <input type="number" step="0.01" min="0" className={inputCls} value={cfg.terms.cashbackRate !== undefined ? +(cfg.terms.cashbackRate * 100).toFixed(3) : ''} onChange={(e) => setTerm('cashbackRate', e.target.value, true)} />
              </Field>
              <Field label="ATM gratis/mese (€)">
                <input type="number" min="0" className={inputCls} value={cfg.terms.freeAtmMonthly ?? ''} onChange={(e) => setTerm('freeAtmMonthly', e.target.value)} />
              </Field>
              <Field label="Comm. ATM oltre (%)">
                <input type="number" step="0.1" min="0" className={inputCls} value={cfg.terms.atmFeeAfterLimit !== undefined ? +(cfg.terms.atmFeeAfterLimit * 100).toFixed(2) : ''} onChange={(e) => setTerm('atmFeeAfterLimit', e.target.value, true)} />
              </Field>
              <Field label="Ricarico FX weekend (%)">
                <input type="number" step="0.1" min="0" className={inputCls} value={cfg.terms.weekendFxMarkup !== undefined ? +(cfg.terms.weekendFxMarkup * 100).toFixed(2) : ''} onChange={(e) => setTerm('weekendFxMarkup', e.target.value, true)} />
              </Field>
            </div>
            <a href="https://www.revolut.com/it-IT/legal/fees/" target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink">
              Tabelle commissioni ufficiali Revolut <ExternalLink size={12} />
            </a>
          </div>
        </Card>

        <Card className="lg:col-span-8">
          <CardHeader title="Cosa dicono i tuoi movimenti" subtitle="Ultimi 12 mesi, calcolati dalle transazioni Revolut" />
          <div className="grid gap-5 sm:grid-cols-3">
            <Stat label="Spesa con carta" value={<Money value={r.stats.cardSpend12m} />} />
            <Stat label="Pagamenti in valuta estera" value={<Money value={r.stats.foreignSpend12m} />} />
            <Stat label="Cambi nel weekend" value={<Money value={r.stats.weekendFxSpend12m} />} />
            <Stat label="Cashback ricevuto" value={<Money value={r.stats.cashbackReceived} />} />
            <Stat label="Max prelievi in un mese" value={<Money value={r.stats.atmMonthlyMax} />} hint={cfg.terms.freeAtmMonthly ? `limite gratuito ${fmtMoney(cfg.terms.freeAtmMonthly)}` : undefined} />
            <Stat label="Commissioni ATM pagate" value={<Money value={r.stats.atmFeesPaid} />} />
            <Stat label="Saldo salvadanai" value={<Money value={r.stats.savingsBalance} />} />
            <Stat label="Interessi salvadanai" value={<Money value={r.stats.savingsInterest12m} />} />
            <Stat label="Transazioni di viaggio" value={r.stats.travelTxCount} />
          </div>
        </Card>

        {groups.map((g) => (
          <Card key={g} className="lg:col-span-12">
            <CardHeader title={g} />
            <ul className="divide-y divide-line/60">
              {r.usages
                .filter((u) => u.benefit.group === g)
                .map((u) => (
                  <BenefitRow key={u.benefit.id} benefit={u.benefit} status={u.status} used={u.used} evidence={u.evidence} captured={u.valueCaptured} potential={u.valuePotential} assumption={u.assumption} declared={!!cfg.declaredUsage[u.benefit.id]} onStatus={(s) => set({ benefits: { ...cfg.benefits, [u.benefit.id]: s } })} onDeclared={(v) => set({ declaredUsage: { ...cfg.declaredUsage, [u.benefit.id]: v } })} />
                ))}
            </ul>
          </Card>
        ))}
      </div>
    </>
  );
}

function BenefitRow(p: { benefit: MetalBenefit; status: MetalBenefitStatus; used: boolean; evidence: string; captured: number; potential: number; assumption: string; declared: boolean; onStatus: (s: MetalBenefitStatus) => void; onDeclared: (v: boolean) => void }) {
  const Icon = p.status === 'not-available' ? XCircle : p.status === 'unverified' ? CircleHelp : p.used ? CheckCircle2 : CircleHelp;
  return (
    <li className="grid gap-3 py-4 md:grid-cols-12 md:items-start">
      <div className="flex gap-3 md:col-span-5">
        <Icon size={18} className={clsx('mt-0.5 shrink-0', p.status === 'confirmed' ? (p.used ? 'text-good' : 'text-warning') : 'text-muted')} aria-hidden />
        <div>
          <div className="flex flex-wrap items-center gap-2 font-medium text-ink">
            {p.benefit.name}
            {p.status === 'confirmed' && (p.used ? <Badge tone="good">Usato</Badge> : <Badge tone="warning">Non usato</Badge>)}
            {p.status === 'unverified' && <Badge>Da verificare</Badge>}
            {p.status === 'not-available' && <Badge>Non incluso</Badge>}
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-2">{p.benefit.description}</p>
          <p className="mt-1 text-[11px] text-muted">Verifica: {p.benefit.verifyHint}</p>
        </div>
      </div>
      <div className="text-xs text-ink-2 md:col-span-4">
        <div className="text-ink">{p.evidence}</div>
        {(p.captured > 0 || p.potential > 0) && p.status === 'confirmed' && (
          <div className="mt-1 flex flex-wrap gap-2">
            {p.captured > 0 && <span>Valore ottenuto ~{fmtMoney(p.captured)}</span>}
            {p.potential > 0 && <span className="text-warning">Potenziale ~{fmtMoney(p.potential)}/anno</span>}
          </div>
        )}
        {p.assumption && <p className="mt-1 text-[11px] text-muted">Ipotesi: {p.assumption}</p>}
      </div>
      <div className="space-y-2 md:col-span-3">
        <select className={`${inputCls} h-9 text-xs`} value={p.status} onChange={(e) => p.onStatus(e.target.value as MetalBenefitStatus)} aria-label={`Stato ${p.benefit.name}`}>
          {STATUS_OPTS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {p.benefit.detection !== 'transactions' && (
          <label className="flex items-center gap-2 text-xs text-ink-2">
            <input type="checkbox" checked={p.declared} onChange={(e) => p.onDeclared(e.target.checked)} className="accent-[#9085e9]" />
            Lo uso (non visibile dai movimenti)
          </label>
        )}
      </div>
    </li>
  );
}
