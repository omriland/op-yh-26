import type { AppRole } from './auth'
import { canImpersonateTarget } from './impersonationEligibility'
import { supabase } from './supabase'
import {
  clearImpersonationStash,
  readImpersonationStash,
  writeImpersonationStash,
} from './impersonationStash'

export type ImpersonationTargetSummary = {
  id: string
  full_name: string
  callsign: string
}

export type ImpersonationCandidate = ImpersonationTargetSummary & {
  email: string
  active: boolean
  roles: AppRole[]
}

/** Active users the actor may become (excludes self / super_admin). */
export async function fetchImpersonationCandidates(
  actorUserId: string,
): Promise<ImpersonationCandidate[]> {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, full_name, callsign, email, active')
    .eq('active', true)
    .order('full_name')

  if (error) throw error
  const rows = profiles ?? []
  if (rows.length === 0) return []

  const ids = rows.map((row) => row.id)
  const { data: roleRows, error: roleError } = await supabase
    .from('user_roles')
    .select('user_id, role')
    .in('user_id', ids)
  if (roleError) throw roleError

  const rolesByUser = new Map<string, AppRole[]>()
  for (const row of roleRows ?? []) {
    const list = rolesByUser.get(row.user_id) ?? []
    list.push(row.role as AppRole)
    rolesByUser.set(row.user_id, list)
  }

  return rows
    .map((row) => ({
      id: row.id,
      full_name: row.full_name,
      callsign: row.callsign,
      email: row.email,
      active: row.active,
      roles: rolesByUser.get(row.id) ?? [],
    }))
    .filter((row) => canImpersonateTarget(actorUserId, row))
}

async function callImpersonation(
  body: Record<string, unknown>,
): Promise<
  | {
      ok: true
      access_token?: string
      refresh_token?: string
      target?: ImpersonationTargetSummary
    }
  | { ok: false; error: string }
> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (sessionError || !token) {
    return { ok: false, error: 'יש להתחבר מחדש.' }
  }

  const { data, error } = await supabase.functions.invoke('admin-users', { body })

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

  const payload = data as {
    error?: string
    ok?: boolean
    access_token?: string
    refresh_token?: string
    target?: ImpersonationTargetSummary
  }
  if (payload?.error) return { ok: false, error: payload.error }
  return {
    ok: true,
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    target: payload.target,
  }
}

/** Start viewing as target; stashes the current Super Admin session. */
export async function startImpersonation(
  targetUserId: string,
): Promise<{ error: string | null }> {
  if (readImpersonationStash()) {
    return { error: 'כבר במצב צפייה כמשתמש אחר.' }
  }

  const { data: sessionData } = await supabase.auth.getSession()
  const session = sessionData.session
  if (!session?.access_token || !session.refresh_token || !session.user) {
    return { error: 'יש להתחבר מחדש.' }
  }

  const result = await callImpersonation({
    action: 'impersonate',
    target_user_id: targetUserId,
  })
  if (!result.ok) return { error: result.error }
  if (!result.access_token || !result.refresh_token || !result.target) {
    return { error: 'פתיחת הצפייה נכשלה. נסו שוב.' }
  }

  writeImpersonationStash({
    actorAccessToken: session.access_token,
    actorRefreshToken: session.refresh_token,
    actorUserId: session.user.id,
    targetUserId: result.target.id,
    targetFullName: result.target.full_name,
    targetCallsign: result.target.callsign,
    startedAt: new Date().toISOString(),
  })

  const { error: setError } = await supabase.auth.setSession({
    access_token: result.access_token,
    refresh_token: result.refresh_token,
  })
  if (setError) {
    clearImpersonationStash()
    return { error: 'פתיחת הצפייה נכשלה. נסו שוב.' }
  }

  return { error: null }
}

/** Restore Super Admin session and audit stop. */
export async function stopImpersonation(): Promise<{ error: string | null }> {
  const stash = readImpersonationStash()
  if (!stash) {
    return { error: 'אין צפייה פעילה לשחזור.' }
  }

  const { error: setError } = await supabase.auth.setSession({
    access_token: stash.actorAccessToken,
    refresh_token: stash.actorRefreshToken,
  })
  if (setError) {
    clearImpersonationStash()
    return { error: 'השחזור נכשל — התחברו מחדש.' }
  }

  const targetUserId = stash.targetUserId
  clearImpersonationStash()

  const audit = await callImpersonation({
    action: 'stop_impersonation',
    target_user_id: targetUserId,
  })
  if (!audit.ok) {
    // Actor session already restored — soft failure.
    return { error: null }
  }

  return { error: null }
}
