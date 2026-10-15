import type { AnomalyCode, AnomalyReason, Day, EmployeeIdentityIssue, PayrollRecord, RowAnomaly } from './types'

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

const DAY_LABELS: Record<Day, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
}

function rateOutlierMessage(label: string, value: number, baseline: number): { message: string; deviationPercent?: number } {
  const actual = `$${value.toFixed(2)}`
  const medianValue = `$${baseline.toFixed(2)}`
  if (baseline === 0) return {
    message: `${label}: actual ${actual}; employee median ${medianValue}; percentage difference is undefined for a zero baseline.`,
  }
  const deviationPercent = ((value - baseline) / Math.abs(baseline)) * 100
  const direction = deviationPercent > 0 ? 'above' : 'below'
  return {
    deviationPercent,
    message: `${label}: actual ${actual}; employee median ${medianValue}; ${Math.abs(deviationPercent).toFixed(1)}% ${direction} the median.`,
  }
}

export function detectNameInconsistencies(records: PayrollRecord[]): EmployeeIdentityIssue[] {
  const grouped = new Map<string, PayrollRecord[]>()
  for (const record of records) {
    const rows = grouped.get(record.employeeId) ?? []
    rows.push(record)
    grouped.set(record.employeeId, rows)
  }
  return [...grouped.entries()].flatMap(([employeeId, rows]) => {
    const normalizedNames = new Set<string>()
    const names = new Map<string, { name: string; occurrences: number; sourceRows: number[] }>()
    for (const row of rows) {
      const trimmed = row.employeeNameOriginal.trim()
      if (!trimmed) continue
      normalizedNames.add(normalized(trimmed))
      const entry = names.get(row.employeeNameOriginal) ?? { name: row.employeeNameOriginal, occurrences: 0, sourceRows: [] }
      entry.occurrences += 1
      entry.sourceRows.push(row.sourceRow)
      names.set(row.employeeNameOriginal, entry)
    }
    return normalizedNames.size > 1 ? [{
      employeeId,
      variants: [...names.values()].sort((a, b) => a.name.localeCompare(b.name, 'en')),
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
    const key = `${row.employeeId}\u0000${normalized(row.occupation)}\u0000${normalized(row.level)}`
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
        if (outlier) {
          const detail = rateOutlierMessage(rate.label, value, baseline)
          add(row, {
            code: 'rate-outlier', column: rate.column, actualRate: value, medianRate: baseline,
            deviationPercent: detail.deviationPercent,
            message: detail.message,
          })
        }
      }
    }
  }

  for (const row of records) {
    for (const day of row.daily) {
      const dayLabel = DAY_LABELS[day.day]
      if (day.standard < 0) add(row, { code: 'invalid-value', column: `${day.day}_st_hours`, day: day.day, standardHours: day.standard, overtimeHours: day.overtime, message: `${dayLabel}: standard hours ${day.standard.toFixed(1)} are negative; total ${day.total.toFixed(1)} hours (standard ${day.standard.toFixed(1)} + overtime ${day.overtime.toFixed(1)}).` })
      if (day.overtime < 0) add(row, { code: 'invalid-value', column: `${day.day}_ot_hours`, day: day.day, standardHours: day.standard, overtimeHours: day.overtime, message: `${dayLabel}: overtime hours ${day.overtime.toFixed(1)} are negative; total ${day.total.toFixed(1)} hours (standard ${day.standard.toFixed(1)} + overtime ${day.overtime.toFixed(1)}).` })
      if (day.total > 24) add(row, { code: 'invalid-value', day: day.day, standardHours: day.standard, overtimeHours: day.overtime, message: `${dayLabel}: total ${day.total.toFixed(1)} hours (standard ${day.standard.toFixed(1)} + overtime ${day.overtime.toFixed(1)}), above 24.` })
      if (day.total > 16) add(row, { code: 'long-day', day: day.day, standardHours: day.standard, overtimeHours: day.overtime, message: `${dayLabel}: total ${day.total.toFixed(1)} hours (standard ${day.standard.toFixed(1)} + overtime ${day.overtime.toFixed(1)}), above 16.` })
    }
    for (const rate of RATE_KEYS) {
      if (row[rate.key] < 0) {
        const amount = `-$${Math.abs(row[rate.key]).toFixed(2)}`
        add(row, { code: 'invalid-value', column: rate.column, message: `${rate.label} is negative (${amount}).` })
      }
    }
    if (row.totalHours > 60) add(row, { code: 'long-week', message: `Weekly total is ${row.totalHours.toFixed(1)} hours, above 60.` })
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

export function calculateAnomalyAffectedRowCounts(anomalies: RowAnomaly[]): Record<AnomalyCode, number> {
  const counts: Record<AnomalyCode, number> = {
    'rate-outlier': 0,
    'long-day': 0,
    'long-week': 0,
    'invalid-value': 0,
    'duplicate-employee-week': 0,
  }
  for (const anomaly of anomalies) {
    for (const code of new Set(anomaly.reasons.map((reason) => reason.code))) counts[code] += 1
  }
  return counts
}
