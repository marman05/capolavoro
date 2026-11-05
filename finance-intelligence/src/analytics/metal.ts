import type { FinanceData, MetalBenefitStatus, MetalPlanConfig, Transaction } from '../domain/types';
import { addDays } from '../lib/dates';
import { round2, sum } from '../lib/stats';
import type { Conv } from './spending';

/**
 * Catalogo dei vantaggi del piano Revolut Metal.
 *
 * IMPORTANTE: le condizioni (percentuali di cashback, limiti ATM, coperture assicurative,
 * offerte partner) cambiano per paese, nel tempo e talvolta per cliente. Per questo
 * ogni vantaggio parte come "da verificare" e viene conteggiato nel punteggio solo
 * dopo che l'utente lo conferma confrontandolo con l'app Revolut
 * (Profilo → Piano → Vantaggi) o con i documenti contrattuali del proprio piano.
 * I valori economici sono stime con ipotesi dichiarate.
 */
export interface MetalBenefit {
  id: string;
  name: string;
  group: 'Risparmio' | 'Viaggi' | 'Protezione' | 'Gestione denaro' | 'Partner';
  description: string;
  weight: number; // importanza nel punteggio
  verifyHint: string;
  detection: 'transactions' | 'declared' | 'mixed';
}

export const METAL_BENEFITS: MetalBenefit[] = [
  { id: 'cashback', name: 'Cashback sui pagamenti con carta', group: 'Risparmio', weight: 3, detection: 'transactions', description: 'Percentuale restituita sui pagamenti con carta, spesso diversa tra pagamenti in Europa e fuori Europa e con un tetto mensile.', verifyHint: 'Verifica percentuale e tetto mensile per il tuo paese nella sezione Vantaggi del piano.' },
  { id: 'fx', name: 'Cambio valuta senza commissioni', group: 'Viaggi', weight: 3, detection: 'transactions', description: 'Cambio a tasso interbancario entro i limiti del piano; nel weekend e per alcune valute può essere applicato un ricarico.', verifyHint: 'Verifica eventuale limite di utilizzo e ricarico nel weekend nella tabella commissioni del tuo piano.' },
  { id: 'atm', name: 'Prelievi ATM gratuiti', group: 'Viaggi', weight: 2, detection: 'transactions', description: 'Prelievi gratuiti fino a un importo mensile; oltre il limite si paga una commissione percentuale.', verifyHint: 'Verifica il limite mensile di prelievi gratuiti e la commissione oltre soglia.' },
  { id: 'travel-insurance', name: 'Assicurazione medica viaggio', group: 'Protezione', weight: 3, detection: 'mixed', description: 'Copertura spese mediche all\'estero e, a seconda del paese, ritardo voli/bagagli.', verifyHint: 'Leggi il set informativo della polizza del tuo paese: massimali, franchigie, esclusioni e se serve attivarla.' },
  { id: 'purchase-protection', name: 'Protezione acquisti e resi', group: 'Protezione', weight: 1, detection: 'declared', description: 'Tutela su acquisti danneggiati/rubati o rimborso se il negozio non accetta il reso, entro i massimali.', verifyHint: 'Verifica disponibilità nel tuo paese: queste coperture variano molto.' },
  { id: 'lounge', name: 'Accesso lounge aeroportuali', group: 'Viaggi', weight: 1, detection: 'mixed', description: 'Accesso scontato o incluso alle lounge (a seconda del piano e delle condizioni di volo).', verifyHint: 'Verifica se per il tuo piano l\'accesso è incluso, scontato o legato a ritardi del volo.' },
  { id: 'virtual-cards', name: 'Carte virtuali', group: 'Protezione', weight: 1, detection: 'declared', description: 'Carte virtuali separate per acquisti online e abbonamenti: si bloccano senza toccare la carta fisica.', verifyHint: 'Controlla nell\'app quante carte virtuali puoi creare.' },
  { id: 'disposable-cards', name: 'Carte usa e getta', group: 'Protezione', weight: 1, detection: 'declared', description: 'Numero di carta che cambia dopo ogni pagamento: utile su siti poco affidabili.', verifyHint: 'Disponibilità e numero mensile variano per paese/piano.' },
  { id: 'savings', name: 'Conti deposito e salvadanai (Savings)', group: 'Gestione denaro', weight: 3, detection: 'transactions', description: 'Interessi sulla liquidità nei conti risparmio, con tasso maggiorato per i piani superiori.', verifyHint: 'Verifica il tasso attuale per il tuo paese e se è un conto Revolut o di un partner.' },
  { id: 'pockets', name: 'Pockets / spazi separati', group: 'Gestione denaro', weight: 1, detection: 'mixed', description: 'Separare il denaro per bollette, spese condivise o obiettivi.', verifyHint: 'Disponibile nella sezione Conti dell\'app.' },
  { id: 'recurring-payments', name: 'Pagamenti ricorrenti e addebiti programmati', group: 'Gestione denaro', weight: 1, detection: 'transactions', description: 'Bonifici programmati verso altri conti (es. PAC verso Trade Republic) senza doverli ricordare.', verifyHint: 'Funzione standard dell\'app.' },
  { id: 'budgeting', name: 'Budget e analisi spese', group: 'Gestione denaro', weight: 1, detection: 'declared', description: 'Budget mensili per categoria con avvisi di superamento.', verifyHint: 'Sezione Analisi/Budget dell\'app.' },
  { id: 'partner-subscriptions', name: 'Abbonamenti partner inclusi', group: 'Partner', weight: 2, detection: 'mixed', description: 'Alcuni piani includono abbonamenti a servizi partner (variano spesso): se paghi già lo stesso servizio a parte stai pagando due volte.', verifyHint: 'Controlla quali abbonamenti partner sono inclusi oggi per il tuo piano e paese.' },
  { id: 'partner-offers', name: 'Offerte e sconti partner', group: 'Partner', weight: 1, detection: 'declared', description: 'Sconti presso partner e su prenotazioni viaggio effettuate tramite l\'app.', verifyHint: 'Sezione Offerte/Vantaggi dell\'app.' },
];

export function defaultMetalConfig(): MetalPlanConfig {
  return {
    country: 'IT',
    plan: 'Metal',
    billing: 'monthly',
    monthlyFee: 0, // l'utente inserisce il prezzo reale del proprio piano
    benefits: Object.fromEntries(METAL_BENEFITS.map((b) => [b.id, 'unverified' as MetalBenefitStatus])),
    terms: {},
    declaredUsage: {},
  };
}

export interface BenefitUsage {
  benefit: MetalBenefit;
  status: MetalBenefitStatus;
  used: boolean;
  evidence: string;
  /** Valore annuo ottenuto (stima). */
  valueCaptured: number;
  /** Valore annuo aggiuntivo ottenibile (stima). */
  valuePotential: number;
  assumption: string;
}

export interface MetalReport {
  score: number | null; // null se nessun vantaggio verificato
  verifiedCount: number;
  unverifiedCount: number;
  annualFee: number;
  valueCaptured: number;
  valuePotential: number;
  netValue: number;
  usages: BenefitUsage[];
  stats: {
    cardSpend12m: number;
    foreignSpend12m: number;
    weekendFxSpend12m: number;
    atmMonthlyMax: number;
    atmFeesPaid: number;
    cashbackReceived: number;
    travelTxCount: number;
    savingsBalance: number;
    savingsInterest12m: number;
  };
}

const isCard = (t: Transaction) => t.provider === 'revolut' && t.kind === 'expense' && /card|carta/i.test(t.sourceType ?? 'CARD_PAYMENT');
/** Addebito del canone del piano (non è una commissione "inattesa"). */
export const isPlanFee = (t: Transaction) => t.provider === 'revolut' && (t.kind === 'fee' || t.kind === 'expense') && /metal|plan fee|canone|premium plan|ultra plan|plus plan|piano revolut/i.test(t.description);

const isAtm = (t: Transaction) => t.provider === 'revolut' && (/atm/i.test(t.sourceType ?? '') || /atm|prelievo|cash withdrawal/i.test(t.description));

export function metalReport(data: FinanceData, conv: Conv, asOf: string): MetalReport {
  const cfg = data.metal;
  const since = addDays(asOf, -365);
  const tx12 = data.transactions.filter((t) => t.date > since && t.date <= asOf && t.provider === 'revolut');
  const card = tx12.filter(isCard);
  const cardSpend = sum(card.map((t) => -conv(t.amount, t.currency)));
  const foreign = card.filter((t) => (t.originalCurrency && t.originalCurrency !== 'EUR') || t.currency !== 'EUR');
  const foreignSpend = sum(foreign.map((t) => -conv(t.amount, t.currency)));
  const weekendFx = sum(tx12.filter((t) => t.kind === 'fx' && [0, 6].includes(new Date(t.date + 'T00:00:00').getDay())).map((t) => Math.abs(conv(t.amount, t.currency))));
  const atm = tx12.filter(isAtm);
  const withdrawals = atm.filter((t) => t.kind !== 'fee');
  const atmByMonth = new Map<string, number>();
  for (const t of withdrawals) atmByMonth.set(t.date.slice(0, 7), (atmByMonth.get(t.date.slice(0, 7)) ?? 0) + Math.abs(conv(t.amount, t.currency)));
  const atmFees = sum(atm.map((t) => (t.kind === 'fee' ? -conv(t.amount, t.currency) : t.fee ? conv(t.fee, t.currency) : 0)));
  const cashback = sum(tx12.filter((t) => t.kind === 'cashback').map((t) => conv(t.amount, t.currency)));
  const travel = tx12.filter((t) => t.category === 'viaggi');
  const lounge = tx12.some((t) => /lounge/i.test(t.description));
  const savingsAccounts = data.accounts.filter((a) => a.provider === 'revolut' && (a.kind === 'savings' || a.kind === 'pocket'));
  const savingsBalance = sum(savingsAccounts.map((a) => conv(a.balance ?? 0, a.currency)));
  const savingsInterest = sum(tx12.filter((t) => t.kind === 'interest').map((t) => conv(t.amount, t.currency)));
  const revolutCash = sum(data.accounts.filter((a) => a.provider === 'revolut' && a.kind === 'current').map((a) => conv(a.balance ?? 0, a.currency)));
  const standingOrders = tx12.filter((t) => t.kind === 'transfer' && /standing|programmat|recurring|ricorrente/i.test(`${t.sourceType} ${t.description}`)).length;
  const subscriptionsPaid = data.transactions.filter((t) => t.provider === 'revolut' && t.category === 'abbonamenti' && t.date > since);
  const declared = cfg.declaredUsage;

  const usages: BenefitUsage[] = METAL_BENEFITS.map((benefit) => {
    const status = cfg.benefits[benefit.id] ?? 'unverified';
    let used = !!declared[benefit.id];
    let evidence = used ? 'Dichiarato da te' : 'Nessun utilizzo rilevato';
    let valueCaptured = 0;
    let valuePotential = 0;
    let assumption = '';
    switch (benefit.id) {
      case 'cashback': {
        const rate = cfg.terms.cashbackRate;
        used = cashback > 0 || used;
        evidence = cashback > 0 ? `Cashback ricevuto negli ultimi 12 mesi: ${cashback.toFixed(2)} €` : `Spesa con carta 12 mesi: ${cardSpend.toFixed(0)} €, nessun cashback rilevato`;
        valueCaptured = cashback;
        if (rate) valuePotential = Math.max(0, cardSpend * rate - cashback);
        assumption = rate ? `Tasso cashback verificato: ${(rate * 100).toFixed(2)}% sulla spesa con carta (eventuali tetti mensili non applicati).` : 'Inserisci il tasso di cashback del tuo piano per stimare il potenziale.';
        break;
      }
      case 'fx': {
        used = foreign.length > 0 || used;
        evidence = foreign.length ? `${foreign.length} pagamenti in valuta estera (${foreignSpend.toFixed(0)} €)` : 'Nessun pagamento in valuta estera';
        valueCaptured = foreignSpend * 0.015; // costo tipico evitato con carte bancarie tradizionali
        valuePotential = weekendFx * (cfg.terms.weekendFxMarkup ?? 0.01);
        assumption = 'Valore ottenuto stimato come 1,5% di ricarico medio evitato rispetto a una carta bancaria tradizionale. Potenziale = ricarico weekend evitabile cambiando nei giorni feriali.';
        break;
      }
      case 'atm': {
        const max = Math.max(0, ...atmByMonth.values());
        used = withdrawals.length > 0 || used;
        evidence = withdrawals.length ? `${withdrawals.length} prelievi, massimo mensile ${max.toFixed(0)} €, commissioni pagate ${atmFees.toFixed(2)} €` : 'Nessun prelievo rilevato';
        valueCaptured = withdrawals.length * 2; // commissione media di prelievo evitata (stima)
        valuePotential = atmFees;
        assumption = 'Stima di 2 € risparmiati per prelievo rispetto a un circuito a pagamento; il potenziale sono le commissioni oltre soglia effettivamente pagate.';
        break;
      }
      case 'travel-insurance': {
        used = travel.length > 0 || used;
        evidence = travel.length ? `${travel.length} transazioni di viaggio: la copertura ti è probabilmente utile` : 'Nessun viaggio rilevato';
        valueCaptured = travel.length ? 60 : 0;
        assumption = 'Valore stimato pari al costo di una polizza viaggio annuale base (~60 €). Vale solo se la copertura è attiva e adeguata ai tuoi viaggi.';
        break;
      }
      case 'lounge': {
        used = lounge || used;
        evidence = lounge ? 'Rilevato pagamento lounge' : travel.length ? 'Viaggi rilevati ma nessun accesso lounge' : 'Nessun viaggio rilevato';
        valuePotential = !used && travel.filter((t) => /ryanair|easyjet|wizz|ita|lufthansa|airport|aeroporto|vueling|klm/i.test(t.description)).length ? 25 : 0;
        assumption = 'Potenziale stimato su un accesso scontato/anno se voli; verifica le condizioni del tuo piano.';
        break;
      }
      case 'savings': {
        used = savingsBalance > 0 || savingsInterest > 0 || used;
        evidence = used ? `Saldo nei salvadanai: ${savingsBalance.toFixed(0)} €, interessi 12 mesi: ${savingsInterest.toFixed(2)} €` : `Liquidità sul conto corrente: ${revolutCash.toFixed(0)} € senza interessi`;
        valueCaptured = savingsInterest;
        const rate = 0.02; // ipotesi prudente, modificabile verificando il tasso reale
        const excess = Math.max(0, revolutCash - 1500);
        valuePotential = excess * rate;
        assumption = 'Potenziale: liquidità sul conto corrente oltre 1.500 € spostata in un salvadanaio con interessi al 2% annuo (ipotesi: verifica il tasso attuale, al lordo delle imposte).';
        break;
      }
      case 'recurring-payments': {
        used = standingOrders > 0 || used;
        evidence = standingOrders ? `${standingOrders} bonifici programmati rilevati` : 'Nessun bonifico programmato rilevato';
        break;
      }
      case 'partner-subscriptions': {
        evidence = used ? 'Dichiarato da te' : `Paghi ${new Set(subscriptionsPaid.map((t) => t.merchant ?? t.description)).size} abbonamenti dalla carta: verifica se qualcuno è incluso nel piano`;
        assumption = 'Controlla se uno dei tuoi abbonamenti è già incluso nei partner del piano.';
        break;
      }
      case 'pockets': {
        used = used || savingsAccounts.some((a) => a.kind === 'pocket');
        evidence = used ? 'Pocket presenti o dichiarati' : 'Nessuna pocket rilevata';
        break;
      }
    }
    if (status === 'not-available') {
      valuePotential = 0;
      valueCaptured = 0;
    }
    return { benefit, status, used, evidence, valueCaptured: round2(valueCaptured), valuePotential: round2(valuePotential), assumption };
  });

  const verified = usages.filter((u) => u.status === 'confirmed');
  const totalWeight = sum(verified.map((u) => u.benefit.weight));
  const usedWeight = sum(verified.filter((u) => u.used).map((u) => u.benefit.weight));
  const annualFee = round2(cfg.monthlyFee * 12);
  const valueCaptured = round2(sum(verified.map((u) => u.valueCaptured)));
  const valuePotential = round2(sum(verified.filter((u) => !u.used || u.valuePotential > 0).map((u) => u.valuePotential)));
  return {
    score: totalWeight ? Math.round((usedWeight / totalWeight) * 100) : null,
    verifiedCount: verified.length,
    unverifiedCount: usages.filter((u) => u.status === 'unverified').length,
    annualFee,
    valueCaptured,
    valuePotential,
    netValue: round2(valueCaptured - annualFee),
    usages,
    stats: {
      cardSpend12m: round2(cardSpend),
      foreignSpend12m: round2(foreignSpend),
      weekendFxSpend12m: round2(weekendFx),
      atmMonthlyMax: round2(Math.max(0, ...atmByMonth.values())),
      atmFeesPaid: round2(atmFees),
      cashbackReceived: round2(cashback),
      travelTxCount: travel.length,
      savingsBalance: round2(savingsBalance),
      savingsInterest12m: round2(savingsInterest),
    },
  };
}
