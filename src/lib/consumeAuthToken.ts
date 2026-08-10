import type { EmailOtpType } from '@supabase/supabase-js'
import {
  markPasswordSetupRequired,
  readAuthTokenFromUrl,
  readStashedAuthToken,
  stashAuthToken,
  clearStashedAuthToken,
  stripPasswordSetupFromUrl,
  type AuthTokenFromUrl,
} from './passwordSetup'
import { supabase } from './supabase'

/**
 * Capture invite/recovery token_hash from the URL into sessionStorage and
 * strip it immediately — do NOT verify yet.
 *
 * Email security scanners often open links and would burn a one-time OTP if
 * we called verifyOtp on page load. The user must click to redeem.
 */
export function stashAuthTokenFromUrl(): boolean {
  const token = readAuthTokenFromUrl()
  if (!token) return false

  stashAuthToken(token)
  markPasswordSetupRequired(token.type === 'recovery' ? 'recovery' : 'invite')
  stripPasswordSetupFromUrl()
  return true
}

/** True when a stashed OTP is waiting for an explicit user click. */
export function hasStashedAuthToken(): boolean {
  return readStashedAuthToken() !== null
}

/**
 * Exchange the stashed invite/recovery token for a session (user-initiated).
 */
export async function redeemStashedAuthToken(): Promise<{ error: string | null }> {
  const token = readStashedAuthToken()
  if (!token) {
    return { error: 'קישור ההזמנה אינו תקף או שפג תוקפו. בקשו הזמנה חדשה.' }
  }

  markPasswordSetupRequired(token.type === 'recovery' ? 'recovery' : 'invite')

  const { data: existing } = await supabase.auth.getSession()
  if (existing.session) {
    await supabase.auth.signOut({ scope: 'local' })
  }

  const error = await verifyToken(token)
  clearStashedAuthToken()

  if (error) {
    return { error: 'קישור ההזמנה אינו תקף או שפג תוקפו. בקשו הזמנה חדשה.' }
  }
  return { error: null }
}

async function verifyToken(token: AuthTokenFromUrl) {
  let error = (
    await supabase.auth.verifyOtp({
      token_hash: token.token_hash,
      type: token.type as EmailOtpType,
    })
  ).error

  if (error && token.type === 'invite') {
    error = (
      await supabase.auth.verifyOtp({
        token_hash: token.token_hash,
        type: 'signup',
      })
    ).error
  }

  return error
}
