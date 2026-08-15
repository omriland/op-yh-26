import { describe, expect, it } from 'vitest'
import { visibleReportKinds } from './access'
import { REPORT_KINDS } from './registry'

describe('REPORT_KINDS', () => {
  it('registers the library reports with spec audiences', () => {
    expect(REPORT_KINDS.map((kind) => [kind.id, kind.audience])).toEqual([
      ['open_documentation', 'admin_and_shift_lead'],
      ['km_exceptions', 'admin_and_shift_lead'],
      ['duplicate_events', 'admin_and_shift_lead'],
    ])
  })

  it('filters the catalog by role', () => {
    expect(visibleReportKinds(REPORT_KINDS, ['admin']).map((kind) => kind.id)).toEqual([
      'open_documentation',
      'km_exceptions',
      'duplicate_events',
    ])
    expect(visibleReportKinds(REPORT_KINDS, ['shift_lead']).map((kind) => kind.id)).toEqual([
      'open_documentation',
      'km_exceptions',
      'duplicate_events',
    ])
    expect(visibleReportKinds(REPORT_KINDS, ['responder'])).toEqual([])
  })

  it('uses the period picker on open-documentation and km-exceptions', () => {
    expect(REPORT_KINDS.find((kind) => kind.id === 'open_documentation')?.hasPeriodPicker).toBe(true)
    expect(REPORT_KINDS.find((kind) => kind.id === 'km_exceptions')?.hasDateRange).toBe(true)
    expect(REPORT_KINDS.find((kind) => kind.id === 'km_exceptions')?.hasPeriodPicker).toBe(true)
    expect(REPORT_KINDS.find((kind) => kind.id === 'duplicate_events')?.hasDateRange).toBe(false)
  })

  it('describes duplicate events as same responder, place, and half-hour window', () => {
    expect(REPORT_KINDS.find((kind) => kind.id === 'duplicate_events')?.includes).toBe(
      'אירועים עם אותו הכונן, באותו מקום בחלון זמן של חצי שעה',
    )
  })
})
