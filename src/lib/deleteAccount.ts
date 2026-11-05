import { supabase } from './supabase'
import { isImpersonating } from './impersonationStash'

/** Self-service account deletion (App Store guideline 5.1.1(v)); server: supabase/functions/delete-account. */

export type DeleteOwnAccountResult = { ok: true; simulated: boolean } | { ok: false; error: string }

export const DELETE_ACCOUNT_FAILED = 'מחיקת החשבון נכשלה. בדקו את החיבור ונסו שוב.'

/** Never from "view as" or a role preview: the session is not (only) the member's own. */
export function canDeleteOwnAccount(input: { impersonating: boolean; previewingRole: boolean }): boolean {
  return !input.impersonating && !input.previewingRole
}

export function parseDeleteAccountResponse(data: unknown, errorPayload: unknown): DeleteOwnAccountResult {
  const status = (data as { status?: unknown } | null)?.status
  if (status === 'deleted' || status === 'simulated') {
    return { ok: true, simulated: status === 'simulated' }
  }
  const message = (errorPayload as { error?: unknown } | null)?.error
  if (typeof message === 'string' && message.trim()) {
    return { ok: false, error: message }
  }
  return { ok: false, error: DELETE_ACCOUNT_FAILED }
}

export async function deleteOwnAccount(): Promise<DeleteOwnAccountResult> {
  const { data, error } = await supabase.functions.invoke('delete-account', {
    body: { confirm: true },
    headers: isImpersonating() ? { 'x-yahpaz-impersonating': '1' } : undefined,
  })
  if (!error) return parseDeleteAccountResponse(data, null)
  const ctx = (error as { context?: Response }).context
  let payload: unknown = null
  if (ctx) {
    try {
      payload = await ctx.json()
    } catch {
      /* fall through to the generic message */
    }
  }
  return parseDeleteAccountResponse(null, payload)
}
