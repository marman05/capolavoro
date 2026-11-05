import type { InstrumentMeta } from './types';

/**
 * Composizioni INDICATIVE di alcuni ETF/titoli diffusi tra gli utenti Trade Republic,
 * arrotondate e da considerarsi stime (le composizioni reali cambiano ogni mese).
 * L'utente può sovrascriverle con i dati aggiornati del factsheet dell'emittente.
 */
const ASOF = '2026-09';

const WORLD_GEO = { 'Stati Uniti': 0.72, Giappone: 0.055, 'Regno Unito': 0.035, Canada: 0.03, Francia: 0.027, Svizzera: 0.024, Germania: 0.022, Altri: 0.117 };
const WORLD_SECTORS = { Tecnologia: 0.27, Finanza: 0.16, Industria: 0.11, Sanità: 0.1, 'Beni voluttuari': 0.1, Comunicazione: 0.08, 'Beni di consumo': 0.06, Energia: 0.035, Materiali: 0.03, Utility: 0.025, Immobiliare: 0.02 };
const EM_GEO = { Cina: 0.25, India: 0.2, Taiwan: 0.19, 'Corea del Sud': 0.1, Brasile: 0.045, 'Arabia Saudita': 0.04, Sudafrica: 0.03, Altri: 0.145 };
const EM_SECTORS = { Tecnologia: 0.25, Finanza: 0.23, 'Beni voluttuari': 0.12, Comunicazione: 0.09, Industria: 0.08, Materiali: 0.07, 'Beni di consumo': 0.05, Energia: 0.04, Sanità: 0.04, Altri: 0.03 };
const SP500_SECTORS = { Tecnologia: 0.33, Finanza: 0.13, Sanità: 0.1, 'Beni voluttuari': 0.1, Comunicazione: 0.1, Industria: 0.08, 'Beni di consumo': 0.055, Energia: 0.03, Utility: 0.025, Immobiliare: 0.02, Materiali: 0.02 };

export const REFERENCE_META: InstrumentMeta[] = [
  { isin: 'IE00B4L5Y983', name: 'iShares Core MSCI World UCITS ETF (Acc)', ter: 0.002, geography: WORLD_GEO, sectors: WORLD_SECTORS, source: 'reference', asOf: ASOF },
  { isin: 'IE00BK5BQT80', name: 'Vanguard FTSE All-World UCITS ETF (Acc)', ter: 0.0019, geography: { 'Stati Uniti': 0.63, Giappone: 0.055, 'Regno Unito': 0.033, Cina: 0.028, Canada: 0.027, India: 0.022, Francia: 0.022, Altri: 0.183 }, sectors: WORLD_SECTORS, source: 'reference', asOf: ASOF },
  { isin: 'IE00BKM4GZ66', name: 'iShares Core MSCI EM IMI UCITS ETF (Acc)', ter: 0.0018, geography: EM_GEO, sectors: EM_SECTORS, source: 'reference', asOf: ASOF },
  { isin: 'IE00B5BMR087', name: 'iShares Core S&P 500 UCITS ETF (Acc)', ter: 0.0007, geography: { 'Stati Uniti': 1 }, sectors: SP500_SECTORS, source: 'reference', asOf: ASOF },
  { isin: 'IE00B3XXRP09', name: 'Vanguard S&P 500 UCITS ETF (Dist)', ter: 0.0007, geography: { 'Stati Uniti': 1 }, sectors: SP500_SECTORS, source: 'reference', asOf: ASOF },
  { isin: 'IE00B53SZB19', name: 'iShares NASDAQ 100 UCITS ETF (Acc)', ter: 0.0033, geography: { 'Stati Uniti': 0.97, Altri: 0.03 }, sectors: { Tecnologia: 0.5, Comunicazione: 0.16, 'Beni voluttuari': 0.14, Sanità: 0.06, 'Beni di consumo': 0.06, Industria: 0.05, Altri: 0.03 }, source: 'reference', asOf: ASOF },
  { isin: 'IE00BFY0GT14', name: 'SPDR MSCI World UCITS ETF', ter: 0.0012, geography: WORLD_GEO, sectors: WORLD_SECTORS, source: 'reference', asOf: ASOF },
  { isin: 'LU0908500753', name: 'Amundi Core Stoxx Europe 600 UCITS ETF', ter: 0.0007, geography: { 'Regno Unito': 0.22, Francia: 0.16, Svizzera: 0.15, Germania: 0.14, 'Paesi Bassi': 0.07, Altri: 0.26 }, sectors: { Finanza: 0.2, Industria: 0.17, Sanità: 0.14, 'Beni di consumo': 0.09, Tecnologia: 0.07, 'Beni voluttuari': 0.08, Altri: 0.25 }, source: 'reference', asOf: ASOF },
  { isin: 'US0378331005', name: 'Apple Inc.', geography: { 'Stati Uniti': 1 }, sectors: { Tecnologia: 1 }, source: 'reference', asOf: ASOF },
  { isin: 'US5949181045', name: 'Microsoft Corp.', geography: { 'Stati Uniti': 1 }, sectors: { Tecnologia: 1 }, source: 'reference', asOf: ASOF },
  { isin: 'US67066G1040', name: 'NVIDIA Corp.', geography: { 'Stati Uniti': 1 }, sectors: { Tecnologia: 1 }, source: 'reference', asOf: ASOF },
  { isin: 'DE0007164600', name: 'SAP SE', geography: { Germania: 1 }, sectors: { Tecnologia: 1 }, source: 'reference', asOf: ASOF },
  { isin: 'IT0003128367', name: 'Enel S.p.A.', geography: { Italia: 1 }, sectors: { Utility: 1 }, source: 'reference', asOf: ASOF },
  { isin: 'IT0000072618', name: 'Intesa Sanpaolo', geography: { Italia: 1 }, sectors: { Finanza: 1 }, source: 'reference', asOf: ASOF },
];

export function withReferenceMeta(existing: InstrumentMeta[], isins: string[]): InstrumentMeta[] {
  const have = new Set(existing.map((m) => m.isin));
  return [...existing, ...REFERENCE_META.filter((m) => isins.includes(m.isin) && !have.has(m.isin))];
}
