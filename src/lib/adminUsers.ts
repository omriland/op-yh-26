import type { AppRole } from './auth'
import { supabase } from './supabase'

export type AdminUserRow = {
  id: string
  full_name: string
  email: string
  callsign: string
  phone: string | null
  active: boolean
  roles: AppRole[]
  vehicles: { id: string; plate_number: string; model: string }[]
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
  vehicles: { id?: string; plate_number: string; model: string }[]
}

async function callAdminUsers(body: Record<string, unknown>): Promise<{ ok: true; message?: string; user_id?: string } | { ok: false; error: string }> {
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

  const payload = data as { error?: string; message?: string; user_id?: string; ok?: boolean }
  if (payload?.error) return { ok: false, error: payload.error }
  return { ok: true, message: payload.message, user_id: payload.user_id }
}

export async function fetchAdminUsers(): Promise<AdminUserRow[]> {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, callsign, phone, active')
    .order('full_name')

  if (error) throw error

  const ids = (profiles ?? []).map((row) => row.id)
  if (ids.length === 0) return []

  const [{ data: roleRows }, { data: vehicleRows }] = await Promise.all([
    supabase.from('user_roles').select('user_id, role').in('user_id', ids),
    supabase.from('vehicles').select('id, user_id, plate_number, model').in('user_id', ids),
  ])

  return (profiles ?? []).map((profile) => ({
    id: profile.id,
    full_name: profile.full_name,
    email: profile.email,
    callsign: profile.callsign,
    phone: profile.phone,
    active: profile.active !== false,
    roles: (roleRows ?? [])
      .filter((row) => row.user_id === profile.id)
      .map((row) => row.role as AppRole),
    vehicles: (vehicleRows ?? [])
      .filter((row) => row.user_id === profile.id)
      .map((row) => ({
        id: row.id,
        plate_number: row.plate_number,
        model: row.model,
      })),
  }))
}

export function inviteAdminUser(input: InviteUserInput) {
  return callAdminUsers({ action: 'invite', ...input })
}

export function setAdminUserActive(userId: string, active: boolean) {
  return callAdminUsers({
    action: active ? 'reactivate' : 'deactivate',
    user_id: userId,
  })
}

export async function saveAdminUser(input: SaveUserInput): Promise<{ error: string | null }> {
  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      full_name: input.full_name.trim(),
      callsign: input.callsign.trim(),
      phone: input.phone?.trim() || null,
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

  const { error: deleteVehiclesError } = await supabase.from('vehicles').delete().eq('user_id', input.id)
  if (deleteVehiclesError) {
    return { error: 'שמירת הרכבים נכשלה.' }
  }

  const vehicles = input.vehicles.filter((v) => v.plate_number.trim() && v.model.trim())
  if (vehicles.length > 0) {
    const { error: insertVehiclesError } = await supabase.from('vehicles').insert(
      vehicles.map((vehicle) => ({
        user_id: input.id,
        plate_number: vehicle.plate_number.replace(/\D/g, '') || vehicle.plate_number.trim(),
        model: vehicle.model.trim(),
      })),
    )
    if (insertVehiclesError) {
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

  const current = new Set((existing ?? []).map((row) => row.role as AppRole))
  const next = new Set(nextRoles)
  const toRemove = [...current].filter((role) => !next.has(role))
  const toAdd = [...next].filter((role) => !current.has(role))

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
