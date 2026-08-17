import { describe, expect, it } from 'vitest'
import {
  AVAILABILITY_DATE_ERROR,
  applyDueAvailabilityRow,
  effectiveAvailability,
  isSameAvailabilityWrite,
  isValidReturnDate,
  availabilityLabel,
  availabilityReturnCaption,
  availabilitySearchLabel,
  buildAvailabilityWrite,
  mapAvailabilityHoverLabel,
  shouldCloseAvailabilityEditor,
} from './availability'

describe('effectiveAvailability', () => {
  const today = '2026-08-17'

  it('treats stored available as זמין', () => {
    expect(effectiveAvailability('available', null, today)).toBe('available')
  })

  it('treats unavailable with no date as לא זמין', () => {
    expect(effectiveAvailability('unavailable', null, today)).toBe('unavailable')
  })

  it('treats unavailable with a future date as לא זמין', () => {
    expect(effectiveAvailability('unavailable', '2026-08-20', today)).toBe('unavailable')
  })

  it('treats unavailable with today or a past date as זמין', () => {
    expect(effectiveAvailability('unavailable', today, today)).toBe('available')
    expect(effectiveAvailability('unavailable', '2026-08-16', today)).toBe('available')
  })
})

describe('availability labels', () => {
  it('uses זמין / לא זמין', () => {
    expect(availabilityLabel('available')).toBe('זמין')
    expect(availabilityLabel('unavailable')).toBe('לא זמין')
  })

  it('formats a return caption', () => {
    expect(availabilityReturnCaption('2026-08-20')).toBe('חזרה ב־20.08.2026')
    expect(availabilityReturnCaption(null)).toBeNull()
  })

  it('search labels follow effective status', () => {
    expect(availabilitySearchLabel('available', null, '2026-08-17')).toBe('זמין')
    expect(availabilitySearchLabel('unavailable', null, '2026-08-17')).toBe('לא זמין')
    expect(availabilitySearchLabel('unavailable', '2026-08-20', '2026-08-17')).toBe('לא זמין')
    expect(availabilitySearchLabel('unavailable', '2026-08-17', '2026-08-17')).toBe('זמין')
  })

  it('map hover is empty when effectively זמין', () => {
    expect(mapAvailabilityHoverLabel('available', null, '2026-08-17')).toBeNull()
    expect(mapAvailabilityHoverLabel('unavailable', '2026-08-17', '2026-08-17')).toBeNull()
  })

  it('map hover is לא זמין with no return date', () => {
    expect(mapAvailabilityHoverLabel('unavailable', null, '2026-08-17')).toBe('לא זמין')
  })

  it('map hover includes the return date when present', () => {
    expect(mapAvailabilityHoverLabel('unavailable', '2026-08-20', '2026-08-17')).toBe(
      'לא זמין עד 20.08.2026',
    )
  })
})

describe('isValidReturnDate', () => {
  const today = '2026-08-17'

  it('rejects today and the past', () => {
    expect(isValidReturnDate(today, today)).toBe(false)
    expect(isValidReturnDate('2026-08-16', today)).toBe(false)
  })

  it('accepts tomorrow', () => {
    expect(isValidReturnDate('2026-08-18', today)).toBe(true)
  })
})

describe('buildAvailabilityWrite', () => {
  const today = '2026-08-17'

  it('clears the date when setting זמין', () => {
    expect(buildAvailabilityWrite({ status: 'available', availableFrom: '2026-08-20', today })).toEqual({
      ok: true,
      availability: 'available',
      available_from: null,
    })
  })

  it('allows לא זמין with no date', () => {
    expect(buildAvailabilityWrite({ status: 'unavailable', availableFrom: '', today })).toEqual({
      ok: true,
      availability: 'unavailable',
      available_from: null,
    })
  })

  it('rejects today as a return date', () => {
    expect(buildAvailabilityWrite({ status: 'unavailable', availableFrom: today, today })).toEqual({
      ok: false,
      error: AVAILABILITY_DATE_ERROR,
    })
  })

  it('accepts tomorrow as a return date', () => {
    expect(
      buildAvailabilityWrite({ status: 'unavailable', availableFrom: '2026-08-18', today }),
    ).toEqual({
      ok: true,
      availability: 'unavailable',
      available_from: '2026-08-18',
    })
  })
})

describe('shouldCloseAvailabilityEditor', () => {
  it('closes after זמין and stays open after לא זמין so a return date can be set', () => {
    expect(shouldCloseAvailabilityEditor('available')).toBe(true)
    expect(shouldCloseAvailabilityEditor('unavailable')).toBe(false)
  })
})

describe('isSameAvailabilityWrite', () => {
  it('treats matching status and return date as unchanged', () => {
    expect(
      isSameAvailabilityWrite(
        { availability: 'unavailable', available_from: '2026-08-20' },
        { availability: 'unavailable', available_from: '2026-08-20' },
      ),
    ).toBe(true)
    expect(
      isSameAvailabilityWrite(
        { availability: 'available', available_from: null },
        { availability: 'unavailable', available_from: null },
      ),
    ).toBe(false)
  })
})

describe('applyDueAvailabilityRow', () => {
  const today = '2026-08-17'

  it('flips due rows to available', () => {
    expect(applyDueAvailabilityRow('unavailable', today, today)).toEqual({
      availability: 'available',
      available_from: null,
    })
    expect(applyDueAvailabilityRow('unavailable', '2026-08-16', today)).toEqual({
      availability: 'available',
      available_from: null,
    })
  })

  it('leaves future and open-ended unavailable', () => {
    expect(applyDueAvailabilityRow('unavailable', '2026-08-20', today)).toEqual({
      availability: 'unavailable',
      available_from: '2026-08-20',
    })
    expect(applyDueAvailabilityRow('unavailable', null, today)).toEqual({
      availability: 'unavailable',
      available_from: null,
    })
  })
})
