import { describe, expect, it } from 'vitest'
import {
  OTP_SMS_MESSAGE_PREFIX,
  buildOtpSmsMessage,
  otpSmsProvider,
  toTwilioDestination,
} from './otpSmsProvider'

describe('otpSmsProvider', () => {
  it('sends login OTP through Twilio', () => {
    expect(otpSmsProvider('login_device')).toBe('twilio')
  })

  it('keeps users-page OTP on Soprano', () => {
    expect(otpSmsProvider('users_page')).toBe('soprano')
  })
})

describe('buildOtpSmsMessage', () => {
  it('uses the Hebrew Even Derech copy', () => {
    expect(buildOtpSmsMessage('123456')).toBe('קוד האימות באבן דרך: 123456')
    expect(OTP_SMS_MESSAGE_PREFIX).toBe('קוד האימות באבן דרך: ')
  })
})

describe('toTwilioDestination', () => {
  it('formats an Israeli mobile as E.164 with plus', () => {
    expect(toTwilioDestination('0501234567')).toBe('+972501234567')
  })

  it('rejects a missing or invalid phone', () => {
    expect(toTwilioDestination(null)).toBeNull()
    expect(toTwilioDestination('0312345678')).toBeNull()
  })
})
