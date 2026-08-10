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
 */
export async function consumeAuthTokenFromUrl(): Promise<{ error: string | null }> {
  const token = readAuthTokenFromUrl()
  if (!token) return { error: null }

  markPasswordSetupRequired(token.type === 'recovery' ? 'recovery' : 'invite')

  const { error } = await supabase.auth.verifyOtp({
    token_hash: token.token_hash,
    type: token.type as EmailOtpType,
  })

  // Always strip — avoids verify loops on refresh with a spent token.
  stripPasswordSetupFromUrl()

  if (error) {
    return { error: 'קישור ההזמנה אינו תקף או שפג תוקפו. בקשו הזמנה חדשה.' }
  }
  return { error: null }
}
