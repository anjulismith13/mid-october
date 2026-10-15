import { describe, expect, it } from 'vitest'
import bundledCsv from '../../public/payroll_data.csv?raw'
import {
  calculateAnomalyAffectedRowCounts,
  detectNameInconsistencies,
  detectRowAnomalies,
} from './anomalies'
import { parsePayrollCsv } from './parsePayroll'
import { calculateEmployeeMetrics, calculateSummary } from './statistics'
import { fixtureCsv, parsedFixtures, payrollFixture, REQUIRED_FIELDS } from './__tests__/fixtures'

function parseOk(csv: string) {
  const result = parsePayrollCsv(csv)
  if (!result.ok) throw new Error(JSON.stringify(result.issues))
  return result.records
}

const closeTo = (actual: number, expected: number, digits = 8) => expect(actual).toBeCloseTo(expected, digits)

function weeklyRates(employeeId: string, rates: number[], occupation = 'Carpenter', level = 'JOURNEYWORKER', firstDay = 1) {
  return rates.map((rate, index) => payrollFixture({
    employee_id: employeeId,
    week_ending: `03/${String(index + firstDay).padStart(2, '0')}/2025`,
    occupation,
    level,
    standard_rate: rate,
    overtime_rate: 0,
    benefits_rate: 0,
  }))
}

describe('CSV parsing', () => {
  it('parses quoted comma names, preserves leading-zero IDs, and accepts reordered columns', () => {
    const row = payrollFixture({ employee_name: 'Ada, North', employee_id: '00042' })
    const reordered = ['employee_id', 'week_ending', 'employee_name', ...REQUIRED_FIELDS.filter((field) => !['employee_id', 'week_ending', 'employee_name'].includes(field))]
    const [record] = parseOk(fixtureCsv([row], reordered))
    expect(record.employeeNameOriginal).toBe('Ada, North')
    expect(record.employeeId).toBe('00042')
    expect(record.sourceRow).toBe(2)
    expect(record.weekEnding.toISOString()).toBe('2025-03-08T00:00:00.000Z')
  })

  it('reports missing columns and invalid required cells with source row and column', () => {
    const row = payrollFixture()
    const missingField = REQUIRED_FIELDS.filter((field) => field !== 'mon_st_hours')
    const missing = parsePayrollCsv(fixtureCsv([row], missingField))
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.issues).toContainEqual(expect.objectContaining({ column: 'mon_st_hours' }))

    for (const [field, value] of [['mon_st_hours', ''], ['standard_rate', 'nope'], ['week_ending', '02/30/2025']] as const) {
      const result = parsePayrollCsv(fixtureCsv([payrollFixture({ [field]: value })]))
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.issues).toContainEqual(expect.objectContaining({ sourceRow: 2, column: field }))
    }
  })

  it('accepts valid headers with no records', () => {
    const result = parsePayrollCsv(fixtureCsv([]))
    expect(result).toEqual({ ok: true, records: [] })
    const summary = calculateSummary([])
    expect(summary.weekStart).toBeNull()
    expect(summary.weekEnd).toBeNull()
    expect(summary.dailyHours).toBeNull()
  })
})

describe('payroll statistics', () => {
  it('calculates hours, wages, benefits, apprentice share, and employee rates from recorded rows', () => {
    const records = parsedFixtures([
      payrollFixture({ level: 'APPRENTICE', daily: { mon: { standard: 2, overtime: 1 }, tue: { standard: 3 } } }),
      payrollFixture({ employee_name: 'Ada N.', level: 'JOURNEYWORKER', week_ending: '03/22/2025', standard_rate: 10, overtime_rate: 15, benefits_rate: 3, daily: { wed: { standard: 2 }, thu: { standard: 2 }, fri: { overtime: 1 } } }),
    ])
    const summary = calculateSummary(records)
    closeTo(summary.standardHours, 9)
    closeTo(summary.overtimeHours, 2)
    closeTo(summary.totalHours, 11)
    closeTo(summary.wageSpend, 185)
    closeTo(summary.estimatedBenefits, 45)
    closeTo(summary.apprenticeShare, 6 / 11)
    closeTo(summary.overtimeShare, 2 / 11)
    expect(summary.employeeCount).toBe(1) // Employee ID groups rows even when names differ.
    expect(summary.distinctWeekCount).toBe(2) // The absent week is not synthesized.

    const [employee] = calculateEmployeeMetrics(records)
    expect(employee.employeeId).toBe('0007')
    expect(employee.weeksRecorded).toBe(2)
    closeTo(employee.dailyHours.min, 0)
    closeTo(employee.dailyHours.max, 3)
    closeTo(employee.dailyHours.mean, 11 / 14) // Includes all seven days from each recorded week.
    closeTo(employee.rates.standardRate.min, 10)
    closeTo(employee.rates.standardRate.max, 20)
    closeTo(employee.rates.standardRate.mean, 15) // Unweighted across the two weekly rows.
    expect(employee.flaggedWeeks).toBe(0)
  })

  it('returns finite zero-hour summaries and safe empty-input values', () => {
    const zeroSummary = calculateSummary(parsedFixtures([payrollFixture()]))
    expect(zeroSummary.totalHours).toBe(0)
    expect(zeroSummary.overtimeShare).toBe(0)
    expect(zeroSummary.apprenticeShare).toBe(0)
    expect(Object.values(zeroSummary).filter((value): value is number => typeof value === 'number').every(Number.isFinite)).toBe(true)

    const emptySummary = calculateSummary([])
    expect(emptySummary.weekStart).toBeNull()
    expect(emptySummary.weekEnd).toBeNull()
    expect(emptySummary.dailyHours).toBeNull()
    expect(calculateEmployeeMetrics([])).toEqual([])
  })
})

describe('anomaly rules', () => {
  it('uses an employee-specific occupation/level rate baseline', () => {
    const rows = weeklyRates('0007', [100, 100, 100, 100, 130])
      .concat(weeklyRates('0008', [1000, 1000, 1000, 1000, 1000]))
      .concat(weeklyRates('0007', [500, 500, 500, 500, 500], 'Mason', 'JOURNEYWORKER', 6))
      .concat(weeklyRates('0007', [10, 10, 10, 10, 10], 'Carpenter', 'APPRENTICE', 11))
    const records = parsedFixtures(rows)
    const anomalies = detectRowAnomalies(records)
    expect(anomalies).toHaveLength(1)
    expect(anomalies.map((row) => row.employeeId)).toEqual(['0007'])
    expect(anomalies[0].sourceRow).toBe(6)
    expect(anomalies[0].reasons.filter((reason) => reason.code === 'rate-outlier').map((reason) => reason.column)).toEqual(['standard_rate'])
  })

  it('does not flag exactly 25%, flags just above 25%, and requires five records', () => {
    const exact = weeklyRates('exact', [100, 100, 100, 100, 125])
    const above = weeklyRates('above', [100, 100, 100, 100, 125.01])
    const short = weeklyRates('short', [100, 100, 100, 200])
    const records = parsedFixtures([...exact, ...above, ...short])
    const anomalies = detectRowAnomalies(records)
    expect(anomalies.map((row) => row.employeeId)).toEqual(['above'])
    closeTo(anomalies[0].reasons[0].deviationPercent!, 25.01)
  })

  it('flags nonzero rates against a zero median without dividing by zero', () => {
    const records = parsedFixtures(weeklyRates('0007', [0, 0, 0, 0, 1]))
    const anomalies = detectRowAnomalies(records)
    expect(anomalies).toHaveLength(1)
    expect(anomalies[0].reasons[0].medianRate).toBe(0)
    expect(anomalies[0].reasons[0].deviationPercent).toBeUndefined()
    expect(anomalies[0].reasons[0].message).toContain('percentage difference is undefined')
  })

  it('applies strict daily, weekly, and 24-hour invalid-value thresholds', () => {
    const records = parsedFixtures([
      payrollFixture({ employee_id: 'd16', daily: { mon: { standard: 16 } } }),
      payrollFixture({ employee_id: 'd1601', daily: { mon: { standard: 16.01 } } }),
      payrollFixture({ employee_id: 'd24', daily: { mon: { standard: 24 } } }),
      payrollFixture({ employee_id: 'd2401', daily: { mon: { standard: 24.01 } } }),
      payrollFixture({ employee_id: 'w60', daily: { mon: { standard: 8 }, tue: { standard: 8 }, wed: { standard: 8 }, thu: { standard: 8 }, fri: { standard: 8 }, sat: { standard: 8 }, sun: { standard: 12 } } }),
      payrollFixture({ employee_id: 'w6001', daily: { mon: { standard: 8 }, tue: { standard: 8 }, wed: { standard: 8 }, thu: { standard: 8 }, fri: { standard: 8 }, sat: { standard: 8 }, sun: { standard: 12.01 } } }),
    ])
    const byId = new Map(detectRowAnomalies(records).map((row) => [row.employeeId, row.reasons]))
    expect(byId.has('d16')).toBe(false)
    expect(byId.get('d1601')?.some((reason) => reason.code === 'long-day')).toBe(true)
    expect(byId.get('d1601')?.some((reason) => reason.code === 'invalid-value')).toBe(false)
    expect(byId.get('d24')?.some((reason) => reason.code === 'long-day')).toBe(true)
    expect(byId.get('d24')?.some((reason) => reason.code === 'invalid-value')).toBe(false)
    expect(byId.get('d2401')?.some((reason) => reason.code === 'invalid-value')).toBe(true)
    expect(byId.has('w60')).toBe(false)
    expect(byId.get('w6001')?.some((reason) => reason.code === 'long-week')).toBe(true)
  })

  it('flags negative values and repeated employee-week records', () => {
    const records = parsedFixtures([
      payrollFixture({ standard_rate: -1, daily: { mon: { standard: -2 } } }),
      payrollFixture({ employee_id: 'duplicate' }),
      payrollFixture({ employee_id: 'duplicate' }),
    ])
    const anomalies = detectRowAnomalies(records)
    expect(anomalies.find((row) => row.employeeId === '0007')?.reasons.filter((reason) => reason.code === 'invalid-value')).toHaveLength(2)
    expect(anomalies.filter((row) => row.employeeId === 'duplicate').every((row) => row.reasons.some((reason) => reason.code === 'duplicate-employee-week'))).toBe(true)
  })
})

describe('issue aggregation', () => {
  it('keeps multiple reasons on one row, counts affected rows once, and counts distinct flagged weeks', () => {
    const records = parsedFixtures([
      payrollFixture({ daily: { mon: { standard: 25 }, tue: { standard: 40 } }, standard_rate: -1 }),
      payrollFixture({ week_ending: '03/15/2025' }),
    ])
    const firstTwoSameWeek = parsedFixtures([
      payrollFixture(),
      payrollFixture(),
      payrollFixture({ week_ending: '03/15/2025', daily: { mon: { standard: 16.1 } } }),
    ])
    const anomalies = detectRowAnomalies(records)
    expect(anomalies).toHaveLength(1)
    expect(anomalies[0].reasons.length).toBeGreaterThan(4)
    expect(calculateAnomalyAffectedRowCounts(anomalies)).toMatchObject({ 'invalid-value': 1, 'long-day': 1, 'long-week': 1 })

    const flaggedRecords = firstTwoSameWeek
    const flagged = detectRowAnomalies(flaggedRecords)
    expect(flagged.filter((row) => row.employeeId === '0007')).toHaveLength(3)
    expect(calculateEmployeeMetrics(flaggedRecords, flagged)[0].flaggedWeeks).toBe(2)
  })

  it('ignores case and surrounding whitespace but preserves genuinely different name variants', () => {
    const equivalentNames = parsedFixtures([
      payrollFixture({ employee_name: ' Ada North ' }),
      payrollFixture({ employee_name: 'ada north', week_ending: '03/15/2025' }),
    ])
    expect(detectNameInconsistencies(equivalentNames)).toEqual([])

    const distinctNames = parsedFixtures([
      payrollFixture({ employee_name: 'Ada North' }),
      payrollFixture({ employee_name: 'Ada N.', week_ending: '03/15/2025' }),
    ])
    expect(detectNameInconsistencies(distinctNames)).toEqual([expect.objectContaining({
      employeeId: '0007',
      variants: [
        { name: 'Ada N.', occurrences: 1, sourceRows: [3] },
        { name: 'Ada North', occurrences: 1, sourceRows: [2] },
      ],
      sourceRows: [2, 3],
    })])
  })
})

describe('bundled CSV regression', () => {
  it('retains the independently established summary and anomaly counts', () => {
    const records = parseOk(bundledCsv)
    const summary = calculateSummary(records)
    const anomalies = detectRowAnomalies(records)
    const counts = calculateAnomalyAffectedRowCounts(anomalies)
    expect(summary.recordCount).toBe(263)
    expect(summary.employeeCount).toBe(23)
    expect(summary.distinctWeekCount).toBe(15)
    closeTo(summary.totalHours, 9956.8)
    closeTo(summary.wageSpend, 429214.63, 2)
    closeTo(summary.estimatedBenefits, 161251.5, 2)
    expect(counts['rate-outlier']).toBe(6)
    expect(counts['long-day']).toBe(4)
    expect(counts['long-week']).toBe(4)
    expect(anomalies.filter((row) => row.reasons.some((reason) => ['rate-outlier', 'long-day', 'long-week'].includes(reason.code))).length).toBe(14)
    expect(detectNameInconsistencies(records)).toHaveLength(3)
  })
})
