import Papa from 'papaparse'
import { DAYS } from '../types'
import type { Day, PayrollRecord } from '../types'
import { parsePayrollCsv } from '../parsePayroll'

export const REQUIRED_FIELDS = [
  'employee_name', 'employee_id', 'level', 'occupation', 'week_ending',
  ...DAYS.map((day) => `${day}_st_hours`),
  ...DAYS.map((day) => `${day}_ot_hours`),
  'standard_rate', 'overtime_rate', 'benefits_rate',
]

type FixtureFields = 'employee_name' | 'employee_id' | 'level' | 'occupation' | 'week_ending' | 'standard_rate' | 'overtime_rate' | 'benefits_rate'
type DayOverride = Partial<Record<Day, Partial<{ standard: string | number; overtime: string | number }>>>

export function payrollFixture(overrides: Partial<Record<FixtureFields, string | number>> & { daily?: DayOverride } = {}): Record<string, string> {
  const row: Record<string, string> = {
    employee_name: 'Ada North',
    employee_id: '0007',
    level: 'JOURNEYWORKER',
    occupation: 'Carpenter',
    week_ending: '03/08/2025',
    standard_rate: '20',
    overtime_rate: '30',
    benefits_rate: '5',
  }
  for (const day of DAYS) {
    row[`${day}_st_hours`] = '0'
    row[`${day}_ot_hours`] = '0'
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (key !== 'daily' && value !== undefined) row[key] = String(value)
  }
  for (const [day, hours] of Object.entries(overrides.daily ?? {}) as Array<[Day, NonNullable<DayOverride[Day]>]>) {
    if (hours.standard !== undefined) row[`${day}_st_hours`] = String(hours.standard)
    if (hours.overtime !== undefined) row[`${day}_ot_hours`] = String(hours.overtime)
  }
  return row
}

export function fixtureCsv(rows: Record<string, string>[], fields = REQUIRED_FIELDS): string {
  return Papa.unparse({ fields, data: rows.map((row) => fields.map((field) => row[field] ?? '')) })
}

export function parsedFixtures(rows: Record<string, string>[]): PayrollRecord[] {
  const result = parsePayrollCsv(fixtureCsv(rows))
  if (!result.ok) throw new Error(`Fixture CSV did not parse: ${JSON.stringify(result.issues)}`)
  return result.records
}
