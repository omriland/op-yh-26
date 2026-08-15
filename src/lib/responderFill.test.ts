import { describe, expect, it } from 'vitest'
import {
  deriveEventStatusAfterParticipation,
  emptyResponderFillDraft,
  validateResponderFillDraft,
  type ResponderFillDraft,
} from './responderFill'

function draft(patch: Partial<ResponderFillDraft> = {}): ResponderFillDraft {
  return { ...emptyResponderFillDraft(), ...patch }
}

describe('deriveEventStatusAfterParticipation', () => {
  it('keeps draft-only progress as in_progress, not partial', () => {
    expect(deriveEventStatusAfterParticipation(['pending', 'in_progress'])).toBe('in_progress')
  })

  it('uses partial only when someone has completed', () => {
    expect(deriveEventStatusAfterParticipation(['done', 'pending'])).toBe('partial')
  })

  it('marks done when every participation is done', () => {
    expect(deriveEventStatusAfterParticipation(['done', 'done'])).toBe('done')
  })
})

describe('validateResponderFillDraft (user-entered odometer end)', () => {
  const plates = ['1234567']

  it('draft mode does not require totalKm or end', () => {
    const errors = validateResponderFillDraft(
      draft({ odometer_start: '100' }),
      'draft',
      plates,
      null,
    )
    expect(errors.odometer_end).toBeUndefined()
  })

  it('complete mode errors when totalKm is missing (generic copy, no number)', () => {
    const errors = validateResponderFillDraft(
      draft({
        vehicle_plate: '1234567',
        odometer_start: '100',
        odometer_end: '112',
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
    expect(JSON.stringify(errors)).not.toMatch(/\d{2,}/)
  })

  it('complete mode requires user-entered end even when totalKm is set', () => {
    const errors = validateResponderFillDraft(
      draft({
        vehicle_plate: '1234567',
        odometer_start: '100',
        odometer_end: '',
        route: 'כביש 1',
        treatment_detail: 'טיפול',
      }),
      'complete',
      plates,
      12,
    )
    expect(errors.odometer_end).toBe('יש למלא מד אוץ סיום.')
  })

  it('complete mode accepts user end when totalKm is present', () => {
    const errors = validateResponderFillDraft(
      draft({
        vehicle_plate: '1234567',
        odometer_start: '100',
        odometer_end: '115',
        route: 'כביש 1',
        treatment_detail: 'טיפול',
      }),
      'complete',
      plates,
      12,
    )
    expect(errors).toEqual({})
  })

  it('complete mode allows totalKm of 0 when user end > start', () => {
    const errors = validateResponderFillDraft(
      draft({
        vehicle_plate: '1234567',
        odometer_start: '100',
        odometer_end: '110',
        route: 'כביש 1',
        treatment_detail: 'טיפול',
      }),
      'complete',
      plates,
      0,
    )
    expect(errors).toEqual({})
  })

  it('rejects end <= start', () => {
    const errors = validateResponderFillDraft(
      draft({
        vehicle_plate: '1234567',
        odometer_start: '100',
        odometer_end: '100',
        route: 'כביש 1',
        treatment_detail: 'טיפול',
      }),
      'complete',
      plates,
      12,
    )
    expect(errors.odometer_end).toBe('מד אוץ סיום חייב להיות גדול ממד אוץ התחלה')
  })
})
