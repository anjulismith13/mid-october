# Payroll overview

A compact payroll dashboard built with React, TypeScript, and Vite. It has three sections: Summary Statistics, Employee Overviews, and Anomaly Detection. It loads the bundled sample CSV or a CSV selected from the user's computer. Both are processed in the browser; payroll data is not sent to a server.

## Prerequisites and commands

- Node.js 24 LTS (recommended) and npm. npm is included with Node.js. The project's Vite version supports Node.js 18, 20, and 22 or newer.
- From the repository root:

```sh
npm ci
npm run dev
```

The development server prints its local URL. In another terminal, run the checks and production build:

```sh
npm run typecheck
npm run build
npm test
```

`package-lock.json` pins the dependency tree. Use `npm ci` instead of `npm install` for a clean, lockfile-based install. No lint script is configured.

## Stack and data flow

React renders the three dashboard tabs, TypeScript defines the payroll records and calculations, Vite serves and bundles the app, and Papa Parse reads CSV text. The app starts with `public/payroll_data.csv`; a local file picker can load another CSV through the same parser and calculation pipeline, and a button restores the bundled sample. Selected files are read in-browser and are not uploaded. The source file `payroll_data (3).csv` is retained unchanged; the public file is a byte-identical copy used by the app.

Browser-side parsing fits this small, fixed 263-row sample: it keeps the app simple and avoids a backend, database, or separate data service. The parser requires `employee_name`, `employee_id`, `level`, `occupation`, `week_ending`; `mon_st_hours` through `sun_st_hours`; `mon_ot_hours` through `sun_ot_hours`; and `standard_rate`, `overtime_rate`, `benefits_rate`. Column order may vary. Dates must be real calendar dates in `MM/DD/YYYY`; numeric cells must contain finite numbers, and blanks are errors rather than zero. Employee IDs remain strings. The file picker reads locally in the browser, shows the active filename and record count, and runs the same parser and calculations as the bundled sample. Invalid input clears prior results and reports source row/column errors; a valid header-only file displays an empty state. “Restore sample data” reloads the bundled CSV after any upload state. Selecting no file leaves current data unchanged.

## Calculations and denominators

- Employee ID is the grouping key and remains a string. Each source row is one recorded employee-week; the app does not synthesize absent employee-weeks.
- Each daily total is standard hours plus overtime hours. Weekly standard hours and overtime hours are the separate seven-day sums; weekly total hours is their sum.
- Wage spend is standard hours × standard rate + overtime hours × overtime rate. Estimated benefits are total hours × benefits rate. **Benefits are an estimate that assumes the rate applies to every recorded hour.**
- Row amounts are accumulated without rounding each row first; monetary values are formatted to cents only for display. Hour values are formatted to one decimal place.
- Summary overtime share is recorded overtime hours divided by all recorded hours. Apprentice share is hours from rows whose level is `APPRENTICE`, divided by all recorded hours.
- Summary daily statistics use all seven daily totals from every recorded week, including zero-hour days. Employee daily min/mean/max use the same seven-days-per-record denominator. Missing weeks are excluded.
- Employee rate min/max and mean use recorded weekly rows; the mean is unweighted, so each recorded week has equal weight. Weeks recorded and flagged weeks count distinct week-ending dates for that employee. A flagged week has at least one row-level anomaly; name identity issues are separate.
- Employee display names use the most frequent trimmed spelling, with a deterministic alphabetical tie-break. The source name is retained on each payroll record. Name variants are surfaced with occurrence counts and source rows; the app never merges or corrects identities.

## Anomaly review rules

These are review heuristics, not legal or compliance conclusions. Reported suspicious rows remain in as-recorded totals.

- **Rate outlier:** group records by employee ID, trimmed/lowercased occupation, and trimmed/lowercased level. This compares an employee with their own history within their recorded trade and level; it does not pool rates across different employees. Each baseline needs at least five parsed records. For each rate (standard, overtime, benefits), flag when `abs(actual - median) / abs(median) > 0.25`. Exactly 25% is not flagged. If the median is zero, flag any nonzero rate; report the percentage difference as undefined rather than dividing by zero. The median uses all parsed rows in the group, including rows that may separately receive an invalid-value flag.
- **Long day:** daily standard plus overtime hours greater than 16. The detail includes weekday and both components. A daily total greater than 24 also triggers the invalid-value rule.
- **Long week:** total weekly hours greater than 60.
- **Invalid value:** negative daily hours, negative rates, or daily total hours greater than 24. Parsing separately rejects blank/non-numeric required values and invalid dates.
- **Duplicate employee-week:** repeated employee ID and week-ending date; each row in a duplicate group is flagged.
- **Name inconsistency:** more than one employee name remains after trimming and case normalization for an employee ID. Display the original name spellings, their counts, and source rows separately from row anomalies. The app does not decide which name is correct or merge identities.

Zero-hour days and low weekly hours do not trigger anomalies by themselves. Missing employee-weeks are unknown, not zero-hour weeks.

## Priorities and tradeoffs

The implementation prioritizes traceable input validation, explicit calculation denominators, as-recorded totals, employee history comparisons, and reviewable anomaly explanations. A bundled browser CSV and local file picker keep the app lightweight, but it is not a multi-user or continuously updated payroll system. The employee and anomaly tables preserve detail and use horizontal scrolling on narrow screens. Vitest unit tests are included; there is no automated end-to-end test suite, charting library, backend, or deployment.

### Deliberate scope and limitations

The dashboard is a local, single-user analysis tool, not a payroll system of record. CSVs must use the fixed schema; there is no column mapping, persistence, backend, or automated browser test suite. The employee and anomaly tables preserve detail and scroll horizontally on narrow screens. Employee overview columns can be sorted by employee name, weeks recorded, flagged weeks, total hours, and wage spend. CSVs have no currency field, so USD display is an assumption to confirm.

Optional ideas remain deferred:

- **Severity ranking for anomaly rows:** A review-priority score would need a transparent, defensible comparison across different anomaly types. It was treated as optional because the heuristic could imply more certainty or financial significance than it supports, and there was little time left to implement and verify it.
- **Charts for employee hours or wage rates:** A useful chart needs employee selection, chronological context, rate baselines, and careful treatment of missing weeks and changing rates. The additional behavior and verification effort did not fit the remaining time.
Open data and payroll-policy questions are listed in [CLIENT_QUESTIONS.md](CLIENT_QUESTIONS.md). Confirm currency, weekday/week-ending convention, and alert thresholds before interpreting results as business policy.

## Verification performed

- Independently recalculated the bundled CSV with a temporary Python standard-library script, separate from the production aggregation functions. Confirmed 263 rows, 23 employee IDs, 15 week endings from March 1 through June 7, 2025; 9,243.4 standard hours; 713.4 overtime hours; 9,956.8 total hours; $429,214.63 wage spend; $161,251.50 estimated benefits; 7.2% overtime share; and 22.6% apprentice share.
- Independently confirmed 6 rate-outlier rows, 4 long-day rows, 4 long-week rows, 14 distinct rows across those three rules, and 3 employee IDs with inconsistent names.
- Spot-checked a recorded-week wage calculation, one employee's seven-days-including-zero min/mean/max and unweighted rate statistics, high- and low-rate rows, a long day and long week, name-variant occurrence counts, and flagged-week counts.
- Synthetic Vitest fixtures cover quoted comma names, leading-zero IDs, reordered/missing columns, blank and nonnumeric cells, invalid dates, header-only input, summary and employee calculations, recorded zero days, missing weeks, rate baselines and threshold edges, zero medians, long day/week edges, negative values, duplicate weeks, identity variants, issue counts, shared file preparation, and numeric sorting/tie ordering. A bundled CSV regression checks key summary totals and anomaly counts.
- Browser checks are manual. This pass verified Summary Statistics selected initially; sample totals; one valid upload updating Summary Statistics, Employee Overviews, and Anomaly Detection; an invalid blank numeric cell clearing the old results and showing a source-row/column error; a header-only CSV showing the empty state without invalid date output; and restoring the sample after valid, invalid, empty, and anomaly-fixture uploads. The synthetic anomaly fixture produced matching card labels and row badges for long day, long week, invalid value, and duplicate employee-week. Employee sorting was checked in ascending and descending order. No console errors appeared in captured logs during these flows. Browser checks are not an automated end-to-end suite.
- The automated suite has no browser end-to-end coverage. Standard Node.js/npm commands use the checked-in npm lockfile; setup does not depend on machine-specific runtime paths.
