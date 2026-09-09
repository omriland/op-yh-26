import { describe, expect, it } from 'vitest'
import {
  FUTURE_EVENT_DATE_BACK,
  FUTURE_EVENT_DATE_CONTINUE,
  FUTURE_EVENT_DATE_TITLE,
  isFutureEventDate,
  shouldConfirmFutureEventDate,
} from './eventForm'

describe('future event date confirm', () => {
  it('keeps the Hebrew copy', () => {
    expect(FUTURE_EVENT_DATE_TITLE).toBe('אירוע זה נוצר בתאריך עתידי')
    expect(FUTURE_EVENT_DATE_CONTINUE).toBe('להמשיך')
    expect(FUTURE_EVENT_DATE_BACK).toBe('חזרה לעריכה')
  })

  it('treats tomorrow and later as future, today and past as not', () => {
    expect(isFutureEventDate('2026-09-07', '2026-09-06')).toBe(true)
    expect(isFutureEventDate('2026-10-01', '2026-09-06')).toBe(true)
    expect(isFutureEventDate('2026-09-06', '2026-09-06')).toBe(false)
    expect(isFutureEventDate('2026-09-05', '2026-09-06')).toBe(false)
    expect(isFutureEventDate('', '2026-09-06')).toBe(false)
  })

  it('asks once when the date is newly future, not when it was already saved', () => {
    expect(
      shouldConfirmFutureEventDate({
        eventDate: '2026-09-07',
        lastSavedDate: '2026-09-06',
        today: '2026-09-06',
      }),
    ).toBe(true)
    expect(
      shouldConfirmFutureEventDate({
        eventDate: '2026-09-07',
        lastSavedDate: '2026-09-07',
        today: '2026-09-06',
      }),
    ).toBe(false)
    expect(
      shouldConfirmFutureEventDate({
        eventDate: '2026-09-06',
        lastSavedDate: '2026-09-05',
        today: '2026-09-06',
      }),
    ).toBe(false)
  })
})
