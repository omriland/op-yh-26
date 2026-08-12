import { isImpersonating } from './impersonationStash'
import { readOtpDeviceToken, writeOtpDeviceToken } from './otpDeviceToken'
import { supabase } from './supabase'

export type OtpPurpose = 'login_device' | 'users_page'

export type OtpStatus = {
  loginRequired: boolean
  usersPageRequired: boolean
  maskedPhone: string | null
}

type CallResult<T> = { ok: true; data: T } | { ok: false; error: string }

async function callPhoneOtp(
  body: Record<string, unknown>,
): Promise<CallResult<Record<string, unknown>>> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (sessionError || !token) {
    return { ok: false, error: 'יש להתחבר מחדש.' }
  }

  const headers: Record<string, string> = {}
  const deviceToken = readOtpDeviceToken()
  if (deviceToken) headers['x-yahpaz-otp-device'] = deviceToken
  if (isImpersonating()) headers['x-yahpaz-impersonating'] = '1'

  const { data, error } = await supabase.functions.invoke('phone-otp', {
    body,
    headers,
  })

  if (error) {
    const ctx = (error as { context?: Response }).context
    if (ctx) {
      try {
        const payload = (await ctx.json()) as { error?: string }
        if (payload.error) return { ok: false, error: payload.error }
      } catch {
        /* fall through */
      }
    }
    return { ok: false, error: 'הפעולה נכשלה. בדקו את החיבור ונסו שוב.' }
  }

  const payload = data as Record<string, unknown> & { error?: string }
  if (payload?.error) return { ok: false, error: payload.error }
  return { ok: true, data: payload }
}

export async function fetchOtpStatus(): Promise<OtpStatus | { error: string }> {
  const result = await callPhoneOtp({ action: 'otp_status' })
  if (!result.ok) return { error: result.error }
  return {
    loginRequired: Boolean(result.data.loginRequired),
    usersPageRequired: Boolean(result.data.usersPageRequired),
    maskedPhone:
      typeof result.data.maskedPhone === 'string' ? result.data.maskedPhone : null,
  }
}

export async function startOtp(
  purpose: OtpPurpose,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await callPhoneOtp({ action: 'otp_start', purpose })
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true }
}

export async function verifyOtp(
  purpose: OtpPurpose,
  code: string,
): Promise<{ ok: true; deviceToken?: string } | { ok: false; error: string }> {
  const result = await callPhoneOtp({ action: 'otp_verify', purpose, code })
  if (!result.ok) return { ok: false, error: result.error }
  const deviceToken =
    typeof result.data.deviceToken === 'string' ? result.data.deviceToken : undefined
  if (purpose === 'login_device' && deviceToken) {
    writeOtpDeviceToken(deviceToken)
  }
  return { ok: true, deviceToken }
}

export async function setOtpFlags(input: {
  userId: string
  otpLoginEnabled?: boolean
  otpUsersPageEnabled?: boolean
}): Promise<{ ok: true; message?: string } | { ok: false; error: string }> {
  const body: Record<string, unknown> = {
    action: 'set_otp_flags',
    user_id: input.userId,
  }
  if (input.otpLoginEnabled !== undefined) body.otp_login_enabled = input.otpLoginEnabled
  if (input.otpUsersPageEnabled !== undefined) {
    body.otp_users_page_enabled = input.otpUsersPageEnabled
  }
  const result = await callPhoneOtp(body)
  if (!result.ok) return { ok: false, error: result.error }
  return {
    ok: true,
    message: typeof result.data.message === 'string' ? result.data.message : undefined,
  }
}
