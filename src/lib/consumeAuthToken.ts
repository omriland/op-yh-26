import type { EmailOtpType } from '@supabase/supabase-js'
import {
  markPasswordSetupRequired,
  readAuthTokenFromUrl,
  readInviteTokenFromUrl,
  readStashedAuthToken,
  resolveInviteToken,
  stashAuthToken,
  stashInviteToken,
  clearStashedAuthToken,
  stripPasswordSetupFromUrl,
  type AuthTokenFromUrl,
} from './passwordSetup'
import { supabase } from './supabase'

/**
 * Capture invite_token (durable) and/or legacy token_hash from the URL into
 * sessionStorage, then strip the URL. Never verify Auth OTP on load.
 */
export function stashAuthTokenFromUrl(): boolean {
  const inviteToken = readInviteTokenFromUrl()
  const otp = readAuthTokenFromUrl()

  if (inviteToken) {
    stashInviteToken(inviteToken)
    markPasswordSetupRequired('invite')
  }

  if (otp) {
    stashAuthToken(otp)
    markPasswordSetupRequired(otp.type === 'recovery' ? 'recovery' : 'invite')
  }

  if (!inviteToken && !otp) return false

  stripPasswordSetupFromUrl()
  return true
}

export function hasRedeemableInvite(): boolean {
  return Boolean(resolveInviteToken() || readStashedAuthToken())
}

/**
 * Exchange a stashed invite for a session (user-initiated).
 *
 * Durable invite_token → edge mints a fresh Auth OTP every click (reusable
 * until password is set). Legacy token_hash → one-shot verifyOtp.
 */
export async function redeemStashedAuthToken(): Promise<{ error: string | null }> {
  const inviteToken = resolveInviteToken()
  if (inviteToken) {
    return redeemDurableInviteToken(inviteToken)
  }

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
  // Keep the stash on failure so the user can retry if somehow still valid;
  // clear only on success (spent).
  if (!error) clearStashedAuthToken()

  if (error) {
    return { error: 'קישור ההזמנה אינו תקף או שפג תוקפו. בקשו הזמנה חדשה.' }
  }
  return { error: null }
}

async function redeemDurableInviteToken(inviteToken: string): Promise<{ error: string | null }> {
  markPasswordSetupRequired('invite')

  const { data: existing } = await supabase.auth.getSession()
  if (existing.session) {
    await supabase.auth.signOut({ scope: 'local' })
  }

  const { data, error: invokeError } = await supabase.functions.invoke('admin-users', {
    body: { action: 'redeem_invite', invite_token: inviteToken },
  })

  if (invokeError) {
    const ctx = (invokeError as { context?: Response }).context
    if (ctx) {
      try {
        const payload = (await ctx.json()) as { error?: string }
        if (payload.error) return { error: payload.error }
      } catch {
        /* fall through */
      }
    }
    return { error: 'אימות ההזמנה נכשל. נסו שוב.' }
  }

  const payload = data as {
    error?: string
    token_hash?: string
    type?: string
  }
  if (payload?.error) return { error: payload.error }
  if (!payload?.token_hash || !payload?.type) {
    return { error: 'אימות ההזמנה נכשל. נסו שוב.' }
  }

  const otp: AuthTokenFromUrl = {
    token_hash: payload.token_hash,
    type: payload.type as AuthTokenFromUrl['type'],
  }

  const error = await verifyToken(otp)
  // Keep invite_token stashed so the same email link works again until
  // registration completes (password set clears storage + invite_pending).
  if (error) {
    return { error: 'אימות ההזמנה נכשל. נסו שוב.' }
  }
  return { error: null }
}

async function verifyToken(token: AuthTokenFromUrl) {
  const types: AuthTokenFromUrl['type'][] = [token.type]
  if (token.type === 'invite') types.push('signup')
  if (token.type === 'magiclink') types.push('email', 'signup')

  let error: Awaited<ReturnType<typeof supabase.auth.verifyOtp>>['error'] = null
  for (const type of types) {
    error = (
      await supabase.auth.verifyOtp({
        token_hash: token.token_hash,
        type: type as EmailOtpType,
      })
    ).error
    if (!error) return null
  }
  return error
}
