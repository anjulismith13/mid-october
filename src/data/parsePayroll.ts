import Papa from 'papaparse'
import { DAYS, type DailyHours, type ParseIssue, type ParseResult, type PayrollRecord } from './types'

const REQUIRED_COLUMNS = [
  'employee_name', 'employee_id', 'level', 'occupation', 'week_ending',
  ...DAYS.map((day) => `${day}_st_hours`),
  ...DAYS.map((day) => `${day}_ot_hours`),
  'standard_rate', 'overtime_rate', 'benefits_rate',
]

function parseDate(value: string): Date | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim())
  if (!match) return null
  const month = Number(match[1])
  const day = Number(match[2])
  const year = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return date
}

function numberValue(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '' || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(trimmed)) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

export function parsePayrollCsv(csvText: string): ParseResult {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (header) => header.trim(),
  })
  const issues: ParseIssue[] = []
  const headers = parsed.meta.fields ?? []
  for (const column of REQUIRED_COLUMNS) {
    if (!headers.includes(column)) issues.push({ column, message: 'Required column is missing from the CSV header.' })
  }
  for (const error of parsed.errors) {
    issues.push({ sourceRow: error.row === undefined ? undefined : error.row + 2, column: 'CSV structure', message: error.message })
  }
  if (issues.length > 0) return { ok: false, issues }

  const records: PayrollRecord[] = []
  parsed.data.forEach((row, index) => {
    const sourceRow = index + 2
    const rowIssues: ParseIssue[] = []
    for (const column of REQUIRED_COLUMNS) {
      if (row[column] === undefined || row[column].trim() === '') {
        rowIssues.push({ sourceRow, column, message: 'Required value is blank.' })
      }
    }
    const name = row.employee_name?.trim() ?? ''
    const employeeId = row.employee_id?.trim() ?? ''
    const level = row.level?.trim() ?? ''
    const occupation = row.occupation?.trim() ?? ''
    if (!name) rowIssues.push({ sourceRow, column: 'employee_name', message: 'Employee name must contain non-whitespace text.' })
    if (!employeeId) rowIssues.push({ sourceRow, column: 'employee_id', message: 'Employee ID must contain non-whitespace text.' })
    if (!level) rowIssues.push({ sourceRow, column: 'level', message: 'Level must contain non-whitespace text.' })
    if (!occupation) rowIssues.push({ sourceRow, column: 'occupation', message: 'Occupation must contain non-whitespace text.' })
    const weekEnding = parseDate(row.week_ending ?? '')
    if (!weekEnding) rowIssues.push({ sourceRow, column: 'week_ending', message: 'Expected a real calendar date in MM/DD/YYYY format.' })

    const daily: DailyHours[] = DAYS.map((day) => {
      const standardColumn = `${day}_st_hours`
      const overtimeColumn = `${day}_ot_hours`
      const standard = numberValue(row[standardColumn] ?? '')
      const overtime = numberValue(row[overtimeColumn] ?? '')
      if (standard === null) rowIssues.push({ sourceRow, column: standardColumn, message: 'Expected a finite numeric value; blanks are not zero.' })
      if (overtime === null) rowIssues.push({ sourceRow, column: overtimeColumn, message: 'Expected a finite numeric value; blanks are not zero.' })
      return { day, standard: standard ?? 0, overtime: overtime ?? 0, total: (standard ?? 0) + (overtime ?? 0) }
    })
    const rate = (column: string) => {
      const value = numberValue(row[column] ?? '')
      if (value === null) rowIssues.push({ sourceRow, column, message: 'Expected a finite numeric value; blanks are not zero.' })
      return value ?? 0
    }
    const standardRate = rate('standard_rate')
    const overtimeRate = rate('overtime_rate')
    const benefitsRate = rate('benefits_rate')
    if (rowIssues.length > 0) {
      issues.push(...rowIssues)
      return
    }
    const standardHours = daily.reduce((sum, day) => sum + day.standard, 0)
    const overtimeHours = daily.reduce((sum, day) => sum + day.overtime, 0)
    const totalHours = standardHours + overtimeHours
    records.push({
      sourceRow,
      employeeNameOriginal: row.employee_name,
      employeeId,
      level,
      occupation,
      weekEnding: weekEnding!,
      daily,
      standardRate,
      overtimeRate,
      benefitsRate,
      standardHours,
      overtimeHours,
      totalHours,
      wageSpend: standardHours * standardRate + overtimeHours * overtimeRate,
      estimatedBenefits: totalHours * benefitsRate,
    })
  })
  if (issues.length > 0) return { ok: false, issues }
  return { ok: true, records }
}
