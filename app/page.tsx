'use client';

import { useCallback, useMemo, useState } from 'react';
import { UploadForm } from '../components/UploadForm';
import { ProcessingLog } from '../components/ProcessingLog';
import type { ProcessingLogItem, RunResponse } from '../lib/types';

export default function HomePage() {
  const [logItems, setLogItems] = useState<ProcessingLogItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [batchSize, setBatchSize] = useState(20);
  const [results, setResults] = useState<RunResponse | null>(null);

  const handleSubmit = useCallback(
    async (payload: FormData) => {
      setIsLoading(true);
      setLogItems([]);
      setResults(null);
      try {
        payload.append('batchSize', batchSize.toString());
        const response = await fetch('/api/run', {
          method: 'POST',
          body: payload
        });
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }
        const data = (await response.json()) as RunResponse;
        setResults(data);
        setLogItems(data.logs);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unexpected error';
        setLogItems((prev) => [...prev, { level: 'error', message, stage: 'client', timestamp: new Date().toISOString() }]);
      } finally {
        setIsLoading(false);
      }
    },
    [batchSize]
  );

  const summary = useMemo(() => {
    if (!results) return null;
    const success = results.rows.filter((row) => row.status === 'ok').length;
    const errors = results.rows.length - success;
    return { success, errors };
  }, [results]);

  return (
    <div className="grid gap-8 lg:grid-cols-[2fr,1fr]">
      <section className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold">Upload &amp; Run</h2>
        <p className="mt-2 text-sm text-stone-600">
          Provide tickers or ISINs manually or via CSV/XLSX upload. Processing runs in the background with resumable batches and
          aggressive caching.
        </p>
        <div className="mt-6 space-y-6">
          <UploadForm onSubmit={handleSubmit} disabled={isLoading} onBatchSizeChange={setBatchSize} batchSize={batchSize} />
          {summary && (
            <div className="rounded-lg border border-stone-200 bg-stone-50 p-4 text-sm">
              <p className="font-medium text-stone-700">Run summary</p>
              <p className="mt-1 text-stone-600">
                Processed <span className="font-semibold text-stone-900">{results?.rows.length ?? 0}</span> rows with{' '}
                <span className="font-semibold text-emerald-600">{summary.success}</span> successes and{' '}
                <span className="font-semibold text-rose-600">{summary.errors}</span> errors.
              </p>
            </div>
          )}
        </div>
      </section>
      <section className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold">Live Logs</h2>
        <p className="mt-2 text-sm text-stone-600">Status messages for each batch, including rate-limit backoff information.</p>
        <ProcessingLog items={logItems} />
      </section>
    </div>
  );
}
