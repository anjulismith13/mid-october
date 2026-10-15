import { calculateAnomalyAffectedRowCounts, detectNameInconsistencies, detectRowAnomalies } from './anomalies'
import { parsePayrollCsv } from './parsePayroll'
import { calculateEmployeeMetrics, calculateSummary } from './statistics'
import type { EmployeeIdentityIssue, EmployeeMetrics, ParseFailure, PayrollRecord, RowAnomaly } from './types'

export interface DashboardData {
  records: PayrollRecord[]
  summary: ReturnType<typeof calculateSummary>
  employees: EmployeeMetrics[]
  rowAnomalies: RowAnomaly[]
  anomalyCounts: ReturnType<typeof calculateAnomalyAffectedRowCounts>
  identityIssues: EmployeeIdentityIssue[]
}

export type DashboardPreparation = { ok: true; data: DashboardData } | ParseFailure

export function prepareDashboardCsv(csv: string): DashboardPreparation {
  const parsed = parsePayrollCsv(csv)
  if (!parsed.ok) return parsed
  const records = parsed.records
  const rowAnomalies = detectRowAnomalies(records)
  return {
    ok: true,
    data: {
      records,
      summary: calculateSummary(records),
      employees: calculateEmployeeMetrics(records, rowAnomalies),
      rowAnomalies,
      anomalyCounts: calculateAnomalyAffectedRowCounts(rowAnomalies),
      identityIssues: detectNameInconsistencies(records),
    },
  }
}

export async function preparePayrollFile(file: Pick<File, 'name' | 'text'>): Promise<{ filename: string; preparation: DashboardPreparation }> {
  return { filename: file.name, preparation: prepareDashboardCsv(await file.text()) }
}
