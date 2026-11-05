import { describe, expect, it } from 'vitest';
import Papa from 'papaparse';
import { detectConnector, matrixToInput, mergeImport } from '../src/connectors/registry';
import { parseAmount, parseDate } from '../src/connectors/parse';
import { emptyData } from '../src/domain/defaults';

const csv = (s: string) => Papa.parse<unknown[]>(s.trim(), { skipEmptyLines: true }).data;

describe('parsing numeri e date', () => {
  it('formati IT/DE/EN', () => {
    expect(parseAmount('1.234,56')).toBe(1234.56);
    expect(parseAmount('1,234.56')).toBe(1234.56);
    expect(parseAmount('-12,30 €')).toBe(-12.3);
    expect(parseAmount('1.000')).toBe(1000);
    expect(parseAmount('(45.10)')).toBe(-45.1);
    expect(parseDate('2026-03-05 10:22:01')).toBe('2026-03-05');
    expect(parseDate('05.03.2026')).toBe('2026-03-05');
    expect(parseDate('5/3/26')).toBe('2026-03-05');
    expect(parseDate('5 mar 2026')).toBe('2026-03-05');
  });
});

describe('Revolut CSV', () => {
  const file = `Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance
CARD_PAYMENT,Current,2026-10-01 12:00:00,2026-10-02 09:00:00,Esselunga,-45.20,0.00,EUR,COMPLETED,954.80
TRANSFER,Current,2026-10-03 08:00:00,2026-10-03 08:00:01,To Trade Republic,-300.00,0.00,EUR,COMPLETED,654.80
TOPUP,Current,2026-10-04 08:00:00,2026-10-04 08:00:01,Top-Up by *1234,200.00,0.00,EUR,COMPLETED,854.80
ATM,Current,2026-10-05 08:00:00,2026-10-05 08:00:01,Cash at ATM,-100.00,2.00,EUR,COMPLETED,752.80
CARD_PAYMENT,Current,2026-10-06 08:00:00,,Pending shop,-10.00,0.00,EUR,PENDING,
EXCHANGE,Current,2026-10-07 08:00:00,2026-10-07 08:00:01,Exchanged to USD,-50.00,0.00,EUR,COMPLETED,702.80`;
  it('riconosce e normalizza', () => {
    const input = matrixToInput(csv(file), 'account-statement.csv', 'csv');
    const best = detectConnector(input)[0];
    expect(best.connector.id).toBe('revolut');
    const res = best.connector.parseTabular!(input);
    expect(res.transactions).toHaveLength(5);
    expect(res.accounts[0].balance).toBe(702.8);
    expect(res.transactions.find((t) => t.description === 'Exchanged to USD')!.kind).toBe('fx');
    expect(res.transactions.find((t) => t.description === 'Cash at ATM')!.fee).toBe(2);
    expect(res.warnings.some((w) => /non completati/.test(w))).toBe(true);
  });
  it('import ripetuto non duplica', () => {
    const input = matrixToInput(csv(file), 'a.csv', 'csv');
    const res = detectConnector(input)[0].connector.parseTabular!(input);
    const once = mergeImport(emptyData(), res);
    const twice = mergeImport(once, res);
    expect(twice.transactions).toHaveLength(once.transactions.length);
  });
});

describe('Trade Republic CSV', () => {
  const file = `Datum;Typ;Beschreibung;ISIN;Stück;Kurs;Gebühren;Steuern;Betrag;Währung
02.10.2026;Sparplan;iShares Core MSCI World;IE00B4L5Y983;2,5;100,00;0;0;-250,00;EUR
03.10.2026;Kauf;NVIDIA Corp.;US67066G1040;3;150,00;1,00;0;-451,00;EUR
10.10.2026;Verkauf;NVIDIA Corp.;US67066G1040;1;170,00;1,00;5,20;169,00;EUR
15.10.2026;Dividende;Apple Inc.;US0378331005;;;;0,10;0,62;EUR
01.10.2026;Zinsen;Zinszahlung;;;;;;4,10;EUR
03.10.2026;Einzahlung;Einzahlung;;;;;;300,00;EUR`;
  it('riconosce, classifica e calcola le posizioni', () => {
    const matrix = Papa.parse<unknown[]>(file, { skipEmptyLines: true, delimiter: '' }).data;
    const input = matrixToInput(matrix, 'transaktionsexport.csv', 'csv');
    const best = detectConnector(input)[0];
    expect(best.connector.id).toBe('traderepublic');
    const res = best.connector.parseTabular!(input);
    const kinds = res.transactions.map((t) => t.kind);
    expect(kinds).toContain('investment-buy');
    expect(kinds).toContain('investment-sell');
    expect(kinds).toContain('dividend');
    expect(kinds).toContain('interest');
    expect(kinds).toContain('transfer');
    expect(kinds).toContain('tax');
    const nvda = res.holdings.find((h) => h.isin === 'US67066G1040')!;
    expect(nvda.quantity).toBe(2);
    expect(nvda.avgCost).toBeCloseTo(451 / 3, 4);
    expect(nvda.lastPrice).toBeUndefined();
  });
  it('bonifico Revolut → Trade Republic riconciliato come trasferimento', () => {
    const rv = matrixToInput(csv(`Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance
TRANSFER,Current,2026-10-02 08:00:00,2026-10-02 08:00:01,Mario Rossi,-300.00,0.00,EUR,COMPLETED,100`), 'r.csv', 'csv');
    const tr = matrixToInput(Papa.parse<unknown[]>(file, { skipEmptyLines: true, delimiter: '' }).data, 'transaktionsexport.csv', 'csv');
    let d = mergeImport(emptyData(), detectConnector(rv)[0].connector.parseTabular!(rv));
    d = mergeImport(d, detectConnector(tr)[0].connector.parseTabular!(tr));
    expect(d.transactions.find((t) => t.provider === 'revolut')!.kind).toBe('transfer');
  });
});
