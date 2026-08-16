import { describe, expect, it } from 'vitest'
import { visibleReportKinds } from './access'
import { REPORT_KINDS } from './registry'

describe('REPORT_KINDS', () => {
  it('registers the library reports with spec audiences', () => {
    expect(REPORT_KINDS.map((kind) => [kind.id, kind.audience])).toEqual([
      ['open_documentation', 'admin_and_shift_lead'],
      ['km_discrepancy', 'admin'],
      ['km_exceptions', 'admin_and_shift_lead'],
      ['duplicate_events', 'admin_and_shift_lead'],
    ])
  })

  it('filters the catalog by role', () => {
    expect(visibleReportKinds(REPORT_KINDS, ['admin']).map((kind) => kind.id)).toEqual([
      'open_documentation',
      'km_discrepancy',
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

  it('exports a date column on duplicate events (CSV uses the same headers)', () => {
    expect(REPORT_KINDS.find((kind) => kind.id === 'duplicate_events')?.columns.map((column) => column.header)).toEqual([
      'תאריך',
      'שעה',
      'כונן',
      'סוג אירוע',
      'כביש / מיקום',
      'מספר אירוע',
    ])
  })

  it('registers km discrepancy as admin-only with a responder-km action', () => {
    const kind = REPORT_KINDS.find((item) => item.id === 'km_discrepancy')
    expect(kind?.audience).toBe('admin')
    expect(kind?.hasPeriodPicker).toBe(true)
    expect(kind?.action?.columnId).toBe('responder_km')
    expect(kind?.action?.hoverText).toBe('החלפת הקילומטרים של האחמ״ש במספר זה')
    expect(kind?.columns.map((column) => column.header)).toEqual([
      'מספר אירוע',
      'תאריך',
      'כביש ומיקום',
      'מתנדב',
      'אחמ״ש',
      'ק״מ אחמ״ש',
      'ק״מ מתנדב',
      'הפרש',
    ])
  })
})
