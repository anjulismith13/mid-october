export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
export type Day = (typeof DAYS)[number]
export type RateKey = 'standardRate' | 'overtimeRate' | 'benefitsRate'

export interface DailyHours {
  day: Day
  standard: number
  overtime: number
  total: number
}

export interface PayrollRecord {
  sourceRow: number
  employeeNameOriginal: string
  employeeId: string
  level: string
  occupation: string
  weekEnding: Date
  daily: DailyHours[]
  standardRate: number
  overtimeRate: number
  benefitsRate: number
  standardHours: number
  overtimeHours: number
  totalHours: number
  wageSpend: number
  estimatedBenefits: number
}

export interface ParseIssue {
  sourceRow?: number
  column: string
  message: string
}

export interface ParseSuccess { ok: true; records: PayrollRecord[] }
export interface ParseFailure { ok: false; issues: ParseIssue[] }
export type ParseResult = ParseSuccess | ParseFailure

export type AnomalyCode = 'rate-outlier' | 'long-day' | 'long-week' | 'invalid-value' | 'duplicate-employee-week'

export interface AnomalyReason {
  code: AnomalyCode
  message: string
  column?: string
  day?: Day
}

export interface RowAnomaly {
  sourceRow: number
  employeeId: string
  employeeNameOriginal: string
  weekEnding: Date
  reasons: AnomalyReason[]
}

export interface EmployeeIdentityIssue {
  employeeId: string
  variants: string[]
  sourceRows: number[]
}

export interface RangeStats { min: number; max: number; mean: number }
export interface EmployeeMetrics {
  employeeId: string
  displayName: string
  nameVariants: string[]
  level: string
  occupation: string
  weeksRecorded: number
  totalHours: number
  wageSpend: number
  dailyHours: RangeStats
  rates: Record<RateKey, RangeStats>
}

export interface PayrollSummary {
  recordCount: number
  employeeCount: number
  distinctWeekCount: number
  weekStart: Date
  weekEnd: Date
  standardHours: number
  overtimeHours: number
  totalHours: number
  wageSpend: number
  estimatedBenefits: number
  overtimeShare: number
  apprenticeShare: number
  dailyHours: RangeStats
}
