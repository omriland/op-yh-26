import { describe, expect, it } from 'vitest'
import { visibleReportKinds } from './access'
import { REPORT_KINDS } from './registry'

describe('REPORT_KINDS', () => {
  it('registers the library reports with spec audiences', () => {
    expect(REPORT_KINDS.map((kind) => [kind.id, kind.audience])).toEqual([
      ['open_documentation', 'admin_and_shift_lead'],
      ['events_by_responder', 'admin_and_shift_lead'],
      ['km_discrepancy', 'admin'],
      ['km_exceptions', 'admin_and_shift_lead'],
      ['duplicate_events', 'admin_and_shift_lead'],
    ])
  })

  it('filters the catalog by role', () => {
    expect(visibleReportKinds(REPORT_KINDS, ['admin']).map((kind) => kind.id)).toEqual([
      'open_documentation',
      'events_by_responder',
      'km_discrepancy',
      'km_exceptions',
      'duplicate_events',
    ])
    expect(visibleReportKinds(REPORT_KINDS, ['shift_lead']).map((kind) => kind.id)).toEqual([
      'open_documentation',
      'events_by_responder',
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
    expect(kind?.action?.confirmTitle).toBe('החלפת קילומטרים?')
    const confirmBody = kind?.action?.confirmBody({
      id: 'row-1',
      values: [],
      actionValue: 18,
    })
    expect(confirmBody).toContain('18')
    expect(confirmBody).toContain('לפי מד האוץ של המתנדב')
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

  it('registers events by volunteer with PeriodPicker and grouped event columns', () => {
    const kind = REPORT_KINDS.find((item) => item.id === 'events_by_responder')
    expect(kind?.title).toBe('אירועים לפי מתנדב')
    expect(kind?.includes).toBe('כל האירועים של כל מתנדב בטווח התאריכים שנבחר')
    expect(kind?.audience).toBe('admin_and_shift_lead')
    expect(kind?.hasDateRange).toBe(true)
    expect(kind?.hasPeriodPicker).toBe(true)
    expect(kind?.csvFilename).toBe('אירועים-לפי-מתנדב.csv')
    expect(kind?.columns.map((column) => column.header)).toEqual([
      'מתנדב',
      'תאריך',
      'מספר אירוע',
      'סוג אירוע',
      'שלוחה',
      'כביש ומיקום',
      'אחמ״ש',
      'ק״מ',
    ])
  })

  it('registers admin freeze commands on km-exceptions and duplicate events', () => {
    const km = REPORT_KINDS.find((item) => item.id === 'km_exceptions')
    expect(km?.commands?.map((command) => command.id)).toEqual(['approve_over_60km'])
    expect(km?.commands?.[0]?.label).toBe('אישור להחזר דלק')
    const frozenRow = {
      id: 'r1',
      values: [],
      eventId: 'e1',
      freeze: { frozen_over_60km: true, frozen_suspicious_duplicate: false },
    }
    expect(km?.commands?.[0]?.visible?.(frozenRow, { userId: 'a', isAdmin: true })).toBe(true)
    expect(km?.commands?.[0]?.visible?.(frozenRow, { userId: 'a', isAdmin: false })).toBe(false)

    const dup = REPORT_KINDS.find((item) => item.id === 'duplicate_events')
    expect(dup?.commands?.map((command) => command.id)).toEqual(['approve_duplicate', 'delete_duplicate'])
    const dupRow = {
      id: 'r1',
      values: [],
      eventId: 'e1',
      freeze: { frozen_over_60km: false, frozen_suspicious_duplicate: true },
    }
    expect(dup?.commands?.[0]?.visible?.(dupRow, { userId: 'a', isAdmin: true })).toBe(true)
    expect(dup?.commands?.[1]?.visible?.(dupRow, { userId: 'a', isAdmin: true })).toBe(true)
    expect(dup?.commands?.[1]?.visible?.(dupRow, { userId: 'a', isAdmin: false })).toBe(false)
  })
})
