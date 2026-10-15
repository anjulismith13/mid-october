import { type ChangeEvent, type KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react'
import { prepareDashboardCsv, preparePayrollFile, type DashboardData } from '../data/prepareDashboard'
import { sortEmployees, type EmployeeSortKey, type SortDirection } from '../data/employeeSorting'
import type { AnomalyCode, ParseIssue } from '../data/types'

const TABS = [
  { id: 'summary', label: 'Summary Statistics' },
  { id: 'employees', label: 'Employee Overviews' },
  { id: 'anomalies', label: 'Anomaly Detection' },
] as const
type TabId = (typeof TABS)[number]['id']
const EMPLOYEE_SORT_COLUMNS: Array<{ key: EmployeeSortKey; label: string }> = [
  { key: 'displayName', label: 'Employee' },
  { key: 'weeksRecorded', label: 'Weeks recorded' },
  { key: 'flaggedWeeks', label: 'Flagged weeks' },
  { key: 'totalHours', label: 'Total hours' },
  { key: 'wageSpend', label: 'Wage spend' },
]

const ANOMALY_TYPES: Array<{ code: AnomalyCode; label: string; tone: string }> = [
  { code: 'rate-outlier', label: 'Rate outlier', tone: 'rate-outlier' },
  { code: 'long-day', label: 'Long day', tone: 'long-day' },
  { code: 'long-week', label: 'Long week', tone: 'long-week' },
  { code: 'invalid-value', label: 'Invalid value', tone: 'invalid-value' },
  { code: 'duplicate-employee-week', label: 'Duplicate employee-week', tone: 'duplicate-employee-week' },
]

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
  const [activeFilename, setActiveFilename] = useState('payroll_data.csv')
  const [isSampleData, setIsSampleData] = useState(true)
  const [activeTab, setActiveTab] = useState<TabId>('summary')
  const [employeeSort, setEmployeeSort] = useState<{ key: EmployeeSortKey; direction: SortDirection }>({ key: 'displayName', direction: 'ascending' })
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const requestIdRef = useRef(0)

  const beginLoad = useCallback((filename: string, sample: boolean) => {
    const requestId = ++requestIdRef.current
    setActiveFilename(filename)
    setIsSampleData(sample)
    setData(null)
    setIssues(null)
    setLoadError(null)
    setLoading(true)
    return requestId
  }, [])

  const commitPreparation = useCallback((requestId: number, preparation: ReturnType<typeof prepareDashboardCsv>) => {
    if (requestId !== requestIdRef.current) return
    if (preparation.ok) {
      setData(preparation.data)
      setIssues(null)
    } else {
      setData(null)
      setIssues(preparation.issues)
    }
    setLoadError(null)
  }, [])

  const failLoad = useCallback((requestId: number, error: unknown, fallback: string) => {
    if (requestId !== requestIdRef.current) return
    setData(null)
    setIssues(null)
    setLoadError(error instanceof Error ? error.message : fallback)
  }, [])

  const finishLoad = useCallback((requestId: number) => {
    if (requestId === requestIdRef.current) setLoading(false)
  }, [])

  const loadSample = useCallback(async () => {
    const requestId = beginLoad('payroll_data.csv', true)
    try {
      const response = await fetch('/payroll_data.csv')
      if (!response.ok) throw new Error(`Could not load payroll_data.csv (${response.status}).`)
      const csv = await response.text()
      commitPreparation(requestId, prepareDashboardCsv(csv))
    } catch (error: unknown) {
      failLoad(requestId, error, 'Could not load the payroll data.')
    } finally {
      finishLoad(requestId)
    }
  }, [beginLoad, commitPreparation, failLoad, finishLoad])

  useEffect(() => {
    void loadSample()
    return () => { requestIdRef.current += 1 }
  }, [loadSample])

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return
    input.value = ''
    const requestId = beginLoad(file.name, false)
    try {
      const loaded = await preparePayrollFile(file)
      if (requestId !== requestIdRef.current) return
      commitPreparation(requestId, loaded.preparation)
    } catch (error: unknown) {
      failLoad(requestId, error, `Could not read ${file.name}.`)
    } finally {
      finishLoad(requestId)
    }
  }

  const summary = data?.summary
  const sortedEmployees = data ? sortEmployees(data.employees, employeeSort.key, employeeSort.direction) : []

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
    <header className="topbar"><div className="mark">P</div><div><p className="eyebrow">DASHBOARD</p><h1>Payroll Analysis</h1></div><span className="source-label">{isSampleData ? 'Bundled sample · browser processed' : 'Selected CSV · browser processed'}</span></header>
    {loading && <div className="loading" role="status">Loading payroll records…</div>}
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
        {summary.recordCount === 0 ? <div className="empty-state"><h2>No payroll records found</h2><p>The CSV has a valid header but contains no payroll rows. Summary statistics, employee metrics, and anomaly counts are unavailable until records are present.</p></div> : <>
        <section className="intro"><div><h2>Recorded payroll at a glance</h2><p>As-recorded amounts across {summary.recordCount} weekly payroll rows.</p></div>
          <div className="date-range"><span>WEEK ENDINGS</span><strong>{summary.weekStart && summary.weekEnd ? `${dateFormat.format(summary.weekStart)} – ${dateFormat.format(summary.weekEnd)}` : 'No recorded weeks'}</strong></div>
        </section>
        <p className="reported-note">Amounts shown are reported values. Estimated benefits assume the benefits rate applies to all recorded hours.</p>
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
          <div><span>Daily hours, including zero days</span><strong>{summary.dailyHours ? `${number.format(summary.dailyHours.min)}–${number.format(summary.dailyHours.max)} ` : ''}<small>{summary.dailyHours ? `mean ${number.format(summary.dailyHours.mean)}` : 'No recorded days'}</small></strong></div>
          <div><span>Rows to review</span><strong>{data.rowAnomalies.length}</strong></div>
          <div><span>Name identity issues</span><strong>{data.identityIssues.length} employees</strong></div>
        </section>
        <footer>All reported rows remain in as-recorded totals. Daily statistics include all seven days of recorded weeks, including zeros; missing weeks are excluded.</footer>
        </>}
      </section>
      <section id="dashboard-panel-employees" className="tab-panel" role="tabpanel" aria-labelledby="dashboard-tab-employees" hidden={activeTab !== 'employees'}>
        <section className="panel">
          <div className="section-heading"><div><p className="eyebrow">EMPLOYEE DETAIL</p><h2>Recorded employee metrics</h2></div></div>
          <p className="table-note">Daily statistics include all seven days of recorded weeks, including zeros. Missing weeks are excluded.</p>
          <div className="table-wrap"><table><thead><tr>{EMPLOYEE_SORT_COLUMNS.map(({ key, label }) => <th key={key} aria-sort={employeeSort.key === key ? employeeSort.direction : undefined}><button className="sort-button" type="button" onClick={() => setEmployeeSort((current) => current.key === key ? { key, direction: current.direction === 'ascending' ? 'descending' : 'ascending' } : { key, direction: 'ascending' })}>{label}<span aria-hidden="true">{employeeSort.key === key ? employeeSort.direction === 'ascending' ? ' ↑' : ' ↓' : ' ↕'}</span></button></th>)}<th>Daily hours<br /><small>min / mean / max</small></th><th>Standard rate<br /><small>min / mean / max</small></th><th>Overtime rate<br /><small>min / mean / max</small></th><th>Benefits rate<br /><small>min / mean / max</small></th></tr></thead>
            <tbody>{sortedEmployees.map((employee) => <tr key={employee.employeeId}><td>{employee.displayName}<small>ID {employee.employeeId} · {employee.level} · {employee.occupation}</small></td><td>{employee.weeksRecorded}</td><td>{employee.flaggedWeeks}</td><td>{number.format(employee.totalHours)}</td><td>{currency.format(employee.wageSpend)}</td><td>{employee.dailyHours.min.toFixed(1)} / {employee.dailyHours.mean.toFixed(1)} / {employee.dailyHours.max.toFixed(1)}</td>
              {[employee.rates.standardRate, employee.rates.overtimeRate, employee.rates.benefitsRate].map((rate, index) => <td key={index}>{currency.format(rate.min)} / {currency.format(rate.mean)} / {currency.format(rate.max)}</td>)}</tr>)}</tbody></table></div>
          {data.employees.length === 0 && <p className="empty-state compact">No employee records are available.</p>}
        </section>
      </section>
      <section id="dashboard-panel-anomalies" className="tab-panel" role="tabpanel" aria-labelledby="dashboard-tab-anomalies" hidden={activeTab !== 'anomalies'}>
        <section className="panel">
          <div className="section-heading"><div><p className="eyebrow">DATA QUALITY</p><h2>Review signals</h2></div><span>Heuristics for review, not legal or compliance conclusions</span></div>
          <div className="signals">
            {ANOMALY_TYPES.map((type) => <div className={`signal-card signal-${type.tone}`} key={type.code}>
              <span>{type.label}</span><strong>{data.anomalyCounts[type.code]}</strong><small>affected rows</small>
            </div>)}
          </div>
          <p className="signal-note">Counts represent affected source rows; one row may contribute to multiple anomaly types. Employee name issues are listed separately.</p>
          {data.identityIssues.length > 0 && <div className="identity-list"><h3>Employee name variations</h3>{data.identityIssues.map((issue) => <div className="identity-issue" key={issue.employeeId}><p><b>Employee ID {issue.employeeId}</b></p><ul>{issue.variants.map((variant) => <li key={variant.name}><span>{JSON.stringify(variant.name)}</span> · {variant.occurrences} occurrences · source row{variant.sourceRows.length === 1 ? '' : 's'} {variant.sourceRows.join(', ')}</li>)}</ul></div>)}</div>}
          <div className="table-wrap"><table><thead><tr><th>Source row</th><th>Employee</th><th>Week ending</th><th>Type</th><th>Reason details</th></tr></thead>
            <tbody>{data.rowAnomalies.map((row) => {
              const rowCodes = new Set(row.reasons.map((reason) => reason.code))
              return <tr key={row.sourceRow}><td>#{row.sourceRow}</td><td>{row.employeeNameOriginal} <small>ID {row.employeeId}</small></td><td>{dateFormat.format(row.weekEnding)}</td>
                <td>{ANOMALY_TYPES.filter((type) => rowCodes.has(type.code)).map((type) => <span className={`anomaly-badge anomaly-${type.tone}`} key={type.code}>{type.label}</span>)}</td>
                <td>{row.reasons.map((reason, index) => <span className="tag" key={`${reason.code}-${reason.column ?? reason.day ?? index}`}>{reason.message}</span>)}</td></tr>
            })}
              {data.rowAnomalies.length === 0 && <tr><td colSpan={5}>No row-level review signals found.</td></tr>}</tbody>
          </table></div>
        </section>
      </section>
    </>}
    <section className="dataset-controls" aria-label="Payroll data controls">
      <div className="file-picker">
        <label htmlFor="payroll-csv-file">Choose a payroll CSV</label>
        <input id="payroll-csv-file" type="file" accept=".csv,text/csv" onChange={handleFileChange} aria-describedby="csv-local-note" />
        <p id="csv-local-note">CSV files are processed in this browser and are not uploaded.</p>
      </div>
      <div className="dataset-status">
        <button type="button" className="restore-button" onClick={() => void loadSample()}>Restore sample data</button>
        <div className="active-dataset" aria-live="polite">
          <span>Active file</span><strong title={activeFilename}>{activeFilename}</strong>
          <span>Records</span><strong>{data ? data.records.length : loading ? 'Loading…' : issues || loadError ? 'Unavailable' : '—'}</strong>
        </div>
      </div>
    </section>
  </main>
}

export default App
