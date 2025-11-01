import Papa from 'papaparse';
import type { InputRow } from '../lib/types';
import { read, utils } from 'xlsx';

export function normalizeTicker(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, '');
}

export async function parseInput(formData: FormData): Promise<InputRow[]> {
  const entries: InputRow[] = [];
  const manual = (formData.get('tickers') as string | null) ?? '';
  const manualLines = manual
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  manualLines.forEach((line, index) => {
    entries.push({ input: line, ticker: normalizeTicker(line), inputRank: entries.length + 1 });
  });

  const file = formData.get('file') as File | null;
  if (file && file.size > 0) {
    const buffer = await file.arrayBuffer();
    if (file.name.endsWith('.csv')) {
      const text = new TextDecoder('utf-8').decode(buffer);
      const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
      parsed.data.forEach((row) => {
        const ticker = row.Ticker ? normalizeTicker(row.Ticker) : row.ISIN ? normalizeTicker(row.ISIN) : undefined;
        entries.push({
          input: row.Ticker ?? row.ISIN ?? '',
          ticker,
          isin: row.ISIN?.trim(),
          notes: row.Notes?.trim(),
          inputRank: entries.length + 1
        });
      });
    } else {
      const workbook = read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = utils.sheet_to_json<Record<string, string>>(sheet, { defval: '' });
      rows.forEach((row) => {
        const ticker = row.Ticker ? normalizeTicker(row.Ticker) : row.ISIN ? normalizeTicker(row.ISIN) : undefined;
        entries.push({
          input: row.Ticker ?? row.ISIN ?? '',
          ticker,
          isin: row.ISIN?.trim(),
          notes: row.Notes?.trim(),
          inputRank: entries.length + 1
        });
      });
    }
  }

  return entries;
}
