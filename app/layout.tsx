import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'European Equity Agent',
  description: 'Batch analytics for European equities'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-stone-50 text-slate-900">
        <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-8">
          <header className="mb-8 border-b border-stone-200 pb-4">
            <h1 className="text-3xl font-semibold text-stone-900">European Equity Agent</h1>
            <p className="mt-2 max-w-2xl text-sm text-stone-600">
              Upload tickers or ISINs, process them in resilient batches, and review standardized fundamentals, momentum, and sentiment analytics.
            </p>
          </header>
          <main className="flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
