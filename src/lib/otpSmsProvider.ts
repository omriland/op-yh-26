import { toE164IlMobile } from './phoneE164'

export type OtpSmsPurpose = 'login_device' | 'users_page'
export type OtpSmsProvider = 'twilio' | 'soprano'

export const OTP_SMS_MESSAGE_PREFIX = 'קוד האימות באבן דרך: '

export function otpSmsProvider(purpose: OtpSmsPurpose): OtpSmsProvider {
  return purpose === 'login_device' ? 'twilio' : 'soprano'
}

export function buildOtpSmsMessage(code: string): string {
  return `${OTP_SMS_MESSAGE_PREFIX}${code}`
}

/** Twilio Messages API wants E.164 with a leading +. */
export function toTwilioDestination(raw: string | null | undefined): string | null {
  return toE164IlMobile(raw)
}
