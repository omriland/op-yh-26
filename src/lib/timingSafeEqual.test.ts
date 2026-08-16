import { describe, expect, it } from 'vitest'
import { timingSafeEqual } from './timingSafeEqual'

describe('timingSafeEqual', () => {
  it('returns true for identical strings', () => {
    expect(timingSafeEqual('Abcdef!1', 'Abcdef!1')).toBe(true)
  })

  it('returns true for two empty strings', () => {
    expect(timingSafeEqual('', '')).toBe(true)
  })

  it('returns false when the same-length strings differ', () => {
    expect(timingSafeEqual('Abcdef!1', 'Abcdef!2')).toBe(false)
  })

  it('returns false when lengths differ', () => {
    expect(timingSafeEqual('Abcdef!1', 'Abcdef!12')).toBe(false)
  })

  it('compares Unicode by UTF-8 bytes', () => {
    expect(timingSafeEqual('סיסמה!', 'סיסמה!')).toBe(true)
    expect(timingSafeEqual('סיסמה!', 'סיסמה?')).toBe(false)
  })
})
