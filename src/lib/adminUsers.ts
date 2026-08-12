import type { AppRole } from './auth'
import { compareAdminUsers } from './adminUserStatus'
import { findDuplicatePlate, phoneDigits, plateDigits } from './format'
import { supabase } from './supabase'
import { syncUserRolesDiff } from './syncUserRolesDiff'

export type AdminVehicle = {
  id: string
  plate_number: string
  model: string
  archived: boolean
}

export type AdminUserRow = {
  id: string
  full_name: string
  email: string
  callsign: string
  phone: string | null
  active: boolean
  last_sign_in_at: string | null
  /** True until the invitee sets a password in the app. */
  invite_pending: boolean
  otp_login_enabled: boolean
  otp_users_page_enabled: boolean
  roles: AppRole[]
  vehicles: AdminVehicle[]
}

export type InviteUserInput = {
  full_name: string
  email: string
  callsign: string
  phone?: string | null
  roles: AppRole[]
  vehicles: { plate_number: string; model: string }[]
}

export type SaveUserInput = {
  id: string
  full_name: string
  callsign: string
  phone?: string | null
  roles: AppRole[]
  vehicles: { id?: string; plate_number: string; model: string; archived?: boolean }[]
}

async function callAdminUsers(
  body: Record<string, unknown>,
): Promise<
  { ok: true; message?: string; user_id?: string; action_link?: string } | { ok: false; error: string }
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
    message?: string
    user_id?: string
    action_link?: string
    ok?: boolean
  }
  if (payload?.error) return { ok: false, error: payload.error }
  return {
    ok: true,
    message: payload.message,
    user_id: payload.user_id,
    action_link: payload.action_link,
  }
}

export async function fetchAdminUsers(): Promise<AdminUserRow[]> {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select(
      'id, full_name, email, callsign, phone, active, invite_pending, otp_login_enabled, otp_users_page_enabled',
    )
    .order('full_name')

  if (error) throw error

  const ids = (profiles ?? []).map((row) => row.id)
  if (ids.length === 0) return []

  const [{ data: roleRows }, { data: vehicleRows }, { data: loginRows }] = await Promise.all([
    supabase.from('user_roles').select('user_id, role').in('user_id', ids),
    supabase
      .from('vehicles')
      .select('id, user_id, plate_number, model, archived')
      .in('user_id', ids),
    supabase.rpc('admin_list_last_sign_in'),
  ])

  const lastSignInByUser = new Map(
    ((loginRows ?? []) as { user_id: string; last_sign_in_at: string | null }[]).map((row) => [
      row.user_id,
      row.last_sign_in_at,
    ]),
  )

  const rows = (profiles ?? []).map((profile) => ({
    id: profile.id,
    full_name: profile.full_name,
    email: profile.email,
    callsign: profile.callsign,
    phone: profile.phone,
    active: profile.active !== false,
    last_sign_in_at: lastSignInByUser.get(profile.id) ?? null,
    invite_pending: Boolean(profile.invite_pending),
    otp_login_enabled: Boolean(profile.otp_login_enabled),
    otp_users_page_enabled: Boolean(profile.otp_users_page_enabled),
    roles: (roleRows ?? [])
      .filter((row) => row.user_id === profile.id)
      .map((row) => row.role as AppRole),
    vehicles: (vehicleRows ?? [])
      .filter((row) => row.user_id === profile.id)
      .map((row) => ({
        id: row.id as string,
        plate_number: row.plate_number as string,
        model: row.model as string,
        archived: Boolean(row.archived),
      })),
  }))

  // Pending invitees → active confirmed → מושבתים; name within group.
  return rows.sort(compareAdminUsers)
}

export function inviteAdminUser(input: InviteUserInput) {
  return callAdminUsers({
    action: 'invite',
    ...input,
    phone: input.phone ? phoneDigits(input.phone) : null,
  })
}

export function setAdminUserActive(userId: string, active: boolean) {
  return callAdminUsers({
    action: active ? 'reactivate' : 'deactivate',
    user_id: userId,
  })
}

/** Hard-delete Auth user + profile. Blocked when user is lead on events/shifts. */
export function deleteAdminUser(userId: string) {
  return callAdminUsers({
    action: 'delete',
    user_id: userId,
  })
}

/** Regenerate invite link and resend the invite email (pending invitees only). */
export function resendAdminInvite(userId: string) {
  return callAdminUsers({
    action: 'resend_invite',
    user_id: userId,
    send_email: true,
  })
}

/** Regenerate invite link and return it for clipboard copy (no email). */
export function copyAdminInviteLink(userId: string) {
  return callAdminUsers({
    action: 'copy_invite_link',
    user_id: userId,
    send_email: false,
  })
}

export async function deleteAdminVehicle(
  vehicleId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('vehicles').delete().eq('id', vehicleId)
  if (error) return { error: 'מחיקת הרכב נכשלה.' }
  return { error: null }
}

export async function archiveAdminVehicle(
  vehicleId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('vehicles')
    .update({ archived: true })
    .eq('id', vehicleId)
  if (error) return { error: 'העברת הרכב לארכיון נכשלה.' }
  return { error: null }
}

export async function unarchiveAdminVehicle(
  vehicleId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('vehicles')
    .update({ archived: false })
    .eq('id', vehicleId)
  if (error) return { error: 'שחזור הרכב מהארכיון נכשל.' }
  return { error: null }
}

export async function saveAdminUser(input: SaveUserInput): Promise<{ error: string | null }> {
  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      full_name: input.full_name.trim(),
      callsign: input.callsign.trim(),
      phone: input.phone ? phoneDigits(input.phone) || null : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.id)

  if (profileError) {
    return { error: 'שמירת המשתמש נכשלה. בדקו את החיבור ונסו שוב.' }
  }

  // Diff roles instead of delete-all + insert. Deleting the admin's own
  // `admin` row first would fail the follow-up insert under RLS (has_role).
  const rolesSync = await syncUserRoles(input.id, input.roles)
  if (rolesSync.error) return rolesSync

  const vehiclesSync = await syncUserVehicles(input.id, input.vehicles)
  if (vehiclesSync.error) return vehiclesSync

  return { error: null }
}

async function syncUserVehicles(
  userId: string,
  nextVehicles: SaveUserInput['vehicles'],
): Promise<{ error: string | null }> {
  if (findDuplicatePlate(nextVehicles)) {
    return { error: 'לא ניתן לשייך את אותה לוחית רישוי יותר מפעם אחת לאותו משתמש.' }
  }

  const { data: existing, error: readError } = await supabase
    .from('vehicles')
    .select('id, plate_number, model, archived')
    .eq('user_id', userId)

  if (readError) {
    return { error: 'שמירת הרכבים נכשלה.' }
  }

  const existingRows = existing ?? []
  const nextWithIds = nextVehicles.filter((vehicle) => vehicle.id)
  const nextIds = new Set(nextWithIds.map((vehicle) => vehicle.id!))

  for (const row of existingRows) {
    if (!nextIds.has(row.id as string)) {
      const { error } = await supabase.from('vehicles').delete().eq('id', row.id)
      if (error) {
        return { error: 'שמירת הרכבים נכשלה.' }
      }
    }
  }

  for (const vehicle of nextWithIds) {
    if (vehicle.archived) {
      const { error } = await supabase
        .from('vehicles')
        .update({ archived: true })
        .eq('id', vehicle.id!)
        .eq('user_id', userId)
      if (error) {
        return { error: 'שמירת הרכבים נכשלה.' }
      }
      continue
    }

    const plate = plateDigits(vehicle.plate_number) || vehicle.plate_number.trim()
    const model = vehicle.model.trim()
    if (!plate || !model) continue
    const { error } = await supabase
      .from('vehicles')
      .update({
        plate_number: plate,
        model,
        archived: false,
      })
      .eq('id', vehicle.id!)
      .eq('user_id', userId)
    if (error) {
      if (error.code === '23505') {
        return { error: 'לא ניתן לשייך את אותה לוחית רישוי יותר מפעם אחת לאותו משתמש.' }
      }
      return { error: 'שמירת הרכבים נכשלה.' }
    }
  }

  const toInsert = nextVehicles.filter(
    (vehicle) => !vehicle.id && vehicle.plate_number.trim() && vehicle.model.trim(),
  )
  if (toInsert.length > 0) {
    const { error } = await supabase.from('vehicles').insert(
      toInsert.map((vehicle) => ({
        user_id: userId,
        plate_number: plateDigits(vehicle.plate_number) || vehicle.plate_number.trim(),
        model: vehicle.model.trim(),
        archived: false,
      })),
    )
    if (error) {
      if (error.code === '23505') {
        return { error: 'לא ניתן לשייך את אותה לוחית רישוי יותר מפעם אחת לאותו משתמש.' }
      }
      return { error: 'שמירת הרכבים נכשלה.' }
    }
  }

  return { error: null }
}

async function syncUserRoles(
  userId: string,
  nextRoles: AppRole[],
): Promise<{ error: string | null }> {
  const { data: existing, error: readError } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)

  if (readError) {
    return { error: 'שמירת התפקידים נכשלה.' }
  }

  const current = (existing ?? []).map((row) => row.role as AppRole)
  const { toAdd, toRemove } = syncUserRolesDiff(current, nextRoles)

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from('user_roles')
      .delete()
      .eq('user_id', userId)
      .in('role', toRemove)
    if (error) {
      return { error: 'שמירת התפקידים נכשלה.' }
    }
  }

  if (toAdd.length > 0) {
    const { error } = await supabase
      .from('user_roles')
      .insert(toAdd.map((role) => ({ user_id: userId, role })))
    if (error) {
      return { error: 'שמירת התפקידים נכשלה.' }
    }
  }

  return { error: null }
}

export async function setAdminUserPassword(input: {
  userId: string
  password: string
  forceChange?: boolean
}): Promise<{ error: string | null }> {
  const result = await callAdminUsers({
    action: 'set_password',
    user_id: input.userId,
    password: input.password,
    force_change: input.forceChange ?? false,
  })
  return result.ok ? { error: null } : { error: result.error }
}
