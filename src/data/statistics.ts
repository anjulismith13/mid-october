import type { EmployeeMetrics, PayrollRecord, PayrollSummary, RangeStats } from './types'

function rangeStats(values: number[]): RangeStats {
  const min = Math.min(...values)
  const max = Math.max(...values)
  return { min, max, mean: values.reduce((sum, value) => sum + value, 0) / values.length }
}

function mode(values: string[]): string {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'en'))[0][0]
}

function displayMode(names: string[]): string {
  const counts = new Map<string, number>()
  for (const name of names) {
    const trimmed = name.trim()
    counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'en'))[0][0]
}

export function calculateSummary(records: PayrollRecord[]): PayrollSummary {
  const standardHours = records.reduce((sum, row) => sum + row.standardHours, 0)
  const overtimeHours = records.reduce((sum, row) => sum + row.overtimeHours, 0)
  const totalHours = standardHours + overtimeHours
  const apprenticeHours = records.filter((row) => row.level.trim().toUpperCase() === 'APPRENTICE')
    .reduce((sum, row) => sum + row.totalHours, 0)
  const dayTotals = records.flatMap((row) => row.daily.map((day) => day.total))
  const weeks = [...new Set(records.map((row) => row.weekEnding.getTime()))].sort((a, b) => a - b)
  return {
    recordCount: records.length,
    employeeCount: new Set(records.map((row) => row.employeeId)).size,
    distinctWeekCount: weeks.length,
    weekStart: new Date(weeks[0]),
    weekEnd: new Date(weeks[weeks.length - 1]),
    standardHours,
    overtimeHours,
    totalHours,
    wageSpend: records.reduce((sum, row) => sum + row.wageSpend, 0),
    estimatedBenefits: records.reduce((sum, row) => sum + row.estimatedBenefits, 0),
    overtimeShare: totalHours === 0 ? 0 : overtimeHours / totalHours,
    apprenticeShare: totalHours === 0 ? 0 : apprenticeHours / totalHours,
    dailyHours: rangeStats(dayTotals),
  }
}

export function calculateEmployeeMetrics(records: PayrollRecord[]): EmployeeMetrics[] {
  const grouped = new Map<string, PayrollRecord[]>()
  for (const record of records) {
    const list = grouped.get(record.employeeId) ?? []
    list.push(record)
    grouped.set(record.employeeId, list)
  }
  return [...grouped.entries()].map(([employeeId, rows]) => {
    const names = rows.map((row) => row.employeeNameOriginal.trim())
    return {
      employeeId,
      displayName: displayMode(rows.map((row) => row.employeeNameOriginal)),
      nameVariants: [...new Set(names)].sort((a, b) => a.localeCompare(b, 'en')),
      level: mode(rows.map((row) => row.level.trim())),
      occupation: mode(rows.map((row) => row.occupation.trim())),
      weeksRecorded: new Set(rows.map((row) => row.weekEnding.getTime())).size,
      totalHours: rows.reduce((sum, row) => sum + row.totalHours, 0),
      wageSpend: rows.reduce((sum, row) => sum + row.wageSpend, 0),
      dailyHours: rangeStats(rows.flatMap((row) => row.daily.map((day) => day.total))),
      rates: {
        standardRate: rangeStats(rows.map((row) => row.standardRate)),
        overtimeRate: rangeStats(rows.map((row) => row.overtimeRate)),
        benefitsRate: rangeStats(rows.map((row) => row.benefitsRate)),
      },
    }
  }).sort((a, b) => a.displayName.localeCompare(b.displayName, 'en') || a.employeeId.localeCompare(b.employeeId))
}
