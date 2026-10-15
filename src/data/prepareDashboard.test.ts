import { describe, expect, it } from 'vitest'
import { fixtureCsv, payrollFixture } from './__tests__/fixtures'
import { prepareDashboardCsv, preparePayrollFile } from './prepareDashboard'

describe('shared dashboard data preparation', () => {
  it('uses one calculation pipeline for sample text and a locally read CSV file', async () => {
    const csv = fixtureCsv([payrollFixture({ daily: { mon: { standard: 3 } } })])
    const fromText = prepareDashboardCsv(csv)
    const fromFile = await preparePayrollFile({ name: 'other-payroll.csv', text: async () => csv })

    expect(fromFile.filename).toBe('other-payroll.csv')
    expect(fromFile.preparation).toEqual(fromText)
    expect(fromText.ok && fromText.data.summary.totalHours).toBe(3)
  })

  it('returns existing validation issues for an invalid upload and accepts a header-only upload', async () => {
    const invalidCsv = fixtureCsv([payrollFixture({ daily: { mon: { standard: '' } } })])
    const invalid = await preparePayrollFile({ name: 'invalid.csv', text: async () => invalidCsv })
    expect(invalid.preparation.ok).toBe(false)
    if (!invalid.preparation.ok) {
      expect(invalid.preparation.issues).toContainEqual(expect.objectContaining({ sourceRow: 2, column: 'mon_st_hours' }))
    }

    const emptyCsv = fixtureCsv([])
    const empty = prepareDashboardCsv(emptyCsv)
    expect(empty.ok).toBe(true)
    if (empty.ok) expect(empty.data.summary.recordCount).toBe(0)
  })
})
