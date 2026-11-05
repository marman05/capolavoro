import type { Goal } from '../domain/types';
import type { Analysis } from './index';

export function goalCurrent(g: Goal, a: Analysis): number {
  switch (g.linkedTo) {
    case 'cash':
      return a.netWorth.cash;
    case 'investments':
      return a.netWorth.investments;
    case 'networth':
      return a.netWorth.total;
    default:
      return g.current ?? 0;
  }
}
