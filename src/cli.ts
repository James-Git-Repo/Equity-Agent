#!/usr/bin/env ts-node
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Command } from 'commander';
import Papa from 'papaparse';
import { buildFinancialSnapshot, computeDCF, computeSeriesCagr, deriveMetrics } from '../lib/calculations';
import { fetchYahooBundle } from '../lib/yahoo';
import type { YahooQuoteSummaryResponse } from '../lib/types';
import { loadIsinMap, normalizeTicker, parseInputFile, type RawInputRow } from '../utils/input';

interface InputEntry {
  input: string;
  ticker: string;
  isin?: string;
  company?: string;
  sector?: string;
}

interface OutputRow {
  Input: string;
  Ticker: string;
  ISIN?: string;
  Company?: string;
  Sector?: string;
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

function estimateWacc(beta: number | null): number {
  const baseRate = 0.02;
  const marketPremium = 0.05;
  const effectiveBeta = beta ?? 1;
  const raw = baseRate + effectiveBeta * marketPremium;
  return Math.min(Math.max(raw, 0.06), 0.14);
}

function parseRows(filePath: string | undefined, isinMap: Record<string, string>): InputEntry[] {
  if (!filePath) return [];
  const rows = parseInputFile(filePath);
  return rows.map((row, index) => resolveEntry(row, index, isinMap)).filter((entry): entry is InputEntry => entry !== null);
}

function resolveEntry(row: RawInputRow, index: number, isinMap: Record<string, string>): InputEntry | null {
  const source = row.Ticker || row.ISIN || `row_${index + 1}`;
  const rawTicker = row.Ticker ? normalizeTicker(row.Ticker) : undefined;
  const ticker = rawTicker || (row.ISIN ? isinMap[row.ISIN.toUpperCase()] : undefined);
  if (!ticker) {
    return null;
  }
  return {
    input: source,
    ticker,
    isin: row.ISIN?.toUpperCase(),
    company: row.Company,
    sector: row.Sector
  };
}

function buildOutput(
  ticker: string,
  input: string,
  data: YahooQuoteSummaryResponse | undefined,
  status: 'ok' | 'error',
  message?: string,
  meta?: { isin?: string; company?: string; sector?: string }
): OutputRow {
  if (!data || status === 'error') {
    return {
      Input: input,
      Ticker: ticker,
      ISIN: meta?.isin,
      Company: meta?.company,
      Sector: meta?.sector,
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
    ISIN: meta?.isin,
    Company: meta?.company,
    Sector: meta?.sector,
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
    .option('-i, --input <file>', 'CSV input containing Ticker or ISIN columns')
    .option('--isin-map <file>', 'CSV lookup table with columns isin,ticker', 'data/isin_map.csv')
    .option('-o, --output <file>', 'Write results to CSV file instead of stdout')
    .option('--max-qps <number>', 'Maximum Yahoo Finance requests per second', '1')
    .parse(process.argv);

  const opts = program.opts<{ input?: string; isinMap?: string; output?: string; maxQps?: string }>();
  const argTickers = (program.args as string[]).map((value) => normalizeTicker(value));

  const isinMapPath = opts.isinMap ? resolve(opts.isinMap) : resolve('data/isin_map.csv');
  const isinMap = loadIsinMap(isinMapPath);
  const entries: InputEntry[] = [];

  if (opts.input) {
    const parsed = parseRows(opts.input, isinMap);
    entries.push(...parsed);
  }

  argTickers.forEach((value) => {
    if (value) {
      entries.push({ input: value, ticker: value });
    }
  });

  if (!entries.length) {
    throw new Error('No tickers provided. Use positional arguments or --input.');
  }

  const maxQps = Number.parseFloat(opts.maxQps ?? '1');
  const results: OutputRow[] = [];

  for (const entry of entries) {
    const yahoo = await fetchYahooBundle(entry.ticker, { maxQps });
    if (yahoo.error || !yahoo.data) {
      results.push(
        buildOutput(entry.ticker, entry.input, yahoo.data, 'error', yahoo.error ?? 'Missing Yahoo data', {
          isin: entry.isin,
          company: entry.company,
          sector: entry.sector
        })
      );
      continue;
    }

    results.push(
      buildOutput(entry.ticker, entry.input, yahoo.data as YahooQuoteSummaryResponse, 'ok', undefined, {
        isin: entry.isin,
        company: entry.company,
        sector: entry.sector
      })
    );
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
