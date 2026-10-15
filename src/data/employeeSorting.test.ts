import { describe, expect, it } from 'vitest'
import type { EmployeeMetrics } from './types'
import { sortEmployees } from './employeeSorting'

function employee(employeeId: string, totalHours: number, wageSpend: number): EmployeeMetrics {
  return {
    employeeId, displayName: `Employee ${employeeId}`, nameVariants: [], level: 'JOURNEYWORKER', occupation: 'Carpenter',
    weeksRecorded: 1, flaggedWeeks: 0, totalHours, wageSpend,
    dailyHours: { min: 0, mean: 0, max: 0 },
    rates: { standardRate: { min: 0, mean: 0, max: 0 }, overtimeRate: { min: 0, mean: 0, max: 0 }, benefitsRate: { min: 0, mean: 0, max: 0 } },
  }
}

describe('employee sorting', () => {
  it('compares numeric values and uses employee ID for deterministic ties without mutating input', () => {
    const input = [employee('20', 10, 100), employee('03', 2, 20), employee('11', 2, 20)]
    expect(sortEmployees(input, 'totalHours', 'ascending').map((row) => row.employeeId)).toEqual(['03', '11', '20'])
    expect(sortEmployees(input, 'wageSpend', 'descending').map((row) => row.employeeId)).toEqual(['20', '03', '11'])
    expect(input.map((row) => row.employeeId)).toEqual(['20', '03', '11'])
  })
})
