import { isImpersonating } from './impersonationStash'
import { supabase } from './supabase'
import type { BroadcastAudience, BroadcastCandidate, BroadcastChannel } from './unitBroadcast'

export type UnitBroadcastLogRow = {
  id: string
  createdAt: string
  channel: BroadcastChannel
  audience: BroadcastAudience
  subject: string
  body: string
  recipientCount: number
  skippedNoPhone: number
  skippedNoEmail: number
  pushCount: number
  pushFailedCount: number
  senderName: string
  senderCallsign: string
}

export type UnitBroadcastSendResult = {
  recipientCount: number
  skippedNoPhone: number
  skippedNoEmail: number
  failedCount: number
  pushCount: number
  pushFailedCount: number
}

type CallResult<T> = { ok: true; data: T } | { ok: false; error: string }

export async function fetchBroadcastCandidates(): Promise<BroadcastCandidate[]> {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, email, phone, active, invite_pending')

  if (error) throw error

  const ids = (profiles ?? []).map((row) => row.id as string)
  if (ids.length === 0) return []

  const { data: roleRows, error: roleError } = await supabase
    .from('user_roles')
    .select('user_id, role')
    .in('user_id', ids)

  if (roleError) throw roleError

  const rolesByUser = new Map<string, string[]>()
  for (const row of roleRows ?? []) {
    const list = rolesByUser.get(row.user_id) ?? []
    list.push(row.role)
    rolesByUser.set(row.user_id, list)
  }

  const candidates = (profiles ?? []).map((profile) => ({
    id: profile.id as string,
    email: profile.email as string | null,
    phone: profile.phone as string | null,
    roles: rolesByUser.get(profile.id) ?? [],
    active: profile.active !== false,
    invite_pending: Boolean(profile.invite_pending),
    hasApp: false,
  }))

  const { data: appIds, error: appError } = await supabase.rpc('user_ids_with_device_tokens')
  if (appError) throw appError
  const appSet = new Set(asUserIds(appIds))
  return candidates.map((row) => ({ ...row, hasApp: appSet.has(row.id) }))
}

function asUserIds(data: unknown): string[] {
  if (!Array.isArray(data)) return []
  return data.flatMap((row) => {
    if (typeof row === 'string') return [row]
    if (row && typeof row === 'object' && 'user_ids_with_device_tokens' in row) {
      const id = (row as { user_ids_with_device_tokens: unknown }).user_ids_with_device_tokens
      return typeof id === 'string' ? [id] : []
    }
    return []
  })
}

export async function fetchBroadcastLog(): Promise<UnitBroadcastLogRow[]> {
  const { data, error } = await supabase
    .from('unit_broadcasts')
    .select(
      'id, created_at, channel, audience, subject, body, recipient_count, skipped_no_phone, skipped_no_email, push_count, push_failed_count, sender:profiles!sent_by(full_name, callsign)',
    )
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) throw error

  return (data ?? []).map((row) => {
    const sender = Array.isArray(row.sender) ? row.sender[0] : row.sender
    return {
      id: row.id,
      createdAt: row.created_at,
      channel: row.channel as BroadcastChannel,
      audience: row.audience as BroadcastAudience,
      subject: row.subject ?? '',
      body: row.body,
      recipientCount: row.recipient_count,
      skippedNoPhone: row.skipped_no_phone,
      skippedNoEmail: row.skipped_no_email,
      pushCount: row.push_count ?? 0,
      pushFailedCount: row.push_failed_count ?? 0,
      senderName: sender?.full_name ?? '—',
      senderCallsign: sender?.callsign ?? '—',
    }
  })
}

export async function sendUnitBroadcast(input: {
  channel: BroadcastChannel
  audience: BroadcastAudience
  subject: string
  body: string
}): Promise<CallResult<UnitBroadcastSendResult>> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (sessionError || !token) {
    return { ok: false, error: 'יש להתחבר מחדש.' }
  }

  const headers: Record<string, string> = {}
  if (isImpersonating()) headers['x-yahpaz-impersonating'] = '1'

  const { data, error } = await supabase.functions.invoke('unit-broadcast', {
    body: { action: 'send', ...input },
    headers,
  })

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
    return { ok: false, error: 'השליחה נכשלה. בדקו את החיבור ונסו שוב.' }
  }

  const payload = data as {
    error?: string
    recipient_count?: number
    skipped_no_phone?: number
    skipped_no_email?: number
    failed_count?: number
    push_count?: number
    push_failed_count?: number
  }
  if (payload?.error) return { ok: false, error: payload.error }

  return {
    ok: true,
    data: {
      recipientCount: payload.recipient_count ?? 0,
      skippedNoPhone: payload.skipped_no_phone ?? 0,
      skippedNoEmail: payload.skipped_no_email ?? 0,
      failedCount: payload.failed_count ?? 0,
      pushCount: payload.push_count ?? 0,
      pushFailedCount: payload.push_failed_count ?? 0,
    },
  }
}
