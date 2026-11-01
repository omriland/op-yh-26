import { describe, expect, it } from 'vitest'
import {
  TREATMENT_DETAIL_MIN_ERROR,
  treatmentDetailCounter,
  treatmentDetailMeetsMinimum,
} from './treatmentDetail'

describe('treatmentDetailCounter', () => {
  it('shows the trimmed count against 40 and marks 40 or more as met', () => {
    expect(treatmentDetailCounter('')).toEqual({ text: '0 מתוך 40', met: false })
    expect(treatmentDetailCounter('  אא  ')).toEqual({ text: '2 מתוך 40', met: false })
    expect(treatmentDetailCounter('א'.repeat(39))).toEqual({ text: '39 מתוך 40', met: false })
    expect(treatmentDetailCounter(` ${'א'.repeat(40)} `)).toEqual({
      text: '40 מתוך 40',
      met: true,
    })
    expect(treatmentDetailCounter('א'.repeat(80))).toEqual({ text: '80 מתוך 40', met: true })
  })

  it('uses the same 40-character bar as the complete-mode error', () => {
    expect(treatmentDetailMeetsMinimum('א'.repeat(39))).toBe(false)
    expect(treatmentDetailMeetsMinimum('א'.repeat(40))).toBe(true)
    expect(TREATMENT_DETAIL_MIN_ERROR).toBe('יש להזין לפחות 40 תווים בפירוט הטיפול.')
  })
})
