import { describe, expect, it } from 'vitest'
import { isShiftFuture, isShiftPendingLog, SHIFT_LIST_SELECT } from './shifts'

describe('SHIFT_LIST_SELECT embeds', () => {
  it('hints both profile FKs so PostgREST does not return 300', () => {
    expect(SHIFT_LIST_SELECT).toContain('profiles!shifts_shift_lead_id_fkey')
    expect(SHIFT_LIST_SELECT).toContain('profiles!shifts_last_saved_by_fkey')
    expect(SHIFT_LIST_SELECT).not.toMatch(/shift_lead:profiles\(/)
  })
})

describe('isShiftFuture', () => {
  it('is true only after today', () => {
    expect(isShiftFuture('2026-08-17', '2026-08-16')).toBe(true)
    expect(isShiftFuture('2026-08-16', '2026-08-16')).toBe(false)
    expect(isShiftFuture('2026-08-15', '2026-08-16')).toBe(false)
  })
})

describe('isShiftPendingLog', () => {
  const today = '2026-08-16'

  it('is true for a past or today shift missing an odometer', () => {
    expect(
      isShiftPendingLog({ shift_date: today, odometer_start: null, odometer_end: null }, today),
    ).toBe(true)
    expect(
      isShiftPendingLog({ shift_date: '2026-08-10', odometer_start: 100, odometer_end: null }, today),
    ).toBe(true)
  })

  it('is false when both odometers are filled', () => {
    expect(
      isShiftPendingLog({ shift_date: '2026-08-10', odometer_start: 100, odometer_end: 140 }, today),
    ).toBe(false)
  })

  it('ignores future shifts', () => {
    expect(
      isShiftPendingLog({ shift_date: '2026-08-20', odometer_start: null, odometer_end: null }, today),
    ).toBe(false)
  })
})
