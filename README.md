# European Equity Agent

A Next.js + TypeScript application that batches European equity tickers or ISINs, downloads Yahoo Finance fundamentals, computes
standardized scorecards, momentum flags, and a six-month forward view, and prepares the data for persistence in Supabase.

## Features

- **Flexible input** – paste newline-delimited tickers or upload CSV/XLSX files with `Ticker | ISIN | Notes` headers.
- **Batch engine** – configurable batch size (default 20) with adaptive rate limiting and exponential backoff when Yahoo Finance
  responds with 429 errors.
- **Computation module** – valuation, profitability, growth, financial health, sentiment/quality, and earnings-quality metrics
  derived from Yahoo quote summaries plus price history.
- **Momentum view** – 1M/3M/6M returns, “Most Momentum” tag, and distance from 52-week extremes.
- **Forward scenarios** – base, bull, and bear 6M return expectations driven by EPS drift, multiple mean-reversion, and beta tilt.
- **Supabase ready** – schema migration, typed client helper, and clear extension points for caching raw payloads and computed
  metrics.
- **Testing** – Vitest coverage for DCF math, momentum tagging, composite scoring, and forward scenario logic.

## Getting Started

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env.local` and populate Supabase + Yahoo settings.
3. Run the dev server: `npm run dev`
4. Run unit tests: `npm test`

## Environment Variables

| Variable | Default | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_MAX_QPS` | `1` | Global query-per-second throttle respected by the Yahoo client. |
| `NEXT_PUBLIC_WACC_FLOOR` | `0.06` | Lower bound for WACC estimation. |
| `NEXT_PUBLIC_WACC_CEILING` | `0.14` | Upper bound for WACC estimation. |
| `NEXT_PUBLIC_TERMINAL_GROWTH` | `0.02` | Terminal growth assumption for light DCF. |
| `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` | – | Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | – | Supabase API keys. |

## Project Structure

- `app/` – Next.js App Router pages and API route for `/api/run`.
- `components/` – UI building blocks (upload form, live log viewer).
- `lib/` – Financial calculations, Yahoo integration, Supabase helper, and processing orchestrator.
- `utils/` – Input normalization and CSV/XLSX parsing helpers.
- `supabase/migrations/` – SQL schema for tables and indexes.
- `__tests__/` – Vitest suites for deterministic core calculations.

## Supabase Schema

Apply the migration with the Supabase CLI:

```bash
supabase db push
```

The schema provisions `companies`, `raw_cache`, `metrics`, and `job_logs` tables plus supporting indexes.

## Roadmap

- Persist cache hits/misses to Supabase.
- Wire UI results table and settings pane to stored metrics + preferences.
- Add CSV/XLSX export pipeline with methodology tab.
- Expand normalization to robust z-scores and add radar chart visualizations.
