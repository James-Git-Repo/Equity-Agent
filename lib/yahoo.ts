import yahooFinance from 'yahoo-finance2';
import { setTimeout as delay } from 'node:timers/promises';
import type { ProcessingLogItem, YahooPriceHistoryPoint, YahooQuoteSummaryResponse } from './types';

const modules = [
  'price',
  'financialData',
  'defaultKeyStatistics',
  'summaryDetail',
  'incomeStatementHistory',
  'balanceSheetHistory',
  'cashflowStatementHistory',
  'earningsTrend'
] as const;

export interface YahooFetchResult {
  data?: YahooQuoteSummaryResponse;
  history?: YahooPriceHistoryPoint[];
  logs: ProcessingLogItem[];
  error?: string;
}

export interface YahooClientOptions {
  backoffBaseMs?: number;
  backoffCapMs?: number;
  maxRetries?: number;
  maxQps?: number;
}

const defaultOptions: Required<YahooClientOptions> = {
  backoffBaseMs: 1_000,
  backoffCapMs: 60_000,
  maxRetries: 4,
  maxQps: 1
};

export async function fetchYahooBundle(ticker: string, options?: YahooClientOptions): Promise<YahooFetchResult> {
  const config = { ...defaultOptions, ...options };
  const logs: ProcessingLogItem[] = [];
  let attempt = 0;
  const minInterval = 1_000 / Math.max(config.maxQps, 0.1);

  while (attempt <= config.maxRetries) {
    if (attempt > 0) {
      const backoff = Math.min(config.backoffCapMs, config.backoffBaseMs * 2 ** (attempt - 1));
      const jitter = Math.random() * 200;
      const wait = backoff + jitter;
      logs.push({
        level: 'warn',
        stage: 'fetch',
        message: `Retrying ${ticker} after ${Math.round(wait)}ms backoff (attempt ${attempt + 1})`,
        timestamp: new Date().toISOString()
      });
      await delay(wait);
    }

    try {
      if (attempt === 0 && minInterval > 0) {
        await delay(minInterval);
      }

      const data = (await yahooFinance.quoteSummary(ticker, { modules: modules as unknown as any })) as unknown as YahooQuoteSummaryResponse;
      const historyResponse = await yahooFinance.historical(ticker, {
        period1: new Date(Date.now() - 1000 * 60 * 60 * 24 * 365),
        period2: new Date(),
        interval: '1d'
      });

      const history: YahooPriceHistoryPoint[] = historyResponse
        .filter((point): point is typeof point & { close: number } => typeof point.close === 'number')
        .map((point) => ({ date: new Date(point.date as string | number | Date), close: point.close }));

      logs.push({
        level: 'info',
        stage: 'fetch',
        message: `Fetched Yahoo modules for ${ticker}`,
        timestamp: new Date().toISOString()
      });

      return { data, history, logs };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Yahoo error';
      const isRateLimited = message.includes('429') || message.includes('Too Many Requests');
      logs.push({
        level: isRateLimited ? 'warn' : 'error',
        stage: 'fetch',
        message: `Attempt ${attempt + 1} failed for ${ticker}: ${message}`,
        timestamp: new Date().toISOString()
      });
      if (attempt === config.maxRetries) {
        return { logs, error: message };
      }
    }
    attempt += 1;
  }

  return { logs, error: 'Maximum retries exceeded' };
}
