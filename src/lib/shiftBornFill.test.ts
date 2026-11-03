import { describe, expect, it } from 'vitest'
import { eventMissingLeadDoneDetails } from './eventStatus'
import {
  emptyShiftBornFillDraft,
  shiftBornCompleteErrors,
  type ShiftBornFillDraft,
} from './shiftBornFill'

function draft(over: Partial<ShiftBornFillDraft> = {}): ShiftBornFillDraft {
  return { ...emptyShiftBornFillDraft(), ...over }
}

describe('shiftBornCompleteErrors', () => {
  it('refuses an empty record on all three required fields', () => {
    const errors = shiftBornCompleteErrors(draft())
    expect(errors.road_id).toBe('יש לבחור כביש')
    expect(errors.location).toBe('יש להזין מיקום')
    expect(errors.treatment_detail).toBe('יש להזין לפחות 40 תווים בפירוט הטיפול.')
  })

  it('requires at least 40 characters in פירוט טיפול and allows more', () => {
    const short = shiftBornCompleteErrors(
      draft({ road_id: 'r1', location: 'מחלף שורק', treatment_detail: 'א'.repeat(39) }),
    )
    expect(short.treatment_detail).toBe('יש להזין לפחות 40 תווים בפירוט הטיפול.')

    const exact = shiftBornCompleteErrors(
      draft({
        road_id: 'r1',
        location: 'מחלף שורק',
        treatment_detail: `  ${'א'.repeat(40)}  `,
      }),
    )
    expect(exact.treatment_detail).toBeUndefined()

    const longer = shiftBornCompleteErrors(
      draft({ road_id: 'r1', location: 'מחלף שורק', treatment_detail: 'א'.repeat(80) }),
    )
    expect(longer.treatment_detail).toBeUndefined()
  })

  it('drops the 40-character minimum when the event is cancelled', () => {
    const cancelled = { is_cancelled: true }
    const short = shiftBornCompleteErrors(
      draft({ road_id: 'r1', location: 'מחלף שורק', treatment_detail: 'בוטל' }),
      cancelled,
    )
    expect(short.treatment_detail).toBeUndefined()

    const blank = shiftBornCompleteErrors(
      draft({ road_id: 'r1', location: 'מחלף שורק', treatment_detail: '   ' }),
      cancelled,
    )
    expect(blank.treatment_detail).toBe('יש להזין פירוט טיפול')
  })

  it('accepts a complete record', () => {
    const errors = shiftBornCompleteErrors(
      draft({ road_id: 'r1', location: 'מחלף שורק', treatment_detail: 'א'.repeat(40) }),
    )
    expect(errors).toEqual({})
  })

  it('treats whitespace as empty', () => {
    const errors = shiftBornCompleteErrors(
      draft({ road_id: 'r1', location: '   ', treatment_detail: '\n\t' }),
    )
    expect(errors.location).toBeDefined()
    expect(errors.treatment_detail).toBeDefined()
    expect(errors.road_id).toBeUndefined()
  })

  it('names the problem and the action, with no exclamation mark', () => {
    const errors = shiftBornCompleteErrors(draft())
    for (const message of Object.values(errors)) {
      expect(message).not.toContain('!')
      expect(message.startsWith('יש ')).toBe(true)
    }
  })

  it('does not require the optional fields', () => {
    const errors = shiftBornCompleteErrors(
      draft({ road_id: 'r1', location: 'x', treatment_detail: 'א'.repeat(40) }),
    )
    expect(errors).toEqual({})
  })

  it('completes with no event end time and no per-responder KM', () => {
    const errors = shiftBornCompleteErrors(
      draft({ road_id: 'r1', location: 'x', treatment_detail: 'א'.repeat(40) }),
      { is_cancelled: false },
    )
    expect(errors).toEqual({})
  })
})

describe('eventMissingLeadDoneDetails', () => {
  it('treats a missing event end time as a lead detail gap', () => {
    expect(eventMissingLeadDoneDetails(null)).toBe(true)
    expect(eventMissingLeadDoneDetails('   ')).toBe(true)
    expect(eventMissingLeadDoneDetails('2026-09-10T11:13:00')).toBe(false)
  })
})
