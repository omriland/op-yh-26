import { describe, expect, it } from 'vitest'
import { loginOtpCheck } from './loginOtpGate'

const base = {
  signedIn: true,
  passwordSetup: false,
  impersonating: false,
  otpLoginEnabled: true,
  userId: 'user-1',
  clearedUserId: null as string | null,
}

describe('loginOtpCheck', () => {
  it('checks OTP on a fresh sign-in', () => {
    expect(loginOtpCheck(base)).toBe('check')
  })

  it('does not restart the gate when the same user is signed in again', () => {
    // Tab focus makes Supabase emit SIGNED_IN with a new session object.
    // Restarting the gate unmounts the app and drops an open form.
    expect(loginOtpCheck({ ...base, clearedUserId: 'user-1' })).toBe('keep')
  })

  it('checks again for a different user', () => {
    expect(loginOtpCheck({ ...base, userId: 'user-2', clearedUserId: 'user-1' })).toBe('check')
  })

  it('idles when nobody is signed in or a password still has to be chosen', () => {
    expect(loginOtpCheck({ ...base, signedIn: false })).toBe('idle')
    expect(loginOtpCheck({ ...base, passwordSetup: true })).toBe('idle')
  })

  it('skips the gate when login OTP is off or the actor is impersonating', () => {
    expect(loginOtpCheck({ ...base, otpLoginEnabled: false })).toBe('ok')
    expect(loginOtpCheck({ ...base, impersonating: true })).toBe('ok')
  })
})
