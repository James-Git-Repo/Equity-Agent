import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'csv-parse/sync';

export interface RawInputRow {
  Ticker?: string;
  ISIN?: string;
  Company?: string;
  Sector?: string;
  Notes?: string;
}

export interface IsinRecord {
  isin: string;
  ticker: string;
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
  }) as IsinRecord[];
  const map: Record<string, string> = {};
  rows.forEach((row) => {
    if (row.isin && row.ticker) {
      map[row.isin.toUpperCase()] = normalizeTicker(row.ticker);
    }
  });
  return map;
}
