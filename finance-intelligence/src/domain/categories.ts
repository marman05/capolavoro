import type { SpendingCategory, Transaction } from './types';

export const CATEGORY_META: Record<SpendingCategory, { label: string; color: string; icon: string }> = {
  alimentari: { label: 'Alimentari', color: '#199e70', icon: 'ShoppingBasket' },
  ristoranti: { label: 'Ristoranti', color: '#d95926', icon: 'UtensilsCrossed' },
  trasporti: { label: 'Trasporti', color: '#3987e5', icon: 'Car' },
  viaggi: { label: 'Viaggi', color: '#9085e9', icon: 'Plane' },
  shopping: { label: 'Shopping', color: '#d55181', icon: 'ShoppingBag' },
  abbonamenti: { label: 'Abbonamenti', color: '#c98500', icon: 'Repeat' },
  casa: { label: 'Casa', color: '#008300', icon: 'Home' },
  salute: { label: 'Salute', color: '#e66767', icon: 'HeartPulse' },
  intrattenimento: { label: 'Intrattenimento', color: '#a3a29a', icon: 'Clapperboard' },
  altro: { label: 'Altro', color: '#5f5e59', icon: 'CircleDashed' },
};

/**
 * Regole di categorizzazione basate su parole chiave del merchant/descrizione.
 * Ordine rilevante: la prima regola che corrisponde vince. L'utente può sempre
 * correggere la categoria (categoryLocked) e la correzione viene riapplicata
 * ai movimenti futuri dello stesso merchant.
 */
const RULES: [SpendingCategory, RegExp][] = [
  ['abbonamenti', /netflix|spotify|disney\+?|prime video|amazon prime|apple\.com\/bill|icloud|youtube premium|dazn|now tv|chatgpt|openai|claude\.ai|anthropic|adobe|microsoft 365|xbox|playstation plus|audible|patreon|linkedin premium|duolingo|google one|dropbox|notion/i],
  ['alimentari', /esselunga|coop|conad|carrefour|lidl|aldi|eurospin|pam |penny|despar|iper|bennet|unes|tigros|naturasi|supermerc|market|alimentari|panificio|macelleria|rewe|edeka|tesco|mercadona/i],
  ['ristoranti', /ristorante|trattoria|pizzeria|osteria|bar |caff[eè]|starbucks|mcdonald|burger king|kfc|sushi|deliveroo|glovo|just ?eat|uber ?eats|poke|bistrot|pub |gelateria|pasticceria|wolt/i],
  ['trasporti', /trenitalia|italo|atm milano|atac|gtt|uber(?! ?eats)|bolt|free ?now|taxi|eni|q8|ip |tamoil|esso|shell|benzina|carburante|autostrad|telepass|parcheggio|easypark|mytaxi|car2go|share ?now|enjoy|lime|tier|dott|flixbus/i],
  ['viaggi', /ryanair|easyjet|wizz|ita airways|alitalia|lufthansa|booking\.com|airbnb|expedia|hotel|hostel|trainline|skyscanner|edreams|vueling|klm|air france|aeroporto|airport|lounge/i],
  ['salute', /farmacia|pharma|parafarmacia|ospedale|clinica|dentist|medic|ottica|analisi|laborator|fisioterap|asl/i],
  ['casa', /ikea|leroy merlin|brico|enel|a2a|hera|iren|edison|acea|sorgenia|plenitude|fastweb|tim |vodafone|wind ?tre|iliad|condominio|affitto|mutuo|assicurazione casa|amazon home/i],
  ['intrattenimento', /cinema|uci|the space|teatro|concert|ticketone|ticketmaster|steam|nintendo|epic games|museo|bowling|palestra|gym|virgin active|mcfit|sport|decathlon/i],
  ['shopping', /mediaworld|unieuro|euronics|amazon|zalando|zara|h&m|uniqlo|primark|nike|adidas|apple store|shein|vinted|ebay|asos|sephora|douglas|lush|mango|pull ?& ?bear|bershka|coin |la rinascente/i],
];

export function categorize(text: string): SpendingCategory {
  for (const [cat, re] of RULES) if (re.test(text)) return cat;
  return 'altro';
}

export function normalizeMerchant(description: string): string {
  return description
    .replace(/\s+/g, ' ')
    .replace(/\*.*$/, '')
    .replace(/\b(pos|carta|card|payment|pagamento|to|da)\b/gi, '')
    .replace(/\d{4,}/g, '')
    .trim()
    .toLowerCase();
}

/** Applica categorie e override appresi dall'utente (merchant → categoria). */
export function applyCategories(txs: Transaction[]): Transaction[] {
  const learned = new Map<string, SpendingCategory>();
  for (const t of txs) if (t.categoryLocked && t.category) learned.set(normalizeMerchant(t.merchant ?? t.description), t.category);
  return txs.map((t) => {
    if (t.kind !== 'expense' && t.kind !== 'refund') return t;
    if (t.categoryLocked) return t;
    const key = normalizeMerchant(t.merchant ?? t.description);
    return { ...t, category: learned.get(key) ?? categorize(`${t.merchant ?? ''} ${t.description}`) };
  });
}
