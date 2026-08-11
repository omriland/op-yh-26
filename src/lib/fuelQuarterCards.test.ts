import { describe, expect, it } from 'vitest'
import {
  parseCardNumbers,
  serializeCardNumbers,
  cardNumbersMatchCount,
  canAddCardNumber,
} from './fuelQuarterCards'

describe('parseCardNumbers / serializeCardNumbers', () => {
  it('splits newlines and commas; trims; drops empties', () => {
    expect(parseCardNumbers('A1\nB2, C3')).toEqual(['A1', 'B2', 'C3'])
    expect(serializeCardNumbers(['A1', 'B2'])).toBe('A1\nB2')
  })

  it('round-trips', () => {
    const list = ['111', '222']
    expect(parseCardNumbers(serializeCardNumbers(list))).toEqual(list)
  })
})

describe('cardNumbersMatchCount', () => {
  it('requires exact count match', () => {
    expect(cardNumbersMatchCount(['a', 'b'], 2)).toBe(true)
    expect(cardNumbersMatchCount(['a'], 2)).toBe(false)
    expect(cardNumbersMatchCount([], 0)).toBe(true)
    expect(cardNumbersMatchCount(['a'], 0)).toBe(false)
  })
})

describe('canAddCardNumber', () => {
  it('blocks empty and when already at cards count', () => {
    expect(canAddCardNumber(['a'], 2, 'b')).toBe(true)
    expect(canAddCardNumber(['a', 'b'], 2, 'c')).toBe(false)
    expect(canAddCardNumber([], 1, '  ')).toBe(false)
  })
})
