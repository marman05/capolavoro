import { Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { findOpportunities } from '../analytics/insights';
import { Button, Card, EmptyState, Money, NatureTag, PageHeader, Segmented, Stat } from '../components/ui';
import { OpportunityCard } from '../components/widgets';
import { useStore } from '../state/store';

export default function OpportunitiesPage() {
  const { data, analysis, update } = useStore();
  const ops = useMemo(() => findOpportunities(data, analysis), [data, analysis]);
  const [area, setArea] = useState('Tutte');
  const areas = ['Tutte', ...new Set(ops.map((o) => o.area))];
  const shown = area === 'Tutte' ? ops : ops.filter((o) => o.area === area);
  const facts = ops.filter((o) => o.amountNature === 'fatto').reduce((s, o) => s + o.amount, 0);
  const estimates = ops.filter((o) => o.amountNature === 'stima').reduce((s, o) => s + o.amount, 0);
  const dismissed = data.dismissedInsights.filter((d) => !d.startsWith('inuse:'));

  return (
    <>
      <PageHeader title="Opportunità per te" subtitle="Cosa l'app ha trovato nei tuoi dati, ordinato per impatto economico e rilevanza." />
      <Card glow className="mb-5">
        <div className="grid gap-6 sm:grid-cols-3">
          <Stat label="Opportunità individuate" value={ops.length} />
          <Stat label="Importi basati su fatti" value={<Money value={facts} />} tag={<NatureTag nature="fatto" />} hint="all'anno (es. commissioni e abbonamenti pagati)" />
          <Stat label="Potenziale stimato" value={<Money value={estimates} />} tag={<NatureTag nature="stima" />} hint="all'anno, con ipotesi dichiarate" />
        </div>
      </Card>
      {areas.length > 2 && (
        <div className="mb-4 overflow-x-auto">
          <Segmented value={area} onChange={setArea} options={areas.map((a) => ({ value: a, label: a }))} />
        </div>
      )}
      {shown.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {shown.map((o) => (
            <OpportunityCard key={o.id} o={o} onDismiss={() => update((d) => ({ ...d, dismissedInsights: [...d.dismissedInsights, o.id] }))} />
          ))}
        </div>
      ) : (
        <EmptyState icon={<Sparkles size={22} />} title="Nessuna opportunità" body="Con più dati (almeno 3 mesi di movimenti) l'analisi diventa più precisa." />
      )}
      {dismissed.length > 0 && (
        <div className="mt-6 text-center">
          <Button size="sm" variant="ghost" onClick={() => update((d) => ({ ...d, dismissedInsights: d.dismissedInsights.filter((x) => x.startsWith('inuse:')) }))}>
            Ripristina {dismissed.length} suggerimenti nascosti
          </Button>
        </div>
      )}
    </>
  );
}
