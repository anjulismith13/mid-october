import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import { detectNameInconsistencies, detectRowAnomalies } from '../data/anomalies'
import { parsePayrollCsv } from '../data/parsePayroll'
import { calculateEmployeeMetrics, calculateSummary } from '../data/statistics'
import type { EmployeeIdentityIssue, EmployeeMetrics, ParseIssue, PayrollRecord, RowAnomaly } from '../data/types'

type DashboardData = { records: PayrollRecord[]; summary: ReturnType<typeof calculateSummary>; employees: EmployeeMetrics[]; rowAnomalies: RowAnomaly[]; identityIssues: EmployeeIdentityIssue[] }
const TABS = [
  { id: 'summary', label: 'Summary Statistics' },
  { id: 'employees', label: 'Employee Overviews' },
  { id: 'anomalies', label: 'Anomaly Detection' },
] as const
type TabId = (typeof TABS)[number]['id']

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })
const percent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 })
const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

function Card({ label, value, note }: { label: string; value: string; note?: string }) {
  return <article className="metric-card"><p>{label}</p><strong>{value}</strong>{note && <span>{note}</span>}</article>
}

function IssueList({ issues }: { issues: ParseIssue[] }) {
  return <section className="load-error"><h2>CSV needs attention</h2><p>The dashboard has not calculated totals because one or more source values could not be read. Fix the reported cells and reload.</p>
    <ul>{issues.map((issue, index) => <li key={`${issue.sourceRow ?? 'header'}-${issue.column}-${index}`}>
      {issue.sourceRow ? `Source row ${issue.sourceRow}` : 'CSV header'} · <code>{issue.column}</code>: {issue.message}
    </li>)}</ul>
  </section>
}

function App() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [issues, setIssues] = useState<ParseIssue[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabId>('summary')
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  useEffect(() => {
    fetch('/payroll_data.csv')
      .then((response) => {
        if (!response.ok) throw new Error(`Could not load payroll_data.csv (${response.status}).`)
        return response.text()
      })
      .then((csv) => {
        const result = parsePayrollCsv(csv)
        if (!result.ok) { setIssues(result.issues); return }
        setData({
          records: result.records,
          summary: calculateSummary(result.records),
          employees: calculateEmployeeMetrics(result.records),
          rowAnomalies: detectRowAnomalies(result.records),
          identityIssues: detectNameInconsistencies(result.records),
        })
      })
      .catch((error: unknown) => setLoadError(error instanceof Error ? error.message : 'Could not load the payroll data.'))
      .finally(() => setLoading(false))
  }, [])

  const summary = data?.summary
  const reasonCounts = useMemo(() => {
    const counts = new Map<string, number>()
    data?.rowAnomalies.forEach((row) => {
      for (const code of new Set(row.reasons.map((reason) => reason.code))) counts.set(code, (counts.get(code) ?? 0) + 1)
    })
    return counts
  }, [data])

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) {
    let nextIndex: number | null = null
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % TABS.length
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + TABS.length) % TABS.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = TABS.length - 1
    if (nextIndex !== null) {
      event.preventDefault()
      setActiveTab(TABS[nextIndex].id)
      tabRefs.current[nextIndex]?.focus()
    }
  }

  return <main className="shell">
    <header className="topbar"><div className="mark">P</div><div><p className="eyebrow">PAYROLL REVIEW</p><h1>Payroll overview</h1></div><span className="source-label">Bundled CSV · browser processed</span></header>
    {loading && <div className="loading">Loading payroll records…</div>}
    {loadError && <section className="load-error"><h2>Unable to load data</h2><p>{loadError}</p></section>}
    {issues && <IssueList issues={issues} />}
    {data && summary && <>
      <nav className="tab-list" role="tablist" aria-label="Payroll dashboard sections">
        {TABS.map((tab, index) => <button
          key={tab.id}
          ref={(element) => { tabRefs.current[index] = element }}
          id={`dashboard-tab-${tab.id}`}
          className="tab-button"
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          aria-controls={`dashboard-panel-${tab.id}`}
          tabIndex={activeTab === tab.id ? 0 : -1}
          onClick={() => setActiveTab(tab.id)}
          onKeyDown={(event) => handleTabKeyDown(event, index)}
        >{tab.label}</button>)}
      </nav>
      <section id="dashboard-panel-summary" className="tab-panel" role="tabpanel" aria-labelledby="dashboard-tab-summary" hidden={activeTab !== 'summary'}>
        <section className="intro"><div><h2>Recorded payroll at a glance</h2><p>As-recorded amounts across {summary.recordCount} weekly payroll rows.</p></div>
          <div className="date-range"><span>WEEK ENDINGS</span><strong>{dateFormat.format(summary.weekStart)} – {dateFormat.format(summary.weekEnd)}</strong></div>
        </section>
        <section className="metric-grid" aria-label="Payroll summary">
          <Card label="Wage spend" value={currency.format(summary.wageSpend)} note="Standard + overtime pay" />
          <Card label="Estimated benefits" value={currency.format(summary.estimatedBenefits)} note="Assumes benefits rate applies to all hours" />
          <Card label="Total hours" value={number.format(summary.totalHours)} note={`${number.format(summary.standardHours)} standard · ${number.format(summary.overtimeHours)} OT`} />
          <Card label="Overtime share" value={percent.format(summary.overtimeShare)} note="Of recorded hours" />
          <Card label="Apprentice share" value={percent.format(summary.apprenticeShare)} note="Of recorded hours" />
          <Card label="Employees" value={number.format(summary.employeeCount)} note={`${summary.distinctWeekCount} distinct weeks`} />
        </section>
        <section className="detail-strip">
          <div><span>Records</span><strong>{summary.recordCount}</strong></div>
          <div><span>Daily hours, including zero days</span><strong>{number.format(summary.dailyHours.min)}–{number.format(summary.dailyHours.max)} <small>mean {number.format(summary.dailyHours.mean)}</small></strong></div>
          <div><span>Rows to review</span><strong>{data.rowAnomalies.length}</strong></div>
          <div><span>Name identity issues</span><strong>{data.identityIssues.length} employees</strong></div>
        </section>
        <footer>All reported rows remain in as-recorded totals. No absent employee-weeks are synthesized.</footer>
      </section>
      <section id="dashboard-panel-employees" className="tab-panel" role="tabpanel" aria-labelledby="dashboard-tab-employees" hidden={activeTab !== 'employees'}>
        <section className="panel">
          <div className="section-heading"><div><p className="eyebrow">EMPLOYEE DETAIL</p><h2>Recorded employee metrics</h2></div><span>Rate means are unweighted across recorded weeks</span></div>
          <div className="table-wrap"><table><thead><tr><th>Employee</th><th>Weeks</th><th>Total hours</th><th>Wage spend</th><th>Daily hours<br /><small>min / mean / max</small></th><th>Standard rate<br /><small>min / mean / max</small></th><th>OT rate<br /><small>min / mean / max</small></th><th>Benefits rate<br /><small>min / mean / max</small></th></tr></thead>
            <tbody>{data.employees.map((employee) => <tr key={employee.employeeId}><td>{employee.displayName}<small>ID {employee.employeeId} · {employee.level} · {employee.occupation}</small></td><td>{employee.weeksRecorded}</td><td>{number.format(employee.totalHours)}</td><td>{currency.format(employee.wageSpend)}</td><td>{employee.dailyHours.min.toFixed(1)} / {employee.dailyHours.mean.toFixed(1)} / {employee.dailyHours.max.toFixed(1)}</td>
              {[employee.rates.standardRate, employee.rates.overtimeRate, employee.rates.benefitsRate].map((rate, index) => <td key={index}>{currency.format(rate.min)} / {currency.format(rate.mean)} / {currency.format(rate.max)}</td>)}</tr>)}</tbody></table></div>
        </section>
      </section>
      <section id="dashboard-panel-anomalies" className="tab-panel" role="tabpanel" aria-labelledby="dashboard-tab-anomalies" hidden={activeTab !== 'anomalies'}>
        <section className="panel">
          <div className="section-heading"><div><p className="eyebrow">DATA QUALITY</p><h2>Review signals</h2></div><span>Heuristics for review, not legal or compliance conclusions</span></div>
          <div className="signals">
            <div><span>Rate outlier rows</span><strong>{reasonCounts.get('rate-outlier') ?? 0}</strong></div>
            <div><span>Long days</span><strong>{reasonCounts.get('long-day') ?? 0}</strong></div>
            <div><span>Long weeks</span><strong>{reasonCounts.get('long-week') ?? 0}</strong></div>
            <div><span>Invalid values</span><strong>{reasonCounts.get('invalid-value') ?? 0}</strong></div>
            <div><span>Duplicate employee-weeks</span><strong>{reasonCounts.get('duplicate-employee-week') ?? 0}</strong></div>
          </div>
          {data.identityIssues.length > 0 && <div className="identity-list"><h3>Employee name variations</h3>{data.identityIssues.map((issue) => <p key={issue.employeeId}><b>ID {issue.employeeId}</b> · {issue.variants.join(' / ')} <small>Rows {issue.sourceRows.join(', ')}</small></p>)}</div>}
          <div className="table-wrap"><table><thead><tr><th>Source row</th><th>Employee</th><th>Week ending</th><th>Review reasons</th></tr></thead>
            <tbody>{data.rowAnomalies.map((row) => <tr key={row.sourceRow}><td>#{row.sourceRow}</td><td>{row.employeeNameOriginal} <small>ID {row.employeeId}</small></td><td>{dateFormat.format(row.weekEnding)}</td><td>{row.reasons.map((reason, index) => <span className="tag" key={`${reason.code}-${reason.column ?? reason.day ?? index}`}>{reason.message}</span>)}</td></tr>)}
              {data.rowAnomalies.length === 0 && <tr><td colSpan={4}>No row-level review signals found.</td></tr>}</tbody>
          </table></div>
        </section>
      </section>
    </>}
  </main>
}

export default App
