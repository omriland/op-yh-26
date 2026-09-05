/** Domain helpers for iOS Ad Hoc device enrollment (Plan 2). */

import { supabase } from './supabase'

export const IOS_DEVICE_CAP = 100
export const IOS_DEVICES_PER_USER = 2

export type IosDeviceStatus =
  | 'pending'
  | 'approved'
  | 'registered'
  | 'rejected'
  | 'retired'

export type VolunteerIosScreen =
  | 'need_iphone'
  | 'need_safari'
  | 'need_login'
  | 'enroll'
  | 'pending'
  | 'approved'
  | 'install'
  | 'rejected'

export type IosDevice = {
  id: string
  user_id: string
  udid: string
  device_name: string | null
  product_type: string | null
  ios_version: string | null
  status: IosDeviceStatus
  requested_at: string
  approved_at: string | null
  registered_at: string | null
  rejected_at: string | null
  reject_reason: string | null
  membership_year: number
}

export type IosDeviceAdminRow = IosDevice & {
  profile_name: string | null
  callsign: string | null
}

export type IosDevicesResult = { ok: true } | { ok: false; error: string }

const BUDGET_STATUSES: ReadonlySet<IosDeviceStatus> = new Set(['approved', 'registered'])

const STATUS_PRIORITY: Record<Exclude<IosDeviceStatus, 'retired'>, number> = {
  registered: 4,
  approved: 3,
  pending: 2,
  rejected: 1,
}

export function countBudgetUsed(statuses: readonly IosDeviceStatus[]): number {
  return statuses.filter((s) => BUDGET_STATUSES.has(s)).length
}

export function budgetTone(used: number): 'ok' | 'warn' | 'critical' {
  if (used >= 95) return 'critical'
  if (used >= 80) return 'warn'
  return 'ok'
}

export function canEnrollAnotherDevice(activeCount: number): boolean {
  return activeCount < IOS_DEVICES_PER_USER
}

export function volunteerIosScreen(input: {
  iphone: boolean
  safari: boolean
  signedIn: boolean
  devices: readonly { status: IosDeviceStatus }[]
}): VolunteerIosScreen {
  if (!input.iphone) return 'need_iphone'
  if (!input.safari) return 'need_safari'
  if (!input.signedIn) return 'need_login'

  let best: Exclude<IosDeviceStatus, 'retired'> | null = null
  for (const device of input.devices) {
    if (device.status === 'retired') continue
    if (!best || STATUS_PRIORITY[device.status] > STATUS_PRIORITY[best]) {
      best = device.status
    }
  }

  if (!best) return 'enroll'
  if (best === 'registered') return 'install'
  return best
}

export function iosDevicesErrorMessage(raw: string | null | undefined): string {
  const msg = (raw ?? '').toLowerCase()
  if (msg.includes('ios_budget_full')) {
    return 'הגעתם למכסת 100 המכשירים לשנה זו.'
  }
  if (msg.includes('ios_device_cap')) {
    return 'ניתן לרשום עד שני מכשירים למשתמש.'
  }
  if (msg.includes('forbidden')) {
    return 'אין לך הרשאה לפעולה זו.'
  }
  if (
    msg.includes('not_found') ||
    msg.includes('invalid_status') ||
    msg.includes('not_found_or_invalid')
  ) {
    return 'המכשיר לא נמצא או שמצבו השתנה. רעננו את הרשימה.'
  }
  return 'הפעולה נכשלה. נסו שוב.'
}

function mapRpcError(error: { message?: string } | null): IosDevicesResult {
  return { ok: false, error: iosDevicesErrorMessage(error?.message) }
}

export async function listMyIosDevices(): Promise<IosDevice[]> {
  const { data, error } = await supabase
    .from('ios_devices')
    .select(
      'id,user_id,udid,device_name,product_type,ios_version,status,requested_at,approved_at,registered_at,rejected_at,reject_reason,membership_year',
    )
    .order('requested_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as IosDevice[]
}

export async function listAllIosDevices(): Promise<IosDeviceAdminRow[]> {
  const { data, error } = await supabase
    .from('ios_devices')
    .select(
      'id,user_id,udid,device_name,product_type,ios_version,status,requested_at,approved_at,registered_at,rejected_at,reject_reason,membership_year,profile:profiles(full_name,callsign)',
    )
    .order('requested_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => {
    const r = row as IosDevice & {
      profile?: { full_name?: string | null; callsign?: string | null } | null
    }
    const profile = r.profile
    const { profile: _profile, ...rest } = r as IosDevice & { profile?: unknown }
    return {
      ...rest,
      profile_name: profile?.full_name ?? null,
      callsign: profile?.callsign ?? null,
    }
  })
}

export async function mintIosEnrollProfileUrl(): Promise<
  { ok: true; url: string } | { ok: false; error: string }
> {
  const { data, error } = await supabase.rpc('mint_ios_enroll_token')
  if (error || typeof data !== 'string' || !data) {
    return { ok: false, error: iosDevicesErrorMessage(error?.message) }
  }
  const base = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(
    /\/+$/,
    '',
  )
  if (!base) {
    return { ok: false, error: 'הגדרות השרת חסרות. פנו למנהל המערכת.' }
  }
  const url = `${base}/functions/v1/ios-enroll?op=profile&token=${encodeURIComponent(data)}`
  return { ok: true, url }
}

export async function approveIosDevice(id: string): Promise<IosDevicesResult> {
  const { error } = await supabase.rpc('ios_device_approve', { p_id: id })
  if (error) return mapRpcError(error)
  return { ok: true }
}

export async function rejectIosDevice(
  id: string,
  reason?: string,
): Promise<IosDevicesResult> {
  const { error } = await supabase.rpc('ios_device_reject', {
    p_id: id,
    p_reason: reason ?? null,
  })
  if (error) return mapRpcError(error)
  return { ok: true }
}

export async function retireIosDevice(id: string): Promise<IosDevicesResult> {
  const { error } = await supabase.rpc('ios_device_retire', { p_id: id })
  if (error) return mapRpcError(error)
  return { ok: true }
}
