import type { AnomalyReason, EmployeeIdentityIssue, PayrollRecord, RowAnomaly } from './types'

const RATE_KEYS = [
  { key: 'standardRate', column: 'standard_rate', label: 'Standard rate' },
  { key: 'overtimeRate', column: 'overtime_rate', label: 'Overtime rate' },
  { key: 'benefitsRate', column: 'benefits_rate', label: 'Benefits rate' },
] as const

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function normalized(value: string): string { return value.trim().toLocaleLowerCase('en') }

export function detectNameInconsistencies(records: PayrollRecord[]): EmployeeIdentityIssue[] {
  const grouped = new Map<string, PayrollRecord[]>()
  for (const record of records) {
    const rows = grouped.get(record.employeeId) ?? []
    rows.push(record)
    grouped.set(record.employeeId, rows)
  }
  return [...grouped.entries()].flatMap(([employeeId, rows]) => {
    const names = new Map<string, string>()
    for (const row of rows) {
      const trimmed = row.employeeNameOriginal.trim()
      if (trimmed) names.set(normalized(trimmed), trimmed)
    }
    return names.size > 1 ? [{
      employeeId,
      variants: [...names.values()].sort((a, b) => a.localeCompare(b, 'en')),
      sourceRows: rows.map((row) => row.sourceRow).sort((a, b) => a - b),
    }] : []
  }).sort((a, b) => a.employeeId.localeCompare(b.employeeId))
}

export function detectRowAnomalies(records: PayrollRecord[]): RowAnomaly[] {
  const reasons = new Map<number, AnomalyReason[]>()
  const add = (record: PayrollRecord, reason: AnomalyReason) => {
    const current = reasons.get(record.sourceRow) ?? []
    current.push(reason)
    reasons.set(record.sourceRow, current)
  }

  const peerGroups = new Map<string, PayrollRecord[]>()
  for (const row of records) {
    const key = `${normalized(row.occupation)}\u0000${normalized(row.level)}`
    const group = peerGroups.get(key) ?? []
    group.push(row)
    peerGroups.set(key, group)
  }
  for (const peers of peerGroups.values()) {
    if (peers.length < 5) continue
    for (const rate of RATE_KEYS) {
      const baseline = median(peers.map((row) => row[rate.key]))
      for (const row of peers) {
        const value = row[rate.key]
        const outlier = baseline === 0 ? value !== 0 : Math.abs(value - baseline) / Math.abs(baseline) > 0.25
        if (outlier) add(row, { code: 'rate-outlier', column: rate.column, message: `${rate.label} is more than 25% from the ${peers.length}-record occupation/level median (${baseline.toFixed(2)}).` })
      }
    }
  }

  for (const row of records) {
    for (const day of row.daily) {
      if (day.standard < 0) add(row, { code: 'invalid-value', column: `${day.day}_st_hours`, day: day.day, message: 'Standard hours are negative.' })
      if (day.overtime < 0) add(row, { code: 'invalid-value', column: `${day.day}_ot_hours`, day: day.day, message: 'Overtime hours are negative.' })
      if (day.total > 24) add(row, { code: 'invalid-value', day: day.day, message: `Daily total is ${day.total} hours, above 24.` })
      if (day.total > 16) add(row, { code: 'long-day', day: day.day, message: `Daily total is ${day.total} hours, above 16.` })
    }
    for (const rate of RATE_KEYS) {
      if (row[rate.key] < 0) add(row, { code: 'invalid-value', column: rate.column, message: `${rate.label} is negative.` })
    }
    if (row.totalHours > 60) add(row, { code: 'long-week', message: `Weekly total is ${row.totalHours} hours, above 60.` })
  }

  const weekGroups = new Map<string, PayrollRecord[]>()
  for (const row of records) {
    const key = `${row.employeeId}\u0000${row.weekEnding.getTime()}`
    const group = weekGroups.get(key) ?? []
    group.push(row)
    weekGroups.set(key, group)
  }
  for (const duplicates of weekGroups.values()) {
    if (duplicates.length > 1) for (const row of duplicates) {
      add(row, { code: 'duplicate-employee-week', message: `Employee ID ${row.employeeId} has ${duplicates.length} records for this week.` })
    }
  }

  return records.flatMap((row) => {
    const rowReasons = reasons.get(row.sourceRow)
    return rowReasons ? [{
      sourceRow: row.sourceRow,
      employeeId: row.employeeId,
      employeeNameOriginal: row.employeeNameOriginal,
      weekEnding: row.weekEnding,
      reasons: rowReasons,
    }] : []
  })
}
