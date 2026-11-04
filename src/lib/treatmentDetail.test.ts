import { describe, expect, it } from 'vitest'
import {
  TREATMENT_DETAIL_MIN_ERROR,
  treatmentDetailCounter,
  treatmentDetailMeetsMinimum,
} from './treatmentDetail'

describe('treatmentDetailCounter', () => {
  it('shows the trimmed count against 25 and marks 25 or more as met', () => {
    expect(treatmentDetailCounter('')).toEqual({ text: '0 מתוך 25', met: false })
    expect(treatmentDetailCounter('  אא  ')).toEqual({ text: '2 מתוך 25', met: false })
    expect(treatmentDetailCounter('א'.repeat(24))).toEqual({ text: '24 מתוך 25', met: false })
    expect(treatmentDetailCounter(` ${'א'.repeat(25)} `)).toEqual({
      text: '25 מתוך 25',
      met: true,
    })
    expect(treatmentDetailCounter('א'.repeat(80))).toEqual({ text: '80 מתוך 25', met: true })
  })

  it('uses the same 25-character bar as the complete-mode error', () => {
    expect(treatmentDetailMeetsMinimum('א'.repeat(24))).toBe(false)
    expect(treatmentDetailMeetsMinimum('א'.repeat(25))).toBe(true)
    expect(TREATMENT_DETAIL_MIN_ERROR).toBe('יש להזין לפחות 25 תווים בפירוט הטיפול.')
  })
})
