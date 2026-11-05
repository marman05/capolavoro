import type { FinanceData } from '../domain/types';
import { fmtMoney, fmtPct } from '../lib/format';
import { sum } from '../lib/stats';
import type { Analysis } from './index';

export interface Opportunity {
  id: string;
  area: 'Abbonamenti' | 'Commissioni' | 'Revolut Metal' | 'Cambio valuta' | 'Liquidità' | 'Spese' | 'Portafoglio' | 'Funzionalità' | 'Gestione';
  title: string;
  found: string; // 1. cosa abbiamo individuato
  why: string; // 2. perché è importante
  amount: number; // 3. denaro coinvolto (annuo, valuta base)
  amountNature: 'fatto' | 'stima';
  amountNote: string;
  how: string[]; // 4. come intervenire
  risks: string; // 5. rischi e limiti
  relevance: number; // 0..1
  link: string;
}

/**
 * Motore "Opportunità per te". Ogni regola usa solo dati effettivamente presenti
 * e dichiara quando l'importo è un fatto (es. commissioni pagate) o una stima.
 * Ordinamento: impatto economico × rilevanza.
 */
export function findOpportunities(data: FinanceData, a: Analysis): Opportunity[] {
  const out: Opportunity[] = [];
  const cur = data.settings.baseCurrency;
  const m = (v: number) => fmtMoney(v, cur);

  // 1. Abbonamenti potenzialmente inutilizzati / duplicati
  for (const f of a.forgotten.slice(0, 5)) {
    out.push({
      id: `sub:${f.item.key}`,
      area: 'Abbonamenti',
      title: `Verifica l'abbonamento ${f.item.merchant}`,
      found: `${f.item.merchant}: ${m(f.item.lastAmount)} ${f.item.cadence === 'yearly' ? "all'anno" : 'al mese'}, ${f.item.occurrences} addebiti dal ${f.item.firstDate}. ${f.reasons.join('. ')}.`,
      why: 'Gli abbonamenti si rinnovano in automatico: piccoli importi ricorrenti diventano cifre rilevanti in un anno.',
      amount: f.item.annualCost,
      amountNature: 'fatto',
      amountNote: 'Costo annuo calcolato sugli addebiti reali; il risparmio si ottiene solo se disdici.',
      how: ['Apri il servizio e controlla quando l\'hai usato l\'ultima volta', 'Se non serve, disdici dal sito del servizio (non basta bloccare la carta)', 'Se lo usi, segnalo come "in uso" per non vederlo più qui', 'Valuta di spostarlo su una carta virtuale Revolut dedicata agli abbonamenti'],
      risks: 'L\'app non può sapere se usi il servizio: è un indizio, non una certezza. Alcuni piani annuali non sono rimborsabili.',
      relevance: 0.9,
      link: '/spese',
    });
  }

  // 2. Commissioni evitabili (fatti)
  const atmFees = a.metal.stats.atmFeesPaid;
  if (atmFees > 0) {
    out.push({
      id: 'fees:atm',
      area: 'Commissioni',
      title: 'Commissioni sui prelievi oltre il limite gratuito',
      found: `Negli ultimi 12 mesi hai pagato ${m(atmFees)} di commissioni ATM su Revolut. Massimo prelevato in un mese: ${m(a.metal.stats.atmMonthlyMax)}.`,
      why: 'Sono costi evitabili pianificando i prelievi o pagando con carta.',
      amount: atmFees,
      amountNature: 'fatto',
      amountNote: 'Somma delle commissioni effettivamente addebitate.',
      how: ['Concentra i prelievi entro il limite mensile gratuito del tuo piano', 'Paga con carta dove possibile', 'Verifica il limite attuale nella sezione Vantaggi del piano'],
      risks: 'Il limite può cambiare; in alcuni paesi gli ATM locali applicano una propria commissione.',
      relevance: 0.8,
      link: '/revolut-metal',
    });
  }
  const trFees = a.portfolio.fees;
  const trOrders = data.transactions.filter((t) => t.provider === 'traderepublic' && (t.kind === 'investment-buy' || t.kind === 'investment-sell') && (t.fee ?? 0) > 0);
  if (trOrders.length >= 6) {
    const small = trOrders.filter((t) => Math.abs(t.amount) < 250);
    const plans = data.savingsPlans.filter((p) => p.active);
    out.push({
      id: 'fees:orders',
      area: 'Commissioni',
      title: 'Ordini manuali con commissione fissa',
      found: `${trOrders.length} ordini con commissione (${m(trFees)} in totale di costi Trade Republic). ${small.length} ordini sotto 250 €: su questi 1 € pesa almeno lo 0,4%.`,
      why: 'Una commissione fissa incide molto sugli ordini piccoli; i piani di accumulo su Trade Republic sono normalmente senza commissione d\'ordine.',
      amount: sum(small.map((t) => t.fee ?? 0)),
      amountNature: 'fatto',
      amountNote: 'Commissioni pagate sugli ordini piccoli: potenzialmente evitabili con un PAC.',
      how: [plans.length ? 'Sposta gli acquisti ricorrenti sui PAC già attivi' : 'Valuta un piano di accumulo per gli acquisti periodici', 'Raggruppa gli acquisti manuali in ordini meno frequenti'],
      risks: 'I PAC eseguono a date fisse e potrebbero non essere disponibili per tutti gli strumenti. Verifica le condizioni attuali di Trade Republic.',
      relevance: 0.6,
      link: '/investimenti',
    });
  }

  // 3. Vantaggi Revolut Metal non sfruttati
  const unused = a.metal.usages.filter((u) => u.status === 'confirmed' && !u.used);
  const unusedValue = sum(unused.map((u) => u.valuePotential));
  if (unused.length) {
    out.push({
      id: 'metal:unused',
      area: 'Revolut Metal',
      title: `${unused.length} vantaggi Metal verificati che non usi`,
      found: `Non risultano utilizzati: ${unused.map((u) => u.benefit.name).join(', ')}.`,
      why: a.metal.annualFee ? `Paghi ${m(a.metal.annualFee)} all'anno per il piano: ogni vantaggio non usato riduce il valore dell'abbonamento.` : 'Stai pagando per vantaggi che non usi.',
      amount: unusedValue,
      amountNature: 'stima',
      amountNote: 'Somma delle stime per vantaggio; vedi le ipotesi nella sezione Revolut Metal.',
      how: unused.slice(0, 4).map((u) => `${u.benefit.name}: ${u.benefit.description}`),
      risks: 'Il valore dipende dalle tue abitudini: un vantaggio non usato non vale nulla se non ti serve.',
      relevance: 0.7,
      link: '/revolut-metal',
    });
  }
  if (a.metal.unverifiedCount > 0) {
    out.push({
      id: 'metal:verify',
      area: 'Revolut Metal',
      title: 'Verifica le condizioni del tuo piano Metal',
      found: `${a.metal.unverifiedCount} vantaggi sono ancora "da verificare": non vengono conteggiati nel Metal Utilization Score.`,
      why: 'Le condizioni Revolut cambiano per paese e nel tempo: senza verifica le stime non sono affidabili.',
      amount: 0,
      amountNature: 'stima',
      amountNote: 'Nessun importo finché le condizioni non sono verificate.',
      how: ['Apri Revolut → Profilo → Il tuo piano → Vantaggi', 'Segna ciascun vantaggio come disponibile o non disponibile', 'Inserisci il canone mensile reale'],
      risks: 'Nessuno.',
      relevance: 0.4,
      link: '/revolut-metal',
    });
  }
  if (a.metal.annualFee > 0 && a.metal.verifiedCount >= 4 && a.metal.valueCaptured < a.metal.annualFee * 0.6) {
    out.push({
      id: 'metal:downgrade',
      area: 'Revolut Metal',
      title: 'Il valore ottenuto da Metal è inferiore al canone',
      found: `Valore stimato ottenuto: ${m(a.metal.valueCaptured)}/anno contro un canone di ${m(a.metal.annualFee)}/anno.`,
      why: 'Potresti ottenere gli stessi servizi che usi davvero con un piano inferiore.',
      amount: Math.max(0, a.metal.annualFee - a.metal.valueCaptured),
      amountNature: 'stima',
      amountNote: 'Differenza tra canone e valore stimato dei vantaggi usati.',
      how: ['Confronta i piani nell\'app Revolut (Profilo → Piano)', 'Valuta se assicurazioni o cashback giustificano il canone', 'Considera la fatturazione annuale se resti su Metal'],
      risks: 'Le stime del valore sono prudenziali; coperture assicurative possono valere molto in caso di sinistro.',
      relevance: 0.75,
      link: '/revolut-metal',
    });
  }

  // 4. Cambio valuta nel weekend
  if (a.metal.stats.weekendFxSpend12m > 200) {
    const markup = data.metal.terms.weekendFxMarkup ?? 0.01;
    out.push({
      id: 'fx:weekend',
      area: 'Cambio valuta',
      title: 'Cambi valuta effettuati nel weekend',
      found: `Hai cambiato ${m(a.metal.stats.weekendFxSpend12m)} di sabato o domenica negli ultimi 12 mesi.`,
      why: 'Nel weekend Revolut può applicare un ricarico sul tasso di cambio, perché i mercati valutari sono chiusi.',
      amount: a.metal.stats.weekendFxSpend12m * markup,
      amountNature: 'stima',
      amountNote: `Ipotesi ricarico weekend ${fmtPct(markup)} (verifica nella tabella commissioni del tuo piano).`,
      how: ['Cambia la valuta in anticipo nei giorni feriali prima del viaggio', 'Mantieni un piccolo saldo nella valuta che usi spesso'],
      risks: 'Cambiare in anticipo espone alle oscillazioni del tasso di cambio.',
      relevance: 0.5,
      link: '/revolut-metal',
    });
  }

  // 5. Liquidità non allocata
  const buffer = a.savings.avgMonthlyExpenses * data.settings.idleCashBuffer;
  const idleAccounts = a.netWorth.byAccount.filter(({ account }) => (account.interestRate ?? 0) === 0 && account.kind === 'current');
  const idle = sum(idleAccounts.map((x) => x.value));
  const excess = idle - buffer;
  if (excess > 1000) {
    const rate = data.settings.tradeRepublicCashRate ?? 0.02;
    out.push({
      id: 'cash:idle',
      area: 'Liquidità',
      title: 'Liquidità ferma sul conto corrente',
      found: `${m(idle)} su conti senza interessi. Considerando una riserva di ${data.settings.idleCashBuffer} mesi di spese (${m(buffer)}), restano ${m(excess)} inattivi.`,
      why: 'La liquidità non remunerata perde potere d\'acquisto con l\'inflazione.',
      amount: excess * rate,
      amountNature: 'stima',
      amountNote: `Interessi lordi annui ipotizzando un tasso del ${fmtPct(rate, 2)} (verifica i tassi attuali di salvadanaio Revolut o liquidità Trade Republic).`,
      how: ['Sposta l\'eccedenza in un salvadanaio Revolut con interessi o sulla liquidità Trade Republic', 'Mantieni sul conto corrente solo le spese del mese', 'Se hai obiettivi di lungo termine, valuta un piano di investimento graduale'],
      risks: 'I tassi sono variabili e tassati (in Italia 26% sugli interessi). Gli investimenti possono perdere valore: non è consulenza finanziaria.',
      relevance: 0.85,
      link: '/patrimonio',
    });
  }

  // 6. Spese ricorrenti eccessive rispetto alle entrate
  // affitto/mutuo esclusi: sono costi fissi difficilmente comprimibili
  const recMonthly = sum(a.recurring.filter((r) => r.active && !(r.category === 'casa' && r.monthlyCost > 300)).map((r) => r.monthlyCost));
  const avgIncome = sum(a.flows12.map((f) => f.income)) / Math.max(1, a.flows12.filter((f) => f.income > 0).length);
  if (avgIncome > 0 && recMonthly / avgIncome > 0.15) {
    out.push({
      id: 'recurring:heavy',
      area: 'Spese',
      title: 'Le spese ricorrenti pesano molto sulle entrate',
      found: `Spese ricorrenti attive (escluso affitto/mutuo): ${m(recMonthly)}/mese, pari al ${fmtPct(recMonthly / avgIncome)} delle entrate medie.`,
      why: 'Costi fissi elevati riducono la flessibilità e la capacità di risparmio.',
      amount: recMonthly * 12 * 0.1,
      amountNature: 'stima',
      amountNote: 'Ipotesi: riduzione del 10% rinegoziando o disdicendo alcune voci.',
      how: ['Rivedi le utenze (luce, gas, telefono) confrontando offerte', 'Elimina i servizi doppi', 'Valuta i piani annuali per i servizi che usi sicuramente'],
      risks: 'Cambiare fornitore può comportare vincoli o costi di attivazione.',
      relevance: 0.6,
      link: '/spese',
    });
  }

  // 7. Possibili risparmi sulle abitudini
  for (const s of a.scenarios.filter((x) => x.id !== 'forgotten').slice(0, 2)) {
    out.push({
      id: `habit:${s.id}`,
      area: 'Spese',
      title: s.title,
      found: s.assumption,
      why: 'Piccoli cambiamenti sulle spese più frequenti hanno un effetto cumulato rilevante.',
      amount: s.annual,
      amountNature: 'stima',
      amountNote: 'Simulazione basata sulla media degli ultimi 6 mesi.',
      how: ['Imposta un budget mensile per la categoria nell\'app Revolut', 'Monitora il progresso nella sezione Spese'],
      risks: 'È una simulazione: il risparmio reale dipende dalle tue scelte.',
      relevance: 0.45,
      link: '/spese',
    });
  }

  // 8. Concentrazioni di portafoglio
  if (a.diversification.warnings.length) {
    out.push({
      id: 'portfolio:concentration',
      area: 'Portafoglio',
      title: 'Concentrazione nel portafoglio',
      found: a.diversification.warnings.join(' '),
      why: 'Una forte concentrazione aumenta l\'impatto di un singolo evento negativo sul tuo patrimonio.',
      amount: 0,
      amountNature: 'fatto',
      amountNote: `Nessun risparmio diretto: è un rischio. Capitale nella posizione principale: ${m(a.diversification.topPosition?.value ?? 0)}.`,
      how: ['Valuta se la concentrazione è voluta e coerente con il tuo orizzonte', 'Per ribilanciare puoi indirizzare i nuovi versamenti verso le componenti sottopesate, senza vendere'],
      risks: 'Questa app non dà consulenza: le soglie sono euristiche. Vendere può generare imposte sulle plusvalenze.',
      relevance: 0.55,
      link: '/investimenti',
    });
  }
  if (a.portfolio.weightedTer > 0.004) {
    out.push({
      id: 'portfolio:ter',
      area: 'Portafoglio',
      title: 'Costi annui degli ETF sopra la media',
      found: `Costo medio ponderato (TER) del ${fmtPct(a.portfolio.weightedTer, 2)}: circa ${m(a.portfolio.annualTerCost)} all'anno.`,
      why: 'I costi ricorrenti si sottraggono ogni anno al rendimento e si compongono nel tempo.',
      amount: a.portfolio.annualTerCost - a.portfolio.value * 0.002,
      amountNature: 'stima',
      amountNote: 'Differenza rispetto a un TER di riferimento dello 0,20%.',
      how: ['Confronta ETF con esposizione simile e TER inferiore', 'Valuta l\'impatto fiscale prima di sostituire posizioni in guadagno'],
      risks: 'TER più basso non significa automaticamente prodotto migliore (replica, liquidità, tracking difference).',
      relevance: 0.4,
      link: '/investimenti',
    });
  }

  // 9. Funzionalità non usate
  const hasPlans = data.savingsPlans.some((p) => p.active);
  const buys = data.transactions.filter((t) => t.kind === 'investment-buy' && t.provider === 'traderepublic');
  if (!hasPlans && buys.length >= 4) {
    out.push({
      id: 'feature:pac',
      area: 'Funzionalità',
      title: 'Nessun piano di accumulo attivo',
      found: `Hai fatto ${buys.length} acquisti manuali su Trade Republic e nessun PAC risulta attivo.`,
      why: 'Un PAC automatizza la disciplina d\'investimento ed evita commissioni sugli ordini.',
      amount: sum(buys.map((b) => b.fee ?? 0)),
      amountNature: 'fatto',
      amountNote: 'Commissioni effettivamente pagate sugli acquisti manuali.',
      how: ['Imposta un piano di accumulo sugli strumenti che acquisti regolarmente', 'Sincronizza la data del PAC con l\'arrivo dello stipendio'],
      risks: 'Un PAC investe anche quando i mercati scendono: è coerente solo con un orizzonte lungo.',
      relevance: 0.5,
      link: '/investimenti',
    });
  }
  if (!data.consents.length) {
    out.push({
      id: 'feature:sync',
      area: 'Gestione',
      title: 'Collega Revolut via Open Banking',
      found: 'I dati provengono solo da import manuali.',
      why: 'Con il collegamento PSD2 in sola lettura i saldi e i movimenti si aggiornano senza dover esportare file.',
      amount: 0,
      amountNature: 'stima',
      amountNote: 'Nessun impatto economico diretto.',
      how: ['Configura Enable Banking nel server (vedi docs/INTEGRATIONS.md)', 'Vai in Connessioni → Collega Revolut'],
      risks: 'Il consenso PSD2 scade e va rinnovato periodicamente.',
      relevance: 0.2,
      link: '/connessioni',
    });
  }

  const dismissed = new Set(data.dismissedInsights);
  return out
    .filter((o) => !dismissed.has(o.id))
    .map((o) => ({ ...o, amount: Math.max(0, Math.round(o.amount * 100) / 100) }))
    .sort((x, y) => y.amount * (0.5 + y.relevance) * (y.amountNature === 'fatto' ? 1.2 : 1) - x.amount * (0.5 + x.relevance) * (x.amountNature === 'fatto' ? 1.2 : 1) || y.relevance - x.relevance);
}
