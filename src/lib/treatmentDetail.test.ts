import { describe, expect, it } from 'vitest'
import {
  TREATMENT_DETAIL_MIN_ERROR,
  treatmentDetailCompleteError,
  treatmentDetailCounter,
  treatmentDetailMeetsMinimum,
} from './treatmentDetail'

describe('treatmentDetailCounter', () => {
  it('shows a static minimum hint and marks 25 or more as met', () => {
    const hint = 'מינימום 25 תווים'
    expect(treatmentDetailCounter('')).toEqual({ text: hint, met: false })
    expect(treatmentDetailCounter('  אא  ')).toEqual({ text: hint, met: false })
    expect(treatmentDetailCounter('א'.repeat(24))).toEqual({ text: hint, met: false })
    expect(treatmentDetailCounter(` ${'א'.repeat(25)} `)).toEqual({ text: hint, met: true })
    expect(treatmentDetailCounter('א'.repeat(80))).toEqual({ text: hint, met: true })
  })

  it('uses the same 25-character bar as the complete-mode error', () => {
    expect(treatmentDetailMeetsMinimum('א'.repeat(24))).toBe(false)
    expect(treatmentDetailMeetsMinimum('א'.repeat(25))).toBe(true)
    expect(treatmentDetailCompleteError('א'.repeat(24))).toBe(TREATMENT_DETAIL_MIN_ERROR)
    expect(treatmentDetailCompleteError('א'.repeat(25))).toBeUndefined()
    expect(TREATMENT_DETAIL_MIN_ERROR).toBe('יש להזין לפחות 25 תווים בפירוט הטיפול.')
  })

  it('has no minimum when the event is cancelled', () => {
    expect(treatmentDetailCompleteError('', true)).toBeUndefined()
    expect(treatmentDetailCompleteError('   ', true)).toBeUndefined()
    expect(treatmentDetailCompleteError('בוטל', true)).toBeUndefined()
    expect(treatmentDetailCompleteError('א'.repeat(24), true)).toBeUndefined()
  })
})
