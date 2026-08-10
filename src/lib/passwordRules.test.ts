import { describe, expect, it } from 'vitest'
import { passwordStrengthError, validatePasswordStrength } from './passwordRules'

describe('validatePasswordStrength', () => {
  it('accepts a password that meets all rules', () => {
    expect(validatePasswordStrength('Abcdef!1')).toEqual({ ok: true })
  })

  it('rejects passwords shorter than 8 characters', () => {
    expect(validatePasswordStrength('Ab!1')).toEqual({
      ok: false,
      missing: ['minLength'],
    })
  })

  it('rejects passwords without an uppercase letter', () => {
    expect(validatePasswordStrength('abcdef!1')).toEqual({
      ok: false,
      missing: ['uppercase'],
    })
  })

  it('rejects passwords without a symbol', () => {
    expect(validatePasswordStrength('Abcdefg1')).toEqual({
      ok: false,
      missing: ['symbol'],
    })
  })

  it('reports every missing rule together', () => {
    expect(validatePasswordStrength('abc')).toEqual({
      ok: false,
      missing: ['minLength', 'uppercase', 'symbol'],
    })
  })

  it('does not treat digits as symbols', () => {
    expect(validatePasswordStrength('Abcdefgh1')).toEqual({
      ok: false,
      missing: ['symbol'],
    })
  })
})

describe('passwordStrengthError', () => {
  it('returns null when valid', () => {
    expect(passwordStrengthError('Abcdef!1')).toBeNull()
  })

  it('lists only the missing requirements in Hebrew', () => {
    expect(passwordStrengthError('abcdefgh')).toBe(
      'הסיסמה אינה עומדת בדרישות. יש לכלול: אות גדולה ותו מיוחד (למשל !).',
    )
  })

  it('names a single missing requirement', () => {
    expect(passwordStrengthError('Abcdefgh')).toBe(
      'הסיסמה אינה עומדת בדרישות. יש לכלול: תו מיוחד (למשל !).',
    )
  })

  it('names all three missing requirements', () => {
    expect(passwordStrengthError('abc')).toBe(
      'הסיסמה אינה עומדת בדרישות. יש לכלול: 8 תווים לפחות, אות גדולה ותו מיוחד (למשל !).',
    )
  })
})
