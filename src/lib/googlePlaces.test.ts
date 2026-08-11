import { describe, expect, it } from 'vitest'
import { formatPlaceLabel } from './googlePlaces'

describe('formatPlaceLabel', () => {
  it('uses formatted address alone when display name repeats the street', () => {
    expect(formatPlaceLabel('הכרמל 11', 'הכרמל 11, כפר סבא')).toBe('הכרמל 11, כפר סבא')
  })

  it('keeps name + address when they differ (named place)', () => {
    expect(formatPlaceLabel('קניון איילון', 'דרך זאב ז׳בוטינסקי 171, רמת גן')).toBe(
      'קניון איילון, דרך זאב ז׳בוטינסקי 171, רמת גן',
    )
  })

  it('falls back to whichever side exists', () => {
    expect(formatPlaceLabel('הכרמל 11', '')).toBe('הכרמל 11')
    expect(formatPlaceLabel('', 'כפר סבא')).toBe('כפר סבא')
    expect(formatPlaceLabel('', '', 'fallback')).toBe('fallback')
  })
})
