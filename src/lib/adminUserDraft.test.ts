import { describe, expect, it } from 'vitest'
import {
  canEditUserEmail,
  canSubmitCreateUser,
  createUserEmailError,
  emailsDiffer,
  userEmailFieldHint,
} from './adminUserDraft'

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

describe('canEditUserEmail', () => {
  it('is always true on create', () => {
    expect(canEditUserEmail(true, false)).toBe(true)
    expect(canEditUserEmail(true, true)).toBe(true)
  })

  it('is true for an existing user only when the actor is Super Admin', () => {
    expect(canEditUserEmail(false, true)).toBe(true)
    expect(canEditUserEmail(false, false)).toBe(false)
  })
})

describe('userEmailFieldHint', () => {
  it('explains invite on create and lock vs Super Admin change on edit', () => {
    expect(userEmailFieldHint(true, false)).toBe('נשלחת הזמנה לכתובת זו.')
    expect(userEmailFieldHint(false, false)).toBe('לא ניתן לשנות דוא״ל לאחר יצירה.')
    expect(userEmailFieldHint(false, true)).toBe('שינוי דוא״ל מעדכן גם את פרטי ההתחברות.')
  })
})

describe('emailsDiffer', () => {
  it('ignores case and surrounding whitespace', () => {
    expect(emailsDiffer('Dana@Example.com', ' dana@example.com ')).toBe(false)
    expect(emailsDiffer('a@x.com', 'b@x.com')).toBe(true)
  })
})
