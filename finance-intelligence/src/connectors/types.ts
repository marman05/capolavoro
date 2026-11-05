import type { Account, DataOrigin, Holding, ProviderId, SavingsPlan, Transaction } from '../domain/types';
import type { Row } from './parse';

/** Risultato normalizzato di un import o di una sincronizzazione. */
export interface ImportResult {
  provider: ProviderId;
  accounts: Account[];
  transactions: Transaction[];
  holdings: Holding[];
  savingsPlans?: SavingsPlan[];
  warnings: string[];
  /** Holdings calcolate dalle transazioni (true) o riportate da un estratto posizioni (false). */
  holdingsDerived?: boolean;
}

export interface TabularInput {
  headers: string[];
  rows: Row[];
  fileName: string;
  origin: Extract<DataOrigin, 'csv' | 'excel'>;
}

export interface TextInput {
  text: string;
  fileName: string;
}

/**
 * Contratto di un connettore. Aggiungere una nuova fonte (es. un'altra banca o un broker)
 * significa implementare questa interfaccia e registrarla in `registry.ts`.
 */
export interface SourceConnector {
  id: string;
  provider: ProviderId;
  label: string;
  description: string;
  /** Capacità reali, mostrate in UI per trasparenza. */
  capabilities: {
    openBanking?: { aggregator: 'enablebanking'; aspspName: string; country: string; covers: string };
    fileImport: ('csv' | 'excel' | 'pdf')[];
  };
  /** Restituisce un punteggio 0..1 di quanto il file sembra di questo formato. */
  detectTabular?(input: TabularInput): number;
  parseTabular?(input: TabularInput): ImportResult;
  detectText?(input: TextInput): number;
  parseText?(input: TextInput): ImportResult;
  instructions: string[];
}
