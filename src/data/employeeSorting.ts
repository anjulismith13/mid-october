import type { EmployeeMetrics } from './types'

export type EmployeeSortKey = 'displayName' | 'weeksRecorded' | 'flaggedWeeks' | 'totalHours' | 'wageSpend'
export type SortDirection = 'ascending' | 'descending'

export function sortEmployees(employees: EmployeeMetrics[], key: EmployeeSortKey, direction: SortDirection): EmployeeMetrics[] {
  const sign = direction === 'ascending' ? 1 : -1
  return [...employees].sort((a, b) => {
    const primary = key === 'displayName'
      ? a.displayName.localeCompare(b.displayName)
      : a[key] - b[key]
    return primary === 0 ? a.employeeId.localeCompare(b.employeeId) : primary * sign
  })
}
