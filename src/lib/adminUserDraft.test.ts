import { describe, expect, it } from 'vitest'
import { canSubmitCreateUser, createUserEmailError } from './adminUserDraft'

const complete = {
  full_name: 'דנה כהן',
  email: 'dana@example.com',
  callsign: 'D1',
  phone: '050-1234567',
}

describe('canSubmitCreateUser', () => {
  it('is true only when name, callsign, email, and a 10-digit phone are filled', () => {
    expect(canSubmitCreateUser(complete)).toBe(true)
  })

  it('is false when any required field is empty or whitespace', () => {
    expect(canSubmitCreateUser({ ...complete, full_name: '' })).toBe(false)
    expect(canSubmitCreateUser({ ...complete, full_name: '   ' })).toBe(false)
    expect(canSubmitCreateUser({ ...complete, callsign: '' })).toBe(false)
    expect(canSubmitCreateUser({ ...complete, callsign: '  ' })).toBe(false)
    expect(canSubmitCreateUser({ ...complete, email: '' })).toBe(false)
    expect(canSubmitCreateUser({ ...complete, email: '  ' })).toBe(false)
    expect(canSubmitCreateUser({ ...complete, phone: '' })).toBe(false)
  })

  it('is false when the phone is only partially filled', () => {
    expect(canSubmitCreateUser({ ...complete, phone: '050-123' })).toBe(false)
  })

  it('is false when the email is not a valid address', () => {
    expect(canSubmitCreateUser({ ...complete, email: 'not-an-email' })).toBe(false)
    expect(canSubmitCreateUser({ ...complete, email: 'dana@' })).toBe(false)
    expect(canSubmitCreateUser({ ...complete, email: 'dana@gmail' })).toBe(false)
  })
})

describe('createUserEmailError', () => {
  it('is silent while the field is empty', () => {
    expect(createUserEmailError('')).toBeNull()
    expect(createUserEmailError('   ')).toBeNull()
  })

  it('explains an invalid address while typing', () => {
    expect(createUserEmailError('dana')).toBe('יש להזין כתובת דוא״ל תקינה.')
    expect(createUserEmailError('dana@gmail')).toBe('יש להזין כתובת דוא״ל תקינה.')
  })

  it('is silent for a valid address', () => {
    expect(createUserEmailError('dana@example.com')).toBeNull()
    expect(createUserEmailError(' dana+tag@example.co.il ')).toBeNull()
  })
})
