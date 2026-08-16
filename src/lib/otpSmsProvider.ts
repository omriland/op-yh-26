import { toE164IlMobile } from './phoneE164'

export type OtpSmsPurpose = 'login_device' | 'users_page'
export type OtpSmsProvider = 'twilio' | 'soprano'

export const OTP_SMS_MESSAGE_PREFIX = 'קוד האימות באבן דרך: '

/** Login + users-page OTP use Twilio. Unit broadcasts stay on Soprano. */
export function otpSmsProvider(purpose: OtpSmsPurpose): OtpSmsProvider {
  switch (purpose) {
    case 'login_device':
    case 'users_page':
      return 'twilio'
  }
}

export function buildOtpSmsMessage(code: string): string {
  return `${OTP_SMS_MESSAGE_PREFIX}${code}`
}

/** Twilio Messages API wants E.164 with a leading +. */
export function toTwilioDestination(raw: string | null | undefined): string | null {
  return toE164IlMobile(raw)
}
