import Papa from 'papaparse';

/** Legge CSV/TSV in una matrice di celle (separatore rilevato automaticamente). */
export async function readCsv(file: File): Promise<unknown[][]> {
  const text = await file.text();
  const res = Papa.parse<unknown[]>(text.replace(/^﻿/, ''), { skipEmptyLines: true, delimiter: '' });
  return res.data;
}

/** Excel (.xlsx) letto nel browser: il file non lascia mai il dispositivo. */
export async function readExcel(file: File): Promise<unknown[][]> {
  const { readSheet } = await import('read-excel-file/browser');
  const rows = await readSheet(file);
  return rows as unknown[][];
}

/** Estrae il testo da un PDF ricostruendo le righe in base alla coordinata verticale. */
export async function readPdfText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const lines: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const rows = new Map<number, { x: number; s: string }[]>();
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const y = Math.round(item.transform[5] / 2) * 2;
      (rows.get(y) ?? rows.set(y, []).get(y)!).push({ x: item.transform[4], s: item.str });
    }
    [...rows.entries()]
      .sort((a, b) => b[0] - a[0])
      .forEach(([, items]) => lines.push(items.sort((a, b) => a.x - b.x).map((i) => i.s).join('  ')));
  }
  return lines.join('\n');
}

export function fileFormat(file: File): 'csv' | 'excel' | 'pdf' | null {
  const n = file.name.toLowerCase();
  if (n.endsWith('.csv') || n.endsWith('.tsv') || n.endsWith('.txt')) return 'csv';
  if (n.endsWith('.xlsx') || n.endsWith('.xlsm')) return 'excel';
  if (n.endsWith('.pdf')) return 'pdf';
  return null;
}
