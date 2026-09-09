import { describe, expect, it } from 'vitest'
import { alertStatusForToastTone, formatToastMessage, isStickyToastTone } from './toastAlert'

describe('alertStatusForToastTone', () => {
  it('maps product tones to HeroUI Alert status', () => {
    expect(alertStatusForToastTone('done')).toBe('success')
    expect(alertStatusForToastTone('alert')).toBe('danger')
    expect(alertStatusForToastTone('info')).toBe('accent')
    expect(alertStatusForToastTone('warning')).toBe('warning')
  })
})

describe('isStickyToastTone', () => {
  it('keeps error toasts dismissible and longer-lived', () => {
    expect(isStickyToastTone('alert')).toBe(true)
    expect(isStickyToastTone('done')).toBe(false)
    expect(isStickyToastTone('info')).toBe(false)
    expect(isStickyToastTone('warning')).toBe(false)
  })
})

describe('formatToastMessage', () => {
  it('strips a trailing period from a one-sentence toast', () => {
    expect(formatToastMessage('האירוע נשמר.')).toBe('האירוע נשמר')
    expect(formatToastMessage('האירוע נמחק。')).toBe('האירוע נמחק')
    expect(formatToastMessage('  הדיווח הושלם.  ')).toBe('הדיווח הושלם')
  })

  it('leaves messages without a trailing sentence period unchanged', () => {
    expect(formatToastMessage('האירוע נשמר')).toBe('האירוע נשמר')
    expect(formatToastMessage('הגרסה עודכנה ל־1.2')).toBe('הגרסה עודכנה ל־1.2')
  })

  it('keeps multi-sentence copy including its trailing period', () => {
    expect(formatToastMessage('שמירת האירוע נכשלה. בדקו את החיבור ונסו שוב.')).toBe(
      'שמירת האירוע נכשלה. בדקו את החיבור ונסו שוב.',
    )
    expect(formatToastMessage('שגיאה. נסו שוב!')).toBe('שגיאה. נסו שוב!')
  })

  it('does not treat a numeric decimal as a sentence break', () => {
    expect(formatToastMessage('הגרסה עודכנה ל־1.2.')).toBe('הגרסה עודכנה ל־1.2')
  })

  it('does not strip a mid-message abbreviation or number period', () => {
    expect(formatToastMessage('עודכן ע״י א. כהן.')).toBe('עודכן ע״י א. כהן.')
    expect(formatToastMessage('נשלחו 3. נכשלו 1.')).toBe('נשלחו 3. נכשלו 1.')
  })
})
