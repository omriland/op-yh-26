import { createClient } from '@supabase/supabase-js'
import { authStorage } from './authStorage'
import { capturePasswordSetupIntentFromUrl } from './passwordSetup'

// Capture invite/recovery markers before the client consumes the URL hash.
capturePasswordSetupIntentFromUrl()

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anon) {
  console.warn('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
}

export const supabase = createClient(url ?? '', anon ?? '', {
  auth: {
    persistSession: true,
    storage: authStorage,
    // Durable invite URLs use ?type=invite without an Auth token_hash.
    // Do not treat them as implicit-grant callbacks.
    detectSessionInUrl: (callbackUrl) => {
      if (callbackUrl.searchParams.has('invite_token')) return false
      const hash = new URLSearchParams(callbackUrl.hash.replace(/^#/, ''))
      return Boolean(
        callbackUrl.searchParams.get('access_token') ||
          hash.get('access_token') ||
          callbackUrl.searchParams.get('error') ||
          hash.get('error') ||
          callbackUrl.searchParams.get('error_code') ||
          hash.get('error_code') ||
          callbackUrl.searchParams.get('error_description') ||
          hash.get('error_description'),
      )
    },
  },
})

/**
 * Fill-email links authenticate with `fill_token`, not a user session.
 * A stored access token is often already expired when the volunteer reopens
 * the mail, and the Edge gateway then answers "jwt expired" — the app shows
 * that as an expired fill link. This client never sends a user JWT.
 */
export const supabaseAnon = createClient(url ?? '', anon ?? '', {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
})
