import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'csv-parse/sync';

export interface RawInputRow {
  Name?: string;
  ISIN?: string;
  Symbol?: string;
  Market?: string;
  Currency?: string;
}

export function normalizeTicker(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, '');
}

export function parseInputFile(filePath: string): RawInputRow[] {
  const absolute = resolve(filePath);
  const text = readFileSync(absolute, 'utf8');
  return parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  }) as RawInputRow[];
}

export function loadIsinMap(filePath: string): Record<string, string> {
  const absolute = resolve(filePath);
  const text = readFileSync(absolute, 'utf8');
  const rows = parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  }) as Record<string, string>[];
  const map: Record<string, string> = {};
  rows.forEach((row) => {
    const isinValue = row.ISIN ?? row.isin ?? row.Isin;
    const tickerValue = row.ticker ?? row.Ticker ?? row.symbol ?? row.Symbol;
    if (isinValue && tickerValue) {
      map[isinValue.toUpperCase()] = normalizeTicker(tickerValue);
    }
  });
  return map;
}
