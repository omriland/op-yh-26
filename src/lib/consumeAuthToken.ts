import type { EmailOtpType, Session } from '@supabase/supabase-js'
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

export type InviteRedeemFailure =
  | 'no_token'
  | 'server'
  | 'verify_failed'
  | 'verify_no_session'
  | 'clock_ahead'

export type InviteRedeemResult =
  | { error: null; session: Session }
  | { error: string; reason: InviteRedeemFailure; otpType?: string; clockAheadS?: number }

const LINK_INVALID = 'קישור ההזמנה אינו תקף או שפג תוקפו. בקשו הזמנה חדשה.'

export const INVITE_REDEEM_ERRORS = {
  verify_failed: 'אימות ההזמנה נכשל. נסו שוב.',
  verify_no_session:
    'האימות הצליח, אבל הדפדפן לא קיבל את ההתחברות. לחצו שוב, ואם זה חוזר פתחו את הקישור מהמייל בדפדפן Chrome.',
  clockAhead: (minutes: number) =>
    `השעון בטלפון מקדים בכ־${minutes} דקות, ולכן ההתחברות לא נשמרת. הפעילו "תאריך ושעה אוטומטיים" בהגדרות הטלפון ולחצו שוב.`,
} as const

/**
 * supabase-js treats a token as expired when the device clock says so. A
 * clock about an hour ahead makes every fresh session look expired: the
 * client refreshes it straight away and the sign-in never settles.
 */
const MAX_CLOCK_AHEAD_SECONDS = 55 * 60

/** How far the device clock is ahead of the server, from the token's iat. */
export function clockAheadSeconds(accessToken: string, nowMs: number = Date.now()): number | null {
  try {
    const part = accessToken.split('.')[1]
    if (!part) return null
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'))
    const iat = (JSON.parse(json) as { iat?: unknown }).iat
    if (typeof iat !== 'number') return null
    return Math.round(nowMs / 1000 - iat)
  } catch {
    return null
  }
}

let redeemInFlight = false

/**
 * True while a redeem is between its first request and its result. The auth
 * listener stands aside meanwhile: the redeem adopts the session itself, and
 * a listener that reads the database inside verifyOtp's callback can stall it.
 */
export function isInviteRedeemInFlight(): boolean {
  return redeemInFlight
}

/**
 * Exchange a stashed invite for a session (user-initiated).
 *
 * Durable invite_token → edge mints a fresh Auth OTP every click (reusable
 * until password is set). Legacy token_hash → one-shot verifyOtp. Success
 * always carries the verified session; anything else carries a message.
 */
export async function redeemStashedAuthToken(): Promise<InviteRedeemResult> {
  redeemInFlight = true
  try {
    const inviteToken = resolveInviteToken()
    if (inviteToken) {
      return await redeemDurableInviteToken(inviteToken)
    }

    const token = readStashedAuthToken()
    if (!token) {
      return { error: LINK_INVALID, reason: 'no_token' }
    }

    markPasswordSetupRequired(token.type === 'recovery' ? 'recovery' : 'invite')
    await signOutExistingSession()

    const verified = await verifyToken(token)
    // Keep the stash on failure so the user can retry if somehow still valid;
    // clear only on success (spent).
    if (verified.error) {
      return { error: LINK_INVALID, reason: 'verify_failed', otpType: token.type }
    }
    clearStashedAuthToken()
    return await checkVerifiedSession(verified.session, token.type)
  } finally {
    redeemInFlight = false
  }
}

async function signOutExistingSession() {
  const { data: existing } = await supabase.auth.getSession()
  if (existing.session) {
    await supabase.auth.signOut({ scope: 'local' })
  }
}

async function redeemDurableInviteToken(inviteToken: string): Promise<InviteRedeemResult> {
  markPasswordSetupRequired('invite')
  await signOutExistingSession()

  const { data, error: invokeError } = await supabase.functions.invoke('admin-users', {
    body: { action: 'redeem_invite', invite_token: inviteToken },
  })

  if (invokeError) {
    const ctx = (invokeError as { context?: Response }).context
    if (ctx) {
      try {
        const payload = (await ctx.json()) as { error?: string }
        if (payload.error) return { error: payload.error, reason: 'server' }
      } catch {
        /* fall through */
      }
    }
    return { error: INVITE_REDEEM_ERRORS.verify_failed, reason: 'server' }
  }

  const payload = data as {
    error?: string
    token_hash?: string
    type?: string
  }
  if (payload?.error) return { error: payload.error, reason: 'server' }
  if (!payload?.token_hash || !payload?.type) {
    return { error: INVITE_REDEEM_ERRORS.verify_failed, reason: 'server' }
  }

  const otp: AuthTokenFromUrl = {
    token_hash: payload.token_hash,
    type: payload.type as AuthTokenFromUrl['type'],
  }

  const verified = await verifyToken(otp)
  // Keep invite_token stashed so the same email link works again until
  // registration completes (password set clears storage + invite_pending).
  if (verified.error) {
    return { error: INVITE_REDEEM_ERRORS.verify_failed, reason: 'verify_failed', otpType: otp.type }
  }
  return checkVerifiedSession(verified.session, otp.type)
}

async function checkVerifiedSession(
  session: Session | null,
  otpType: string,
): Promise<InviteRedeemResult> {
  if (!session?.access_token) {
    return { error: INVITE_REDEEM_ERRORS.verify_no_session, reason: 'verify_no_session', otpType }
  }
  const ahead = clockAheadSeconds(session.access_token)
  if (ahead != null && ahead > MAX_CLOCK_AHEAD_SECONDS) {
    await supabase.auth.signOut({ scope: 'local' })
    return {
      error: INVITE_REDEEM_ERRORS.clockAhead(Math.round(ahead / 60)),
      reason: 'clock_ahead',
      otpType,
      clockAheadS: ahead,
    }
  }
  return { error: null, session }
}

async function verifyToken(
  token: AuthTokenFromUrl,
): Promise<{ session: Session | null; error: unknown }> {
  const types: AuthTokenFromUrl['type'][] = [token.type]
  if (token.type === 'invite') types.push('signup')
  if (token.type === 'magiclink') types.push('email', 'signup')

  let error: unknown = null
  for (const type of types) {
    const result = await supabase.auth.verifyOtp({
      token_hash: token.token_hash,
      type: type as EmailOtpType,
    })
    if (!result.error) return { session: result.data.session, error: null }
    error = result.error
  }
  return { session: null, error }
}
