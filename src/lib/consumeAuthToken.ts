import type { EmailOtpType } from '@supabase/supabase-js'
import {
  markPasswordSetupRequired,
  readAuthTokenFromUrl,
  stripPasswordSetupFromUrl,
} from './passwordSetup'
import { supabase } from './supabase'

/**
 * Exchange a first-party invite/recovery link (`?token_hash=&type=`) for a
 * session via verifyOtp, then strip the one-time params from the URL.
 *
 * Works in a clean browser (incognito) and when another session is already
 * open: any prior session is signed out first so the invite token can bind.
 */
export async function consumeAuthTokenFromUrl(): Promise<{ error: string | null }> {
  const token = readAuthTokenFromUrl()
  if (!token) return { error: null }

  markPasswordSetupRequired(token.type === 'recovery' ? 'recovery' : 'invite')

  const { data: existing } = await supabase.auth.getSession()
  if (existing.session) {
    // Local sign-out only — do not clear password-setup intent (AuthProvider
    // must keep the set-password gate across this transition).
    await supabase.auth.signOut({ scope: 'local' })
  }

  let error = (
    await supabase.auth.verifyOtp({
      token_hash: token.token_hash,
      type: token.type as EmailOtpType,
    })
  ).error

  // generateLink(invite) occasionally verifies as signup depending on Auth version.
  if (error && token.type === 'invite') {
    error = (
      await supabase.auth.verifyOtp({
        token_hash: token.token_hash,
        type: 'signup',
      })
    ).error
  }

  // Strip only after attempt — avoids verify loops on refresh with a spent token.
  stripPasswordSetupFromUrl()

  if (error) {
    return { error: 'קישור ההזמנה אינו תקף או שפג תוקפו. בקשו הזמנה חדשה.' }
  }
  return { error: null }
}
