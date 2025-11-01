#!/usr/bin/env ts-node
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Command } from 'commander';
import Papa from 'papaparse';
import yahooFinance from 'yahoo-finance2';
import { buildFinancialSnapshot, computeDCF, computeSeriesCagr, deriveMetrics } from '../lib/calculations';
import { fetchYahooBundle } from '../lib/yahoo';
import type { YahooQuoteSummaryResponse } from '../lib/types';
import { loadIsinMap, normalizeTicker, parseInputFile, type RawInputRow } from '../utils/input';

type LookupKind = 'isin' | 'symbol' | 'name';

interface LookupCandidate {
  type: LookupKind;
  value: string;
}

interface InputEntry {
  input: string;
  lookups: LookupCandidate[];
  meta: {
    isin?: string;
    symbol?: string;
    name?: string;
    market?: string;
    currency?: string;
  };
}

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

function estimateWacc(beta: number | null): number {
  const baseRate = 0.02;
  const marketPremium = 0.05;
  const effectiveBeta = beta ?? 1;
  const raw = baseRate + effectiveBeta * marketPremium;
  return Math.min(Math.max(raw, 0.06), 0.14);
}

function parseRows(filePath: string | undefined): InputEntry[] {
  if (!filePath) return [];
  const rows = parseInputFile(filePath);
  return rows
    .map((row, index) => resolveEntry(row, index))
    .filter((entry): entry is InputEntry => entry !== null);
}

function resolveEntry(row: RawInputRow, index: number): InputEntry | null {
  const candidates: LookupCandidate[] = [];
  const meta: InputEntry['meta'] = {};

  const isin = row.ISIN?.trim();
  if (isin) {
    const normalizedIsin = isin.toUpperCase();
    candidates.push({ type: 'isin', value: normalizedIsin });
    meta.isin = normalizedIsin;
  }

  if (row.Symbol) {
    const normalizedSymbol = normalizeTicker(row.Symbol);
    candidates.push({ type: 'symbol', value: normalizedSymbol });
    meta.symbol = normalizedSymbol;
  }

  if (row.Name) {
    const trimmedName = row.Name.trim();
    if (trimmedName) {
      candidates.push({ type: 'name', value: trimmedName });
      meta.name = trimmedName;
    }
  }

  if (row.Market) {
    const trimmedMarket = row.Market.trim();
    if (trimmedMarket) {
      meta.market = trimmedMarket;
    }
  }

  if (row.Currency) {
    const trimmedCurrency = row.Currency.trim();
    if (trimmedCurrency) {
      meta.currency = trimmedCurrency;
    }
  }

  if (!candidates.length) {
    return null;
  }

  const input = meta.isin ?? meta.symbol ?? meta.name ?? `row_${index + 1}`;

  return {
    input,
    lookups: candidates,
    meta
  };
}

function quoteHasSymbol(quote: unknown): quote is { symbol: string } {
  return (
    typeof quote === 'object' &&
    quote !== null &&
    'symbol' in quote &&
    typeof (quote as { symbol?: unknown }).symbol === 'string'
  );
}

async function lookupTickerByName(name: string): Promise<string | undefined> {
  if (!name) return undefined;
  try {
    const result = await yahooFinance.search(name, { quotesCount: 5, newsCount: 0 });
    const quotes = Array.isArray(result.quotes) ? result.quotes : [];
    for (const quote of quotes) {
      if (quoteHasSymbol(quote) && !quote.symbol.includes('=')) {
        return normalizeTicker(quote.symbol);
      }
    }
    return undefined;
  } catch (error) {
    return undefined;
  }
}

async function fetchWithFallback(entry: InputEntry, maxQps: number, isinMap: Record<string, string>): Promise<OutputRow> {
  const attemptNotes: string[] = [];
  let lastTicker: string | undefined;

  for (const lookup of entry.lookups) {
    let candidateTicker: string | undefined;
    if (lookup.type === 'isin') {
      candidateTicker = isinMap[lookup.value];
      if (!candidateTicker) {
        attemptNotes.push(`ISIN ${lookup.value} not present in lookup table`);
        continue;
      }
    } else if (lookup.type === 'symbol') {
      candidateTicker = lookup.value;
    } else if (lookup.type === 'name') {
      candidateTicker = await lookupTickerByName(lookup.value);
      if (!candidateTicker) {
        attemptNotes.push(`Name search returned no ticker for "${lookup.value}"`);
        continue;
      }
    }

    if (!candidateTicker) {
      continue;
    }

    lastTicker = candidateTicker;
    const yahoo = await fetchYahooBundle(candidateTicker, { maxQps });
    if (yahoo.error || !yahoo.data) {
      attemptNotes.push(
        `Yahoo fetch failed for ${candidateTicker} (from ${lookup.type.toUpperCase()} ${lookup.value}): ${
          yahoo.error ?? 'Missing Yahoo data'
        }`
      );
      continue;
    }

    return buildOutput(
      candidateTicker,
      entry.input,
      yahoo.data as YahooQuoteSummaryResponse,
      'ok',
      undefined,
      {
        isin: entry.meta.isin,
        name: entry.meta.name,
        market: entry.meta.market,
        currency: entry.meta.currency
      }
    );
  }

  const fallbackTicker = lastTicker ?? entry.meta.symbol ?? entry.meta.isin ?? entry.input;
  const message = attemptNotes.length ? attemptNotes.join(' | ') : 'Unresolved ticker or missing data';

  return buildOutput(
    fallbackTicker,
    entry.input,
    undefined,
    'error',
    message,
    {
      isin: entry.meta.isin,
      name: entry.meta.name,
      market: entry.meta.market,
      currency: entry.meta.currency
    }
  );
}

function buildOutput(
  ticker: string,
  input: string,
  data: YahooQuoteSummaryResponse | undefined,
  status: 'ok' | 'error',
  message?: string,
  meta?: { isin?: string; name?: string; market?: string; currency?: string }
): OutputRow {
  if (!data || status === 'error') {
    return {
      Input: input,
      Ticker: ticker,
      ISIN: meta?.isin,
      Name: meta?.name,
      Market: meta?.market,
      Currency: meta?.currency,
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
    Name: meta?.name,
    Market: meta?.market,
    Currency: meta?.currency,
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
    .option('-i, --input <file>', 'CSV input containing Symbol or ISIN columns')
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
    const parsed = parseRows(opts.input);
    entries.push(...parsed);
  }

  argTickers.forEach((value) => {
    if (value) {
      entries.push({
        input: value,
        lookups: [{ type: 'symbol', value }],
        meta: { symbol: value }
      });
    }
  });

  if (!entries.length) {
    throw new Error('No tickers provided. Use positional arguments or --input.');
  }

  const maxQps = Number.parseFloat(opts.maxQps ?? '1');
  const results: OutputRow[] = [];

  for (const entry of entries) {
    const row = await fetchWithFallback(entry, maxQps, isinMap);
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
