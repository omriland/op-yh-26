import { describe, expect, it } from 'vitest'
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
    expect(errors.treatment_detail).toBe('יש להזין פירוט טיפול')
  })

  it('accepts a complete record', () => {
    const errors = shiftBornCompleteErrors(
      draft({ road_id: 'r1', location: 'מחלף שורק', treatment_detail: 'חילוץ' }),
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
      draft({ road_id: 'r1', location: 'x', treatment_detail: 'y' }),
    )
    expect(errors).toEqual({})
  })
})
