import type { CurrencyCode, Settings } from './types';

/**
 * Converte un importo nella valuta base. `fxRates` è espresso come "1 EUR = x valuta"
 * (stesso formato dei tassi di riferimento BCE). Se la base non è EUR si passa da EUR.
 */
export function convert(amount: number, from: CurrencyCode, to: CurrencyCode, rates: Settings['fxRates']): number {
  if (from === to) return amount;
  const rFrom = from === 'EUR' ? 1 : rates[from];
  const rTo = to === 'EUR' ? 1 : rates[to];
  if (!rFrom || !rTo) return NaN; // tasso mancante: meglio NaN visibile che un numero sbagliato
  return (amount / rFrom) * rTo;
}

export function makeConverter(settings: Settings) {
  return (amount: number, from: CurrencyCode) => {
    const v = convert(amount, from, settings.baseCurrency, settings.fxRates);
    return Number.isNaN(v) ? 0 : v;
  };
}

export function missingRates(currencies: CurrencyCode[], settings: Settings): CurrencyCode[] {
  return [...new Set(currencies)].filter(
    (c) => c !== 'EUR' && c !== settings.baseCurrency && !settings.fxRates[c],
  ).concat(settings.baseCurrency !== 'EUR' && !settings.fxRates[settings.baseCurrency] ? [settings.baseCurrency] : []);
}

export const SUPPORTED_CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'CAD', 'AUD'];
