import { describe, expect, it } from 'vitest'
import { isSelectSearchNavKey, nextActiveIndex } from './selectFieldNav'

describe('nextActiveIndex', () => {
  it('steps one option at a time and clamps to the ends', () => {
    expect(nextActiveIndex(0, 4, 1)).toBe(1)
    expect(nextActiveIndex(1, 4, 1)).toBe(2)
    expect(nextActiveIndex(3, 4, 1)).toBe(3)
    expect(nextActiveIndex(2, 4, -1)).toBe(1)
    expect(nextActiveIndex(0, 4, -1)).toBe(0)
  })

  it('resets an out-of-range index onto the filtered list', () => {
    expect(nextActiveIndex(50, 3, 1)).toBe(1)
    expect(nextActiveIndex(-1, 3, 1)).toBe(1)
    expect(nextActiveIndex(0, 0, 1)).toBe(-1)
  })
})

describe('isSelectSearchNavKey', () => {
  it('lets the search field keep Home/End for the caret', () => {
    expect(isSelectSearchNavKey('ArrowDown')).toBe(true)
    expect(isSelectSearchNavKey('Home')).toBe(false)
    expect(isSelectSearchNavKey('End')).toBe(false)
    expect(isSelectSearchNavKey('a')).toBe(false)
  })
})
