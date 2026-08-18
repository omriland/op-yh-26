import { describe, expect, it } from 'vitest'
import {
  OVERDUE_48H_MS,
  OVERDUE_7D_MS,
  OVERDUE_FILL_CARD_TIP,
  OVERDUE_FILL_CTA_LABEL,
  OVERDUE_FILL_EMAIL_SUBJECT,
  OVERDUE_FILL_FUEL_NOTE,
  isMineFillOverdue,
  nextOverdueMailKind,
  overdueFillClickLine,
  overdueFillGreeting,
  overdueFillWaitingLine,
} from './overdueFill'

const T0 = '2026-08-16T10:00:00.000Z'

function at(msAfter: number): Date {
  return new Date(Date.parse(T0) + msAfter)
}

describe('isMineFillOverdue', () => {
  it('is false before 48 hours after completable', () => {
    expect(
      isMineFillOverdue({
        isCancelled: false,
        participationStatus: 'pending',
        fillCompletableAt: T0,
        now: at(OVERDUE_48H_MS - 1),
      }),
    ).toBe(false)
  })

  it('is true at 48 hours for an open participation', () => {
    expect(
      isMineFillOverdue({
        isCancelled: false,
        participationStatus: 'in_progress',
        fillCompletableAt: T0,
        now: at(OVERDUE_48H_MS),
      }),
    ).toBe(true)
  })

  it('is false when the report is done, cancelled, or not yet completable', () => {
    const now = at(OVERDUE_48H_MS)
    expect(
      isMineFillOverdue({
        isCancelled: false,
        participationStatus: 'done',
        fillCompletableAt: T0,
        now,
      }),
    ).toBe(false)
    expect(
      isMineFillOverdue({
        isCancelled: true,
        participationStatus: 'pending',
        fillCompletableAt: T0,
        now,
      }),
    ).toBe(false)
    expect(
      isMineFillOverdue({
        isCancelled: false,
        participationStatus: 'pending',
        fillCompletableAt: null,
        now,
      }),
    ).toBe(false)
  })
})

describe('nextOverdueMailKind', () => {
  it('selects 48h first when both thresholds are due', () => {
    expect(
      nextOverdueMailKind({
        fillCompletableAt: T0,
        overdue48hEmailedAt: null,
        overdue7dEmailedAt: null,
        now: at(OVERDUE_7D_MS),
      }),
    ).toBe('48h')
  })

  it('selects 7d after the 48h mail has gone out', () => {
    expect(
      nextOverdueMailKind({
        fillCompletableAt: T0,
        overdue48hEmailedAt: at(OVERDUE_48H_MS).toISOString(),
        overdue7dEmailedAt: null,
        now: at(OVERDUE_7D_MS),
      }),
    ).toBe('7d')
  })

  it('returns null once both mails have been sent', () => {
    expect(
      nextOverdueMailKind({
        fillCompletableAt: T0,
        overdue48hEmailedAt: at(OVERDUE_48H_MS).toISOString(),
        overdue7dEmailedAt: at(OVERDUE_7D_MS).toISOString(),
        now: at(OVERDUE_7D_MS + 1),
      }),
    ).toBe(null)
  })
})

describe('overdue fill email copy', () => {
  it('keeps the locked subject, greeting, waiting line, CTA, and fuel note', () => {
    expect(OVERDUE_FILL_EMAIL_SUBJECT).toBe('חריגת זמנים בתיעוד אירוע - אבן דרך')
    expect(overdueFillGreeting('דנה כהן')).toBe('היי, דנה כהן')
    expect(overdueFillWaitingLine('48h')).toBe('יש לך אירוע שממתין לתיעוד מעל ל־48 שעות')
    expect(overdueFillWaitingLine('7d')).toBe('יש לך אירוע שממתין לתיעוד מעל ל־7 ימים')
    expect(overdueFillClickLine()).toBe('אפשר ללחוץ כאן כדי להשלים את התיעוד')
    expect(OVERDUE_FILL_CTA_LABEL).toBe('להשלמת התיעוד')
    expect(OVERDUE_FILL_FUEL_NOTE).toBe(
      'שימו לב! אירוע שלא יתועד במלואו לא יחושב להחזר הדלק הרבעוני',
    )
    expect(OVERDUE_FILL_CARD_TIP).toBe('אירוע ממתין לתיעוד מעל ל־48 שעות')
  })
})
