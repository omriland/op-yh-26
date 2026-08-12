import { describe, expect, it } from 'vitest'
import { isValidIlMobile, maskIlMobile, toE164IlMobile } from './phoneE164'

describe('toE164IlMobile', () => {
  it('converts 05x local mobile to +972', () => {
    expect(toE164IlMobile('0501234567')).toBe('+972501234567')
    expect(toE164IlMobile('051-234-5678')).toBe('+972512345678')
  })

  it('rejects landlines, short, and empty', () => {
    expect(toE164IlMobile('0412345678')).toBeNull()
    expect(toE164IlMobile('050123456')).toBeNull()
    expect(toE164IlMobile('')).toBeNull()
    expect(toE164IlMobile(null)).toBeNull()
  })
})

describe('isValidIlMobile', () => {
  it('accepts 05x 10-digit mobiles only', () => {
    expect(isValidIlMobile('0501234567')).toBe(true)
    expect(isValidIlMobile('0412345678')).toBe(false)
    expect(isValidIlMobile(undefined)).toBe(false)
  })
})

describe('maskIlMobile', () => {
  it('masks middle digits as 050-***-4567', () => {
    expect(maskIlMobile('0501234567')).toBe('050-***-4567')
  })

  it('returns null for invalid', () => {
    expect(maskIlMobile('123')).toBeNull()
  })
})
