import { supabase } from './supabase'
import type { ProfileKmMonthlyRow } from './profileKmBreakdown'

/** The signed-in person's own monthly km. The database policy lets nobody read other rows. */
export async function fetchOwnKmMonthly(profileId: string): Promise<ProfileKmMonthlyRow[]> {
  const { data, error } = await supabase
    .from('profile_km_monthly')
    .select('month, km')
    .eq('profile_id', profileId)

  if (error) throw error
  return (data ?? []).map((row) => ({
    month: row.month as string,
    km: Number(row.km),
  }))
}
