import { describe, expect, it } from 'vitest'
import { visibleReportKinds } from './access'
import { REPORT_KINDS } from './registry'

describe('REPORT_KINDS', () => {
  it('registers the four v1 reports with spec audiences', () => {
    expect(REPORT_KINDS.map((kind) => [kind.id, kind.audience])).toEqual([
      ['km_summary', 'admin'],
      ['km_detail', 'admin'],
      ['km_exceptions', 'admin_and_shift_lead'],
      ['duplicate_events', 'admin_and_shift_lead'],
    ])
  })

  it('filters the catalog by role', () => {
    expect(visibleReportKinds(REPORT_KINDS, ['admin']).map((kind) => kind.id)).toHaveLength(4)
    expect(visibleReportKinds(REPORT_KINDS, ['shift_lead']).map((kind) => kind.id)).toEqual([
      'km_exceptions',
      'duplicate_events',
    ])
    expect(visibleReportKinds(REPORT_KINDS, ['responder'])).toEqual([])
  })

  it('requires a date range only on the km summary and detail reports', () => {
    expect(REPORT_KINDS.find((kind) => kind.id === 'km_summary')?.hasDateRange).toBe(true)
    expect(REPORT_KINDS.find((kind) => kind.id === 'km_detail')?.hasDateRange).toBe(true)
    expect(REPORT_KINDS.find((kind) => kind.id === 'km_exceptions')?.hasDateRange).toBe(false)
    expect(REPORT_KINDS.find((kind) => kind.id === 'duplicate_events')?.hasDateRange).toBe(false)
  })
})
