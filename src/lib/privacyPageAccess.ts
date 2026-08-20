import { supabase } from './supabase'

/** Ask Edge whether an Android-minted /privacy?t= token is valid. */
export async function verifyPrivacyPageAccess(token: string): Promise<boolean> {
  const trimmed = token.trim()
  if (!trimmed) return false
  const { data, error } = await supabase.functions.invoke('privacy-policy', {
    body: { token: trimmed },
  })
  if (error) return false
  return (data as { ok?: unknown } | null)?.ok === true
}
