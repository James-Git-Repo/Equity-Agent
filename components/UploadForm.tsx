'use client';

import { useCallback, useRef } from 'react';

interface UploadFormProps {
  onSubmit: (formData: FormData) => Promise<void>;
  disabled?: boolean;
  batchSize: number;
  onBatchSizeChange: (value: number) => void;
}

export function UploadForm({ onSubmit, disabled, batchSize, onBatchSizeChange }: UploadFormProps) {
  const formRef = useRef<HTMLFormElement | null>(null);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!formRef.current) return;
      const formData = new FormData(formRef.current);
      await onSubmit(formData);
    },
    [onSubmit]
  );

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-2 block text-sm font-medium text-stone-700" htmlFor="tickers">
          Manual list (Ticker or ISIN per line)
        </label>
        <textarea
          id="tickers"
          name="tickers"
          className="h-36 w-full resize-none rounded-lg border border-stone-300 bg-white p-3 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200"
          placeholder="NESN.SW\nAIR.PA\nBP.L"
          disabled={disabled}
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-stone-700" htmlFor="file">
          Or upload CSV/XLSX
        </label>
        <input
          id="file"
          name="file"
          type="file"
          accept=".csv,.xlsx,.xls"
          className="block w-full rounded-lg border border-dashed border-stone-300 bg-stone-50 p-3 text-sm text-stone-600 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200"
          disabled={disabled}
        />
        <p className="mt-2 text-xs text-stone-500">Headers supported: Ticker | ISIN | Notes.</p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="text-sm font-medium text-stone-700" htmlFor="batchSize">
          Batch size
        </label>
        <input
          id="batchSize"
          name="batchSizeInput"
          type="number"
          min={5}
          max={50}
          step={5}
          value={batchSize}
          onChange={(event) => onBatchSizeChange(Number(event.target.value))}
          className="w-20 rounded-lg border border-stone-300 bg-white p-2 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200"
          disabled={disabled}
        />
        <p className="text-xs text-stone-500">Processed sequentially with resilient rate limiting.</p>
      </div>

      <button
        type="submit"
        disabled={disabled}
        className="inline-flex items-center justify-center rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-stone-300"
      >
        {disabled ? 'Processing…' : 'Start processing'}
      </button>
    </form>
  );
}
