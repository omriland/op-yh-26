import { describe, expect, it } from 'vitest'
import { otpUserLabel } from './otpUserTags'

describe('otpUserLabel', () => {
  it('uses a short both-label so the table column does not widen', () => {
    expect(
      otpUserLabel({ otp_login_enabled: true, otp_users_page_enabled: true }),
    ).toBe('שניהם')
  })

  it('returns login only', () => {
    expect(
      otpUserLabel({ otp_login_enabled: true, otp_users_page_enabled: false }),
    ).toBe('כניסה')
  })

  it('returns users-page only', () => {
    expect(
      otpUserLabel({ otp_login_enabled: false, otp_users_page_enabled: true }),
    ).toBe('משתמשים')
  })

  it('returns null when neither is on', () => {
    expect(
      otpUserLabel({ otp_login_enabled: false, otp_users_page_enabled: false }),
    ).toBeNull()
  })
})
