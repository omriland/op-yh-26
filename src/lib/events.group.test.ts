import { describe, expect, it } from 'vitest'
import { shiftGroupTitle, type EventListItem } from './events'

function eventWithShift(
  shift: NonNullable<EventListItem['shift']> | null,
): EventListItem {
  return { shift } as EventListItem
}

describe('shiftGroupTitle', () => {
  it('prefixes משמרת before the date and shift details', () => {
    expect(
      shiftGroupTitle(
        eventWithShift({
          shift_date: '2026-08-16',
          shift_kind: 'morning',
          vehicle_type: 'patrol_north',
          personal_vehicle: null,
        }),
      ),
    ).toBe('משמרת · 16.08.2026 · בוקר · ניידת צפון')
  })

  it('keeps משמרת when shift details are missing', () => {
    expect(shiftGroupTitle(eventWithShift(null))).toBe('משמרת')
  })
})
