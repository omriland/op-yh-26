import { describe, expect, it } from 'vitest'
import {
  setPasswordTargetIdentity,
  setPasswordTargetWarnings,
} from './setPasswordTarget'

const igorWork = {
  id: 'bbcae35d-7fee-4949-b9b2-5812ea4f4d4c',
  full_name: 'יגאל שניידר',
  email: 'igors@carmelship.co.il',
  callsign: '942',
  active: false,
}

const igorGmail = {
  id: '7c8abbac-ca70-4cb3-a392-b9502ffcf3f0',
  full_name: 'יגאל שניידר',
  email: 'igor76@gmail.com',
  callsign: '942',
  active: true,
}

const unrelated = {
  id: '11111111-1111-1111-1111-111111111111',
  full_name: 'דני כהן',
  email: 'dani@example.com',
  callsign: '100',
  active: true,
}

describe('setPasswordTargetIdentity', () => {
  it('shows name, email, and callsign so duplicate names are distinguishable', () => {
    expect(setPasswordTargetIdentity(igorWork)).toBe(
      'יגאל שניידר · igors@carmelship.co.il · או״ק 942',
    )
  })
})

describe('setPasswordTargetWarnings', () => {
  it('warns when the target is inactive', () => {
    expect(setPasswordTargetWarnings(igorWork, [igorWork])).toContain(
      'משתמש זה מושבת. הגדרת הסיסמה לא תפעיל אותו.',
    )
  })

  it('warns when another account shares the same name or callsign', () => {
    const warnings = setPasswordTargetWarnings(igorWork, [igorWork, igorGmail, unrelated])
    expect(warnings.some((line) => line.includes('igor76@gmail.com'))).toBe(true)
    expect(warnings.some((line) => line.includes('ודאו שזה החשבון הנכון'))).toBe(true)
  })

  it('does not warn about unrelated users', () => {
    const warnings = setPasswordTargetWarnings(igorGmail, [igorGmail, unrelated])
    expect(warnings.some((line) => line.includes('dani@example.com'))).toBe(false)
  })
})
