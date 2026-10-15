# Payroll overview

A compact payroll dashboard built with React, TypeScript, and Vite. It has three sections: Summary Statistics, Employee Overviews, and Anomaly Detection. The bundled CSV is parsed in the browser; the dashboard does not send payroll data to a server.

## Prerequisites and commands

- Node.js 18.x, 20.x, or 22+ and npm (supported by the project's Vite version).
- From the repository root:

```sh
npm ci
npm run dev
```

The development server prints its local URL. To check types and create a production build:

```sh
npm run typecheck
npm run build
```

The npm lockfile pins the dependency tree for reproducible installs. There is no lint script configured.

## Stack and data flow

React renders the three dashboard tabs, TypeScript defines the payroll records and calculations, Vite serves and bundles the app, and Papa Parse reads `public/payroll_data.csv`. The source file `payroll_data (3).csv` is retained unchanged; the public file is a byte-identical copy used by the app.

Browser-side parsing fits this small, fixed 263-row dataset: it keeps the scaffold simple and avoids a backend, database, data upload path, or separate data service. The parser requires the expected columns, validates finite numeric values and real `MM/DD/YYYY` dates, and reports source row/column issues. A file with any bad record is not used for totals. Header-only files produce a clear empty state.

## Calculations and denominators

- Employee ID is the grouping key and remains a string. Each source row is one recorded employee-week; the app does not synthesize absent employee-weeks.
- Each daily total is standard hours plus overtime hours. Weekly standard hours and overtime hours are the separate seven-day sums; weekly total hours is their sum.
- Wage spend is standard hours × standard rate + overtime hours × overtime rate. Estimated benefits are total hours × benefits rate. **Benefits are an estimate that assumes the rate applies to every recorded hour.**
- Monetary values are summed at full floating-point precision and formatted to cents for display. Hour values are formatted to one decimal place.
- Summary overtime share is recorded overtime hours divided by all recorded hours. Apprentice share is hours from rows whose level is `APPRENTICE`, divided by all recorded hours.
- Summary daily statistics use all seven daily totals from every recorded week, including zero-hour days. Employee daily min/mean/max use the same seven-days-per-record denominator. Missing weeks are excluded.
- Employee rate min/max and mean use recorded weekly rows; the mean is unweighted, so each recorded week has equal weight. Weeks recorded and flagged weeks count distinct week-ending dates for that employee. A flagged week has at least one row-level anomaly; name identity issues are separate.
- Employee display names use the most frequent trimmed spelling, with a deterministic alphabetical tie-break. The source name is retained on each payroll record. Name variants are surfaced with occurrence counts and source rows; the app never merges or corrects identities.

## Anomaly review rules

These are review heuristics, not legal or compliance conclusions. Reported suspicious rows remain in as-recorded totals.

- **Rate outlier:** compare each rate with that employee's median for the same normalized occupation and level. The baseline group includes the employee ID and requires at least five recorded rows. A rate is flagged when it is more than 25% above or below the median. If the median is zero, a nonzero value is flagged and the percentage difference is shown as undefined; no division by zero is performed.
- **Long day:** daily standard plus overtime hours greater than 16. The detail includes weekday and both components. A daily total greater than 24 also triggers the invalid-value rule.
- **Long week:** total weekly hours greater than 60.
- **Invalid value:** negative daily hours, negative rates, or daily total hours greater than 24. Parsing separately rejects blank/non-numeric required values and invalid dates.
- **Duplicate employee-week:** repeated employee ID and week-ending date; each row in a duplicate group is flagged.
- **Name inconsistency:** more than one employee name remains after trimming and case normalization. This employee identity issue is displayed separately from row anomalies.

Zero-hour days and low weekly hours do not trigger anomalies by themselves. Missing employee-weeks are unknown, not zero-hour weeks. Whether the export is complete, how split-trade or duplicate records should be interpreted, whether benefits apply to overtime, and whether multiple currencies can appear are open questions in [CLIENT_QUESTIONS.md](CLIENT_QUESTIONS.md).

## Priorities and tradeoffs

This phase prioritizes traceable input validation, explicit calculation denominators, as-recorded totals, employee history comparisons, and reviewable anomaly explanations. A bundled browser CSV keeps the app local and lightweight, but it is not a multi-user or continuously updated payroll system. The employee and anomaly tables preserve detail and use horizontal scrolling on narrow screens. No charting library, backend, upload flow, deployment, or automated test framework is included.

Possible next steps are to resolve the open export and payroll-policy questions, then add focused navigation or filtering if the reviewer needs to inspect a larger dataset.

## Verification performed

- Independently recalculated the bundled CSV with a temporary Python standard-library script, separate from the production aggregation functions. Confirmed 263 rows, 23 employee IDs, 15 week endings from March 1 through June 7, 2025; 9,243.4 standard hours; 713.4 overtime hours; 9,956.8 total hours; $429,214.63 wage spend; $161,251.50 estimated benefits; 7.2% overtime share; and 22.6% apprentice share.
- Independently confirmed 6 rate-outlier rows, 4 long-day rows, 4 long-week rows, 14 distinct rows across those three rules, and 3 employee IDs with inconsistent names.
- Spot-checked a recorded-week wage calculation, one employee's seven-days-including-zero min/mean/max and unweighted rate statistics, high- and low-rate rows, a long day and long week, name-variant occurrence counts, and flagged-week counts.
- Used temporary fixtures to check exact 25%/16-hour/60-hour boundaries, a greater-than-threshold case, zero-baseline handling, a valid header-only CSV, a blank numeric cell, and an invalid calendar date. No fixtures changed the supplied CSV.
- Inspected all three tabs in the browser, including keyboard tab navigation and horizontal table scrolling. Ran TypeScript type checking, the production build, and `git diff --check`.
