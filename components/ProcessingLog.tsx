'use client';

import clsx from 'clsx';
import type { ProcessingLogItem } from '../lib/types';

interface ProcessingLogProps {
  items: ProcessingLogItem[];
}

const levelStyles: Record<ProcessingLogItem['level'], string> = {
  info: 'text-slate-600',
  warn: 'text-amber-600',
  error: 'text-rose-600'
};

export function ProcessingLog({ items }: ProcessingLogProps) {
  if (!items.length) {
    return <p className="mt-4 text-sm text-stone-500">Logs will appear here while the job runs.</p>;
  }

  return (
    <ul className="mt-4 space-y-3 overflow-y-auto rounded-lg border border-stone-200 bg-stone-50 p-4 text-sm max-h-[28rem]">
      {items.map((item) => (
        <li key={`${item.timestamp}-${item.stage}-${item.message}`} className="space-y-1">
          <div className="flex items-center justify-between text-xs text-stone-500">
            <span className="font-medium uppercase tracking-wide">{item.stage}</span>
            <span>{new Date(item.timestamp).toLocaleTimeString()}</span>
          </div>
          <p className={clsx('leading-relaxed', levelStyles[item.level])}>{item.message}</p>
        </li>
      ))}
    </ul>
  );
}
