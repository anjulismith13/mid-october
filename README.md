# Payroll overview

A small React, TypeScript, and Vite dashboard that parses its bundled payroll CSV in the browser. The data layer validates the source before computing summaries, employee metrics, and review heuristics.

## Run locally

```sh
npm install
npm run dev
```

`npm run typecheck` checks the TypeScript project and `npm run build` creates the production bundle.

## Data handling

The app reads `public/payroll_data.csv` with Papa Parse. A malformed file is reported with its source data row and column and is not used for totals. Employee IDs remain strings. Missing employee-week records are not synthesized. Hour and rate totals use reported values; wage and benefit estimates retain full precision until display. Estimated benefits assume benefits rate applies to all recorded hours.

Anomaly thresholds are review heuristics, not legal or compliance conclusions. Suspicious records stay in the as-recorded totals. Name identity issues are shown separately from row-level anomalies.
