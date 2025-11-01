# European Equity Data Tool

This project provides a command-line utility that ingests European equity identifiers (tickers or ISINs), retrieves public data from Yahoo Finance, and exports a standardized fundamentals sheet covering valuation, profitability, growth, balance-sheet health, sentiment, and earnings-quality metrics.

## Quick Start

```bash
npm install
npm run fetch -- AAPL NESN.SW
```

The command above prints a CSV table to stdout. Use `--output` to write the results to disk.

```bash
npm run fetch -- --input data/example_input.csv --output output.csv
```

## CLI Options

| Option | Description |
| --- | --- |
| `[tickers...]` | Optional positional tickers (e.g. `NESN.SW`) processed in order. |
| `-i, --input <file>` | CSV file with headers such as `Name`, `ISIN`, `Symbol`, `Market`, `Currency`. |
| `--isin-map <file>` | Lookup table with `isin,ticker` columns (case-insensitive headers). Defaults to `data/isin_map.csv`. |
| `-o, --output <file>` | Write CSV results to a file instead of stdout. |
| `--max-qps <number>` | Throttle Yahoo requests per second (default `1`). |

## Output Columns

Each processed row includes the following fields when data is available:

- `Price`, `Shares_Out (M)`, `Total_Debt`, `Cash`, `EBITDA`, `EBIT`, `Net_Income`, `Revenue`, `COGS`
- `Total_Equity`, `Total_Assets`, `OCF`, `FCF`, `Dividends_Paid`, `Interest_Expense`
- `Current_Assets`, `Current_Liabilities`, `Receivables`, `Inventory`
- `WACC`, `Tax_Rate`, `DCF_Value_per_Share`
- `Insider_Net_Buys`, `Institutional_%`, `Fund_Flows_3M (M)`, `Short_Interest_%`, `Analyst_Rating(1-5)`, `Beta`
- `EPS_ttm`, `EPS_CAGR_3Y`, `Revenue_CAGR_3Y`, `FCF_CAGR_3Y`, `Dividend_CAGR_3Y`, `Altman_Z`
- `Status` and an optional `Message` flag fetch errors or missing data.

Missing Yahoo fields are surfaced as `null` while the tool continues processing remaining names.

## Input Files

The input CSV must have a header row. Recognised columns are:

- `ISIN`: Primary identifier. Each ISIN is matched against the lookup map to obtain the Yahoo ticker symbol.
- `Symbol`: Used when an ISIN lookup is unavailable or when Yahoo rejects the mapped ticker.
- `Name`, `Market`, `Currency`: Optional metadata preserved in the output. The `Name` field is searched on Yahoo as a last resort when both ISIN and Symbol lookups fail.

Example input files live under `data/`.

## Development

- Build TypeScript: `npm run build`
- Run tests: `npm test`

The project uses Vitest for deterministic coverage of cash-flow discounting, momentum tagging, composite scoring, and forward scenario logic.

## Notes

- Yahoo Finance rate limits are handled with a sequential queue and exponential backoff inside `lib/yahoo.ts`.
- WACC is estimated from beta with configurable floors (6%) and caps (14%).
- Free cash flow is sourced from Yahoo directly; when absent it is derived from operating cash flow minus capital expenditures.

## License

The code is provided as-is for analytical workflows. Always verify results against primary filings before making investment decisions.
