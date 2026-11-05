import { SUPPORT_WHATSAPP_HREF } from './supportWhatsapp'
import { supabase } from './supabase'

/** sessionStorage — one prompt per tab until sign-out or a new browser session. */
export const PERSONAL_VEHICLE_PROMPT_DISMISS_KEY = 'yahpaz:personal_vehicle_prompt_dismissed'

const PROMPT_STATUSES = new Set(['active_volunteer', 'personal_vehicle_training'])

export function needsPersonalVehiclePrompt(
  volunteerStatus: unknown,
  activeVehicleCount: number,
): boolean {
  if (activeVehicleCount > 0) return false
  return typeof volunteerStatus === 'string' && PROMPT_STATUSES.has(volunteerStatus)
}

export function personalVehicleWhatsAppMessage(vehicleNumber: string): string {
  return `היי, אבקש להוסיף לפרופיל שלי את הרכב שלי מספר: ${vehicleNumber}`
}

/** Null when the number is blank. Opens the user's own WhatsApp; nothing is written to the database. */
export function personalVehicleWhatsAppHref(raw: string): string | null {
  const number = raw.trim()
  if (!number) return null
  return `${SUPPORT_WHATSAPP_HREF}?text=${encodeURIComponent(personalVehicleWhatsAppMessage(number))}`
}

export function readPersonalVehiclePromptDismissed(
  storage: Pick<Storage, 'getItem'> | null = typeof sessionStorage === 'undefined'
    ? null
    : sessionStorage,
): boolean {
  try {
    return storage?.getItem(PERSONAL_VEHICLE_PROMPT_DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

export function writePersonalVehiclePromptDismissed(
  storage: Pick<Storage, 'setItem'> | null = typeof sessionStorage === 'undefined'
    ? null
    : sessionStorage,
): void {
  try {
    storage?.setItem(PERSONAL_VEHICLE_PROMPT_DISMISS_KEY, '1')
  } catch {
    // Private mode can reject sessionStorage. The dialog still closes.
  }
}

export function clearPersonalVehiclePromptDismissed(
  storage: Pick<Storage, 'removeItem'> | null = typeof sessionStorage === 'undefined'
    ? null
    : sessionStorage,
): void {
  try {
    storage?.removeItem(PERSONAL_VEHICLE_PROMPT_DISMISS_KEY)
  } catch {
    // Ignore.
  }
}

/** Active (non-archived) `vehicles` row for this user, and status מתנדב פעיל or חניכה ברכב פרטי. */
export async function userNeedsPersonalVehiclePrompt(userId: string): Promise<boolean> {
  const [{ data: profile, error: profileError }, vehicles] = await Promise.all([
    supabase.from('profiles').select('volunteer_status').eq('id', userId).maybeSingle(),
    supabase.from('vehicles').select('id').eq('user_id', userId).eq('archived', false).limit(1),
  ])
  if (profileError || vehicles.error) return false
  const status = (profile as { volunteer_status?: unknown } | null)?.volunteer_status
  return needsPersonalVehiclePrompt(status, (vehicles.data ?? []).length)
}
