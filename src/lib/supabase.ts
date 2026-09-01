import { createClient } from '@supabase/supabase-js'
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
