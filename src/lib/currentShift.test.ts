import { describe, expect, it } from 'vitest'
import {
  NEW_EVENT_PRIMARY_TYPES,
  barText,
  canDeleteShiftEvent,
  orderEventTypesForNewEvent,
  shouldOpenShiftScreen,
  showBar,
  type CurrentShift,
} from './currentShift'

const NOON = new Date('2026-11-22T12:00:00Z')

function currentShift(patch: Partial<CurrentShift> = {}): CurrentShift {
  return {
    id: 'shift-1',
    shift_kind: 'morning',
    shift_date: '2026-11-22',
    starts_at: '2026-11-22T07:00:00+02:00',
    ends_at: '2026-11-22T15:00:00+02:00',
    vehicle_type: 'ניידת',
    ...patch,
  }
}

describe('barText', () => {
  it('names the shift kind and the end time while the shift is active', () => {
    const shift = currentShift({ shift_kind: 'midday', ends_at: '2026-11-22T21:00:00Z' })
    expect(barText(shift, 'active', NOON)).toBe('במשמרת צהריים עכשיו · עד 23:00')
  })

  it('tells the crew they can still document, with hours rounded up, once the shift ended', () => {
    const shift = currentShift({ ends_at: '2026-11-22T10:00:00Z' })
    const twoHoursAfterEnd = new Date('2026-11-22T12:00:00Z')
    expect(barText(shift, 'finishing', twoHoursAfterEnd)).toBe(
      'המשמרת הסתיימה, אפשר להשלים תיעוד · עוד 46 שעות',
    )
  })

  it('rounds the remaining hours up, not down or to nearest', () => {
    const shift = currentShift({ ends_at: '2026-11-22T10:00:00Z' })
    const twoHoursTenAfterEnd = new Date('2026-11-22T12:10:00Z')
    expect(barText(shift, 'finishing', twoHoursTenAfterEnd)).toContain('עוד 46 שעות')
    const justAfterEnd = new Date('2026-11-22T10:00:01Z')
    expect(barText(shift, 'finishing', justAfterEnd)).toContain('עוד 48 שעות')
    const fortyMinutesPastTwelve = new Date('2026-11-22T12:40:00Z')
    expect(barText(shift, 'finishing', fortyMinutesPastTwelve)).toContain('עוד 46 שעות')
  })
})

describe('shouldOpenShiftScreen', () => {
  it('opens the shift screen on the first load of the session while active', () => {
    expect(shouldOpenShiftScreen({ phase: 'active', alreadyOpened: false })).toBe(true)
  })

  it('does not open it again on later navigation', () => {
    expect(shouldOpenShiftScreen({ phase: 'active', alreadyOpened: true })).toBe(false)
  })

  it('does not redirect in any phase other than active', () => {
    for (const phase of ['legacy', 'planned', 'finishing', 'closed'] as const) {
      expect(shouldOpenShiftScreen({ phase, alreadyOpened: false })).toBe(false)
    }
  })
})

describe('showBar', () => {
  it('shows the bar for an active or finishing shift on other pages', () => {
    expect(showBar({ phase: 'active', onShiftScreenOfThisShift: false })).toBe(true)
    expect(showBar({ phase: 'finishing', onShiftScreenOfThisShift: false })).toBe(true)
  })

  it('hides the bar on the screen of that same shift', () => {
    expect(showBar({ phase: 'active', onShiftScreenOfThisShift: true })).toBe(false)
    expect(showBar({ phase: 'finishing', onShiftScreenOfThisShift: true })).toBe(false)
  })

  it('hides the bar for planned, closed and legacy shifts', () => {
    for (const phase of ['planned', 'closed', 'legacy'] as const) {
      expect(showBar({ phase, onShiftScreenOfThisShift: false })).toBe(false)
    }
  })
})

describe('canDeleteShiftEvent', () => {
  const openCrewEmpty = { canManage: false, phase: 'active', empty: true, done: false } as const

  it('lets crew delete an empty, not-done event while the window is open', () => {
    expect(canDeleteShiftEvent(openCrewEmpty)).toBe(true)
    expect(canDeleteShiftEvent({ ...openCrewEmpty, phase: 'finishing' })).toBe(true)
  })

  it('refuses crew a filled event', () => {
    expect(canDeleteShiftEvent({ ...openCrewEmpty, empty: false })).toBe(false)
  })

  it('refuses crew a done event', () => {
    expect(canDeleteShiftEvent({ ...openCrewEmpty, done: true })).toBe(false)
  })

  it('refuses crew once the window is closed', () => {
    expect(canDeleteShiftEvent({ ...openCrewEmpty, phase: 'closed' })).toBe(false)
  })

  it('refuses crew before the shift starts and on a shift without hours', () => {
    expect(canDeleteShiftEvent({ ...openCrewEmpty, phase: 'planned' })).toBe(false)
    expect(canDeleteShiftEvent({ ...openCrewEmpty, phase: 'legacy' })).toBe(false)
  })

  it('always allows leads and admins', () => {
    for (const phase of ['active', 'finishing', 'closed', 'planned'] as const) {
      expect(canDeleteShiftEvent({ canManage: true, phase, empty: false, done: true })).toBe(true)
    }
  })
})

describe('NEW_EVENT_PRIMARY_TYPES', () => {
  it('lists the four primary types in order', () => {
    expect(NEW_EVENT_PRIMARY_TYPES).toEqual(['תאונה', 'תקוע', 'נטוש', 'הפוך'])
  })
})

describe('orderEventTypesForNewEvent', () => {
  const types = [
    { id: '1', name: 'שריפה' },
    { id: '2', name: 'הפוך' },
    { id: '3', name: 'תקוע' },
    { id: '4', name: 'אחר' },
    { id: '5', name: 'תאונה' },
    { id: '6', name: 'נטוש' },
  ]

  it('puts the primary types first in their fixed order', () => {
    const { primary } = orderEventTypesForNewEvent(types)
    expect(primary.map((type) => type.name)).toEqual(['תאונה', 'תקוע', 'נטוש', 'הפוך'])
  })

  it('keeps the other types in the given list order', () => {
    const { more } = orderEventTypesForNewEvent(types)
    expect(more.map((type) => type.name)).toEqual(['שריפה', 'אחר'])
  })

  it('skips a primary type missing from the list instead of failing', () => {
    const { primary } = orderEventTypesForNewEvent(types.filter((type) => type.name !== 'נטוש'))
    expect(primary.map((type) => type.name)).toEqual(['תאונה', 'תקוע', 'הפוך'])
  })
})
