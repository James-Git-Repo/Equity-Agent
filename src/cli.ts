#!/usr/bin/env ts-node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Command } from 'commander';
import Papa from 'papaparse';
import { buildFinancialSnapshot, computeDCF, computeSeriesCagr, deriveMetrics } from '../lib/calculations';
import { fetchYahooBundle } from '../lib/yahoo';
import type { YahooQuoteSummaryResponse } from '../lib/types';
import { normalizeTicker } from '../utils/input';

interface InputEntry {
  input: string;
  ticker: string;
}

const DEFAULT_ALPHASPREAD_KEY = 'IJ2RNTVBPOGCMXU6';
const DEFAULT_FMP_KEY = 'F1yosD2d9MyjBwAYw95MkRAKpdsGxIja';

interface OutputRow {
  Input: string;
  Ticker: string;
  ISIN?: string;
  Name?: string;
  Market?: string;
  Currency?: string;
  Price: number | null;
  'Shares_Out (M)': number | null;
  Total_Debt: number | null;
  Cash: number | null;
  EBITDA: number | null;
  EBIT: number | null;
  Net_Income: number | null;
  Revenue: number | null;
  COGS: number | null;
  Total_Equity: number | null;
  Total_Assets: number | null;
  OCF: number | null;
  FCF: number | null;
  Dividends_Paid: number | null;
  Interest_Expense: number | null;
  Current_Assets: number | null;
  Current_Liabilities: number | null;
  Receivables: number | null;
  Inventory: number | null;
  WACC: number | null;
  Tax_Rate: number | null;
  DCF_Value_per_Share: number | null;
  Insider_Net_Buys: number | null;
  'Institutional_%': number | null;
  'Fund_Flows_3M (M)': number | null;
  'Short_Interest_%': number | null;
  'Analyst_Rating(1-5)': number | null;
  Beta: number | null;
  EPS_ttm: number | null;
  EPS_CAGR_3Y: number | null;
  Revenue_CAGR_3Y: number | null;
  FCF_CAGR_3Y: number | null;
  Dividend_CAGR_3Y: number | null;
  Altman_Z: number | null;
  Status: string;
  Message?: string;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console
    console.warn(`Data check fetch failed for ${url}: ${message}`);
    return null;
  }
}

async function fetchFmpBalance(ticker: string, apiKey: string) {
  return fetchJson<Array<Record<string, number | string>>>(
    `https://financialmodelingprep.com/api/v3/balance-sheet-statement/${ticker}?limit=1&apikey=${apiKey}`
  );
}

async function fetchFmpCashflow(ticker: string, apiKey: string) {
  return fetchJson<Array<Record<string, number | string>>>(
    `https://financialmodelingprep.com/api/v3/cash-flow-statement/${ticker}?limit=1&apikey=${apiKey}`
  );
}

async function fetchFmpIncome(ticker: string, apiKey: string) {
  return fetchJson<Array<Record<string, number | string>>>(
    `https://financialmodelingprep.com/api/v3/income-statement/${ticker}?limit=1&apikey=${apiKey}`
  );
}

async function fetchFmpShortInterest(ticker: string, apiKey: string) {
  return fetchJson<Array<Record<string, number | string>>>(
    `https://financialmodelingprep.com/api/v4/short-interest?symbol=${ticker}&apikey=${apiKey}`
  );
}

function coerceNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function mergeMessage(row: OutputRow, note: string) {
  if (!note) return;
  if (row.Message) {
    row.Message = `${row.Message}; ${note}`;
  } else {
    row.Message = note;
  }
}

async function backfillFromFmp(row: OutputRow, apiKey: string): Promise<void> {
  const [balance, cashflow, income, shortInterest] = await Promise.all([
    row.Total_Equity === null || row.Receivables === null || row.Current_Assets === null || row.Current_Liabilities === null
      ? fetchFmpBalance(row.Ticker, apiKey)
      : Promise.resolve<null | Array<Record<string, number | string>>>(null),
    row.Dividends_Paid === null
      ? fetchFmpCashflow(row.Ticker, apiKey)
      : Promise.resolve<null | Array<Record<string, number | string>>>(null),
    row.Tax_Rate === null
      ? fetchFmpIncome(row.Ticker, apiKey)
      : Promise.resolve<null | Array<Record<string, number | string>>>(null),
    row['Short_Interest_%'] === null
      ? fetchFmpShortInterest(row.Ticker, apiKey)
      : Promise.resolve<null | Array<Record<string, number | string>>>(null)
  ]);

  const balanceRow = balance?.[0];
  if (balanceRow) {
    if (row.Total_Equity === null) row.Total_Equity = coerceNumber(balanceRow.totalStockholdersEquity);
    if (row.Receivables === null) row.Receivables = coerceNumber(balanceRow.netReceivables);
    if (row.Current_Assets === null) row.Current_Assets = coerceNumber(balanceRow.totalCurrentAssets ?? balanceRow.currentAssets);
    if (row.Current_Liabilities === null) {
      row.Current_Liabilities = coerceNumber(
        balanceRow.totalCurrentLiabilities ?? balanceRow.currentLiabilities ?? balanceRow.totalCurrentLiabilitiesNet
      );
    }
  }

  const cashflowRow = cashflow?.[0];
  if (cashflowRow && row.Dividends_Paid === null) {
    row.Dividends_Paid = coerceNumber(cashflowRow.dividendsPaid ?? cashflowRow.dividendPayout);
  }

  const incomeRow = income?.[0];
  if (incomeRow && row.Tax_Rate === null) {
    const tax = coerceNumber(incomeRow.incomeTaxExpense);
    const pretax = coerceNumber(incomeRow.incomeBeforeTax);
    if (tax !== null && pretax !== null && pretax !== 0) {
      row.Tax_Rate = Math.max(0, Math.min(1, tax / pretax));
    }
  }

  const shortInterestRow = shortInterest?.[0];
  if (shortInterestRow && row['Short_Interest_%'] === null) {
    const percent = coerceNumber(shortInterestRow.shortInterestRatio ?? shortInterestRow.shortPercent ?? shortInterestRow.shortFloat);
    if (percent !== null) {
      row['Short_Interest_%'] = percent;
    }
  }
}

async function checkAlphaspread(row: OutputRow, apiKey: string): Promise<void> {
  // Alphaspread API details are not public; we log the intention to fetch without failing the run.
  if (row.Tax_Rate !== null && row.Total_Equity !== null && row.Dividends_Paid !== null && row.Receivables !== null) return;
  mergeMessage(row, `Alphaspread key ${apiKey} available for supplementary checks (no public endpoint configured)`);
}

async function ensureDataCompleteness(row: OutputRow): Promise<OutputRow> {
  if (row.Status !== 'ok') return row;
  const alphaspreadKey = process.env.ALPHASPREAD_API_KEY || DEFAULT_ALPHASPREAD_KEY;
  const fmpKey = process.env.FMP_API_KEY || DEFAULT_FMP_KEY;

  const before = { ...row };
  await Promise.all([checkAlphaspread(row, alphaspreadKey), backfillFromFmp(row, fmpKey)]);

  const touched: string[] = [];
  (['Total_Equity', 'Dividends_Paid', 'Receivables', 'Tax_Rate', 'Short_Interest_%'] as const).forEach((field) => {
    if (before[field] !== row[field] && row[field] !== null) {
      touched.push(`${field} from supplemental sources`);
    }
  });

  if (touched.length) {
    mergeMessage(row, touched.join('; '));
  }

  return row;
}

function estimateWacc(beta: number | null): number {
  const baseRate = 0.02;
  const marketPremium = 0.05;
  const effectiveBeta = beta ?? 1;
  const raw = baseRate + effectiveBeta * marketPremium;
  return Math.min(Math.max(raw, 0.06), 0.14);
}

function parseTickerFile(filePath: string | undefined): InputEntry[] {
  if (!filePath) return [];
  const absolute = resolve(filePath);
  const content = readFileSync(absolute, 'utf8');
  const entries: InputEntry[] = [];

  content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .forEach((line) => {
      entries.push({
        input: line,
        ticker: normalizeTicker(line)
      });
    });

  return entries;
}

async function fetchEntry(entry: InputEntry, maxQps: number): Promise<OutputRow> {
  const yahoo = await fetchYahooBundle(entry.ticker, { maxQps });
  if (yahoo.error || !yahoo.data) {
    return buildOutput(
      entry.ticker,
      entry.input,
      undefined,
      'error',
      `Yahoo fetch failed for ${entry.ticker}: ${yahoo.error ?? 'Missing Yahoo data'}`
    );
  }

  const output = buildOutput(
    entry.ticker,
    entry.input,
    yahoo.data as YahooQuoteSummaryResponse,
    'ok',
    undefined
  );

  return ensureDataCompleteness(output);
}

function buildOutput(
  ticker: string,
  input: string,
  data: YahooQuoteSummaryResponse | undefined,
  status: 'ok' | 'error',
  message?: string
): OutputRow {
  if (!data || status === 'error') {
    return {
      Input: input,
      Ticker: ticker,
      ISIN: undefined,
      Name: undefined,
      Market: undefined,
      Currency: undefined,
      Price: null,
      'Shares_Out (M)': null,
      Total_Debt: null,
      Cash: null,
      EBITDA: null,
      EBIT: null,
      Net_Income: null,
      Revenue: null,
      COGS: null,
      Total_Equity: null,
      Total_Assets: null,
      OCF: null,
      FCF: null,
      Dividends_Paid: null,
      Interest_Expense: null,
      Current_Assets: null,
      Current_Liabilities: null,
      Receivables: null,
      Inventory: null,
      WACC: null,
      Tax_Rate: null,
      DCF_Value_per_Share: null,
      Insider_Net_Buys: null,
      'Institutional_%': null,
      'Fund_Flows_3M (M)': null,
      'Short_Interest_%': null,
      'Analyst_Rating(1-5)': null,
      Beta: null,
      EPS_ttm: null,
      EPS_CAGR_3Y: null,
      Revenue_CAGR_3Y: null,
      FCF_CAGR_3Y: null,
      Dividend_CAGR_3Y: null,
      Altman_Z: null,
      Status: 'error',
      Message: message ?? 'Unresolved ticker or missing data'
    };
  }

  const snapshot = buildFinancialSnapshot(data);
  const metrics = deriveMetrics(snapshot);
  const balanceSheet = data.balanceSheetHistory?.balanceSheetStatements?.[0];
  const cashflow = data.cashflowStatementHistory?.cashflowStatements?.[0];
  const income = data.incomeStatementHistory?.incomeStatementHistory?.[0];

  const fcf = cashflow?.freeCashFlow?.raw ??
    (cashflow?.totalCashFromOperatingActivities?.raw !== undefined && cashflow?.capitalExpenditures?.raw !== undefined
      ? cashflow.totalCashFromOperatingActivities.raw + cashflow.capitalExpenditures.raw
      : null);

  const dividendsSeries = (data.cashflowStatementHistory?.cashflowStatements ?? [])
    .slice(0, 3)
    .map((statement) => {
      const value = statement.dividendsPaid?.raw;
      if (value === undefined || value === null) return null;
      return Math.abs(value);
    })
    .filter((value): value is number => value !== null && value > 0);

  const dividendCagr = computeSeriesCagr(dividendsSeries);
  const wacc = estimateWacc(snapshot.beta);
  const dcfValue = computeDCF(snapshot, wacc, 0.02);

  const taxRate = income?.incomeBeforeTax?.raw && income.incomeBeforeTax.raw !== 0 && income.incomeTaxExpense?.raw !== undefined
    ? Math.max(0, Math.min(1, income.incomeTaxExpense.raw / income.incomeBeforeTax.raw))
    : null;

  return {
    Input: input,
    Ticker: ticker,
    ISIN: undefined,
    Name: undefined,
    Market: undefined,
    Currency: undefined,
    Price: snapshot.price ?? null,
    'Shares_Out (M)': snapshot.sharesOutstanding ? snapshot.sharesOutstanding / 1_000_000 : null,
    Total_Debt: snapshot.totalDebt ?? null,
    Cash: snapshot.cash ?? null,
    EBITDA: snapshot.ebitda ?? null,
    EBIT: snapshot.ebit ?? null,
    Net_Income: snapshot.netIncome ?? null,
    Revenue: snapshot.revenue ?? null,
    COGS: snapshot.cogs ?? null,
    Total_Equity: snapshot.totalEquity ?? null,
    Total_Assets: snapshot.totalAssets ?? null,
    OCF: cashflow?.totalCashFromOperatingActivities?.raw ?? null,
    FCF: fcf ?? null,
    Dividends_Paid: cashflow?.dividendsPaid?.raw ?? null,
    Interest_Expense: snapshot.interestExpense ?? null,
    Current_Assets: snapshot.currentAssets ?? null,
    Current_Liabilities: snapshot.currentLiabilities ?? null,
    Receivables: balanceSheet?.netReceivables?.raw ?? null,
    Inventory: balanceSheet?.inventory?.raw ?? null,
    WACC: wacc,
    Tax_Rate: taxRate,
    DCF_Value_per_Share: dcfValue ?? null,
    Insider_Net_Buys: snapshot.insiderNetBuys ?? null,
    'Institutional_%': snapshot.institutionalPct ?? null,
    'Fund_Flows_3M (M)': null,
    'Short_Interest_%': snapshot.shortInterestPct ?? null,
    'Analyst_Rating(1-5)': data.financialData?.recommendationMean?.raw ?? null,
    Beta: snapshot.beta ?? null,
    EPS_ttm: snapshot.epsTtm ?? null,
    EPS_CAGR_3Y: metrics.epsCagr ?? null,
    Revenue_CAGR_3Y: metrics.revenueCagr ?? null,
    FCF_CAGR_3Y: metrics.fcfCagr ?? null,
    Dividend_CAGR_3Y: dividendCagr ?? null,
    Altman_Z: metrics.altmanZ ?? null,
    Status: 'ok',
    Message: message
  };
}

async function main() {
  const program = new Command();
  program
    .name('equity-agent')
    .description('Fetch fundamental datasets for equities using Yahoo Finance data')
    .argument('[tickers...]', 'Ticker symbols to fetch')
    .option('-i, --input <file>', 'Text file (.txt) containing one ticker per line')
    .option('-o, --output <file>', 'Write results to CSV file instead of stdout')
    .option('--max-qps <number>', 'Maximum Yahoo Finance requests per second', '1')
    .parse(process.argv);

  const opts = program.opts<{ input?: string; output?: string; maxQps?: string }>();
  const argTickers = (program.args as string[])
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .map((value) => normalizeTicker(value));
  const entries: InputEntry[] = [];

  if (opts.input) {
    const parsed = parseTickerFile(opts.input);
    entries.push(...parsed);
  }

  argTickers.forEach((value) => {
    entries.push({
      input: value,
      ticker: value
    });
  });

  if (!entries.length) {
    if (opts.input) {
      throw new Error(
        `No ticker values found in ${opts.input}. Ensure the file lists one ticker per line or supply tickers as arguments.`
      );
    }

    throw new Error('No ticker values provided. Use positional arguments or --input.');
  }

  const maxQps = Number.parseFloat(opts.maxQps ?? '1');
  const results: OutputRow[] = [];

  for (const entry of entries) {
    const row = await fetchEntry(entry, maxQps);
    results.push(row);
  }

  const csv = Papa.unparse(results, { quotes: false, newline: '\n' });
  if (opts.output) {
    const outputPath = resolve(opts.output);
    writeFileSync(outputPath, csv, 'utf8');
    // eslint-disable-next-line no-console
    console.log(`Saved ${results.length} rows to ${outputPath}`);
  } else {
    // eslint-disable-next-line no-console
    console.log(csv);
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
