import type { InputRow, MetricRow, ProcessingLogItem, RunResponse } from './types';
import { buildFinancialSnapshot, computeCompositeScores, computeDCF, computeForwardView, computeMomentum, deriveMetrics } from './calculations';
import { fetchYahooBundle } from './yahoo';

interface ProcessOptions {
  batchSize: number;
  maxQps: number;
  waccFloor: number;
  waccCeiling: number;
  terminalGrowth: number;
}

const REGION_WACC_BASE = 0.08;

function estimateWacc(beta: number | null, floor: number, ceiling: number): number {
  const base = REGION_WACC_BASE;
  if (beta === null) return base;
  const estimated = base + (beta - 1) * 0.01;
  return Math.min(Math.max(estimated, floor), ceiling);
}

export async function processRows(rows: InputRow[], options: ProcessOptions): Promise<RunResponse> {
  const logs: ProcessingLogItem[] = [];
  const results: MetricRow[] = [];

  for (let i = 0; i < rows.length; i += options.batchSize) {
    const batch = rows.slice(i, i + options.batchSize);
    logs.push({
      level: 'info',
      stage: 'fetch',
      message: `Processing batch ${i / options.batchSize + 1} with ${batch.length} names`,
      timestamp: new Date().toISOString()
    });

    const batchResults = await Promise.all(
      batch.map(async (row) => {
        const ticker = row.ticker;
        if (!ticker) {
          return {
            ticker: row.input,
            status: 'error' as const,
            statusMessage: 'Ticker could not be resolved'
          };
        }

        const yahoo = await fetchYahooBundle(ticker, { maxQps: options.maxQps });
        logs.push(...yahoo.logs);
        if (yahoo.error || !yahoo.data) {
          return {
            ticker,
            status: 'error' as const,
            statusMessage: yahoo.error ?? 'Missing Yahoo data'
          };
        }

        const snapshot = buildFinancialSnapshot(yahoo.data);
        const metrics = deriveMetrics(snapshot);
        const wacc = estimateWacc(snapshot.beta, options.waccFloor, options.waccCeiling);
        const dcfValue = computeDCF(snapshot, wacc, options.terminalGrowth);
        const dcfVsPrice = dcfValue && snapshot.price ? (dcfValue / snapshot.price - 1) * 100 : null;
        const momentum = yahoo.history ? computeMomentum(yahoo.history) : null;
        const forward = computeForwardView({
          price: metrics.price,
          pe: metrics.pe,
          epsCagr: metrics.epsCagr,
          peMedian: metrics.pe,
          beta: snapshot.beta,
          wacc
        });

        const compositeInput = {
          pe: metrics.pe,
          evEbitda: metrics.evEbitda,
          dcfVsPrice,
          roic: metrics.roic,
          ebitMargin: metrics.ebitMargin,
          roe: metrics.roe,
          revenueCagr: metrics.revenueCagr,
          epsCagr: metrics.epsCagr,
          fcfCagr: metrics.fcfCagr,
          debtToEquity: metrics.debtToEquity,
          interestCoverage: metrics.interestCoverage,
          insiderNetBuys: snapshot.insiderNetBuys,
          institutionalPct: snapshot.institutionalPct,
          shortInterestPct: snapshot.shortInterestPct,
          beta: snapshot.beta,
          fcfToNi: metrics.fcfToNi
        };

        const [{ composite, subscores }] = computeCompositeScores([compositeInput]);

        logs.push({
          level: 'info',
          stage: 'compute',
          message: `Computed metrics for ${ticker}`,
          timestamp: new Date().toISOString()
        });

        return {
          ticker,
          status: 'ok' as const,
          compositeScore: composite,
          subscores,
          momentumTag: momentum?.tag ?? null,
          expReturn6M: forward,
          metrics: {
            price: metrics.price ?? null,
            pe: metrics.pe ?? null,
            evEbitda: metrics.evEbitda ?? null,
            roic: metrics.roic ?? null,
            ebitMargin: metrics.ebitMargin ?? null,
            roe: metrics.roe ?? null,
            revenueCagr: metrics.revenueCagr ?? null,
            epsCagr: metrics.epsCagr ?? null,
            fcfCagr: metrics.fcfCagr ?? null,
            debtToEquity: metrics.debtToEquity ?? null,
            interestCoverage: metrics.interestCoverage ?? null,
            fcfToNi: metrics.fcfToNi ?? null,
            altmanZ: metrics.altmanZ ?? null,
            dcfVsPrice: dcfVsPrice ?? null,
            return1M: momentum?.return1M ?? null,
            return3M: momentum?.return3M ?? null,
            return6M: momentum?.return6M ?? null,
            distanceFromHigh: momentum?.distanceFromHigh ?? null,
            distanceFromLow: momentum?.distanceFromLow ?? null
          }
        } satisfies MetricRow;
      })
    );

    results.push(...batchResults);
  }

  return { rows: results, logs };
}
