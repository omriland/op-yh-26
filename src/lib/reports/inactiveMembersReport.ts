import { formatDate } from '../format'
import { supabase } from '../supabase'

export type InactiveMemberRow = {
  user_id: string
  full_name: string
  callsign: string | null
  phone: string | null
  last_sign_in_at: string | null
  last_active_at: string | null
}

export const NEVER_SIGNED_IN_LABEL = 'מעולם לא התחבר'
export const DEFAULT_INACTIVE_DAYS = 60
const MIN_INACTIVE_DAYS = 1
const MAX_INACTIVE_DAYS = 365
const DAY_MS = 86_400_000

export function isValidInactiveDays(days: number): boolean {
  return Number.isInteger(days) && days >= MIN_INACTIVE_DAYS && days <= MAX_INACTIVE_DAYS
}

export function lastSeenAt(member: InactiveMemberRow): Date | null {
  const moments = [member.last_sign_in_at, member.last_active_at]
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value))
  if (moments.length === 0) return null
  return new Date(Math.max(...moments.map((moment) => moment.getTime())))
}

export function lastSeenLabel(member: InactiveMemberRow): string {
  const seen = lastSeenAt(member)
  return seen ? formatDate(seen) : NEVER_SIGNED_IN_LABEL
}

export function isInactiveForDays(member: InactiveMemberRow, days: number, now: Date): boolean {
  const seen = lastSeenAt(member)
  if (!seen) return true
  return now.getTime() - seen.getTime() > days * DAY_MS
}

export async function loadInactiveMembers(days: number): Promise<InactiveMemberRow[]> {
  const { data, error } = await supabase.rpc('report_inactive_members', { p_days: days })
  if (error) throw new Error(error.message)
  return (data ?? []) as InactiveMemberRow[]
}
