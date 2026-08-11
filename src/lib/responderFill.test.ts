import { describe, expect, it } from 'vitest'
import {
  computeOdometerEnd,
  emptyResponderFillDraft,
  validateResponderFillDraft,
  type ResponderFillDraft,
} from './responderFill'

function draft(patch: Partial<ResponderFillDraft> = {}): ResponderFillDraft {
  return { ...emptyResponderFillDraft(), ...patch }
}

describe('computeOdometerEnd', () => {
  it('returns empty when start is empty', () => {
    expect(computeOdometerEnd('', 12)).toBe('')
  })

  it('returns empty when totalKm is null', () => {
    expect(computeOdometerEnd('100', null)).toBe('')
  })

  it('returns empty when start is not a number', () => {
    expect(computeOdometerEnd('abc', 12)).toBe('')
  })

  it('adds lead km to start', () => {
    expect(computeOdometerEnd('100', 12)).toBe('112')
  })

  it('returns start when totalKm is zero', () => {
    expect(computeOdometerEnd('100', 0)).toBe('100')
  })
})

describe('validateResponderFillDraft with totalKm', () => {
  const plates = ['1234567']

  it('draft mode does not require totalKm', () => {
    const errors = validateResponderFillDraft(
      draft({ odometer_start: '100' }),
      'draft',
      plates,
      null,
    )
    expect(errors.odometer_end).toBeUndefined()
    expect(errors.form).toBeUndefined()
  })

  it('complete mode errors when totalKm is missing', () => {
    const errors = validateResponderFillDraft(
      draft({
        vehicle_plate: '1234567',
        odometer_start: '100',
        route: 'כביש 1',
        treatment_detail: 'טיפול',
      }),
      'complete',
      plates,
      null,
    )
    expect(errors.odometer_end).toBe(
      'האחמ״ש טרם הזין קילומטרים לאירוע. לא ניתן לסיים את הדיווח.',
    )
  })

  it('complete mode accepts derived end from start + totalKm', () => {
    const filled = draft({
      vehicle_plate: '1234567',
      odometer_start: '100',
      odometer_end: computeOdometerEnd('100', 12),
      route: 'כביש 1',
      treatment_detail: 'טיפול',
    })
    const errors = validateResponderFillDraft(filled, 'complete', plates, 12)
    expect(errors).toEqual({})
  })

  it('complete mode rejects totalKm of zero via range rule', () => {
    const filled = draft({
      vehicle_plate: '1234567',
      odometer_start: '100',
      odometer_end: computeOdometerEnd('100', 0),
      route: 'כביש 1',
      treatment_detail: 'טיפול',
    })
    const errors = validateResponderFillDraft(filled, 'complete', plates, 0)
    expect(errors.odometer_end).toBe('ק"מ סיום חייב להיות גדול מק"מ התחלה')
  })
})
