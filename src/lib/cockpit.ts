import { todayJerusalem } from './eventForm'
import { supabase } from './supabase'

export const COCKPIT_WINDOW_MS = 2 * 60 * 60 * 1000
export const COCKPIT_AUTOSAVE_MS = 800

export type CockpitReelItem = {
  id: string
  created_at: string
  police_event_id: string | null
  status: 'draft' | 'in_progress' | 'partial' | 'done'
  is_cancelled: boolean
  location: string | null
  event_type: { name: string } | null
  road: { name: string } | null
  shift_lead: { full_name: string; callsign: string } | null
  responders: { id: string }[]
}

const COCKPIT_REEL_SELECT = `
  id,
  created_at,
  police_event_id,
  status,
  is_cancelled,
  location,
  event_type:event_types(name),
  road:roads(name),
  shift_lead:profiles!events_shift_lead_id_fkey(full_name, callsign),
  responders:event_responders(id)
`

export function isInCockpitWindow(createdAt: string, now: Date): boolean {
  const created = new Date(createdAt).getTime()
  if (Number.isNaN(created)) return false
  const age = now.getTime() - created
  return age >= 0 && age <= COCKPIT_WINDOW_MS
}

export function filterCockpitReel<T extends { id: string; created_at: string }>(
  events: T[],
  now: Date,
): T[] {
  return events
    .filter((event) => isInCockpitWindow(event.created_at, now))
    .sort((a, b) => {
      const diff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      if (diff !== 0) return diff
      return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
    })
}

export function cockpitReelTitle(event: {
  police_event_id: string | null
  event_type?: { name: string } | null
}): string {
  const policeId = event.police_event_id?.trim()
  if (policeId) return policeId
  return 'אירוע חדש'
}

export function cockpitReelType(event: { event_type: { name: string } | null }): string | null {
  const typeName = event.event_type?.name.trim()
  return typeName || null
}

export function cockpitReelPlace(event: {
  road: { name: string } | null
  location: string | null
}): string | null {
  const place = [event.road?.name, event.location].filter(Boolean).join(' · ')
  return place || null
}

export function cockpitReelLead(event: {
  shift_lead: { full_name: string; callsign: string } | null
}): { full_name: string; callsign: string } | null {
  const name = event.shift_lead?.full_name.trim() ?? ''
  const callsign = event.shift_lead?.callsign.trim() ?? ''
  if (!name && !callsign) return null
  return { full_name: name, callsign }
}

export type CockpitDeleteBlock = 'responders'
export type CockpitDeleteHintKind = CockpitDeleteBlock | 'confirm'

/** Blocked only while responders are still allocated. */
export function cockpitDeleteBlock(event: {
  responders: { id: string }[]
}): CockpitDeleteBlock | null {
  if ((event.responders ?? []).length > 0) return 'responders'
  return null
}

export function canDeleteCockpitDraft(event: { responders: { id: string }[] }): boolean {
  return cockpitDeleteBlock(event) === null
}

export function cockpitDeleteHint(kind: CockpitDeleteHintKind): string {
  if (kind === 'responders') return 'יש כוננים משובצים. הסירו אותם תחילה.'
  return 'לחצו שוב למחיקה.'
}

export function formatCockpitClock(iso: string): string {
  return new Intl.DateTimeFormat('he-IL', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso))
}

export function cockpitReelCaption(event: CockpitReelItem): string {
  return formatCockpitClock(event.created_at)
}

export async function fetchCockpitReel(now = new Date()): Promise<CockpitReelItem[]> {
  const since = new Date(now.getTime() - COCKPIT_WINDOW_MS).toISOString()
  const { data, error } = await supabase
    .from('events')
    .select(COCKPIT_REEL_SELECT)
    .gte('created_at', since)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return filterCockpitReel((data ?? []) as unknown as CockpitReelItem[], now)
}

export async function insertCockpitDraft(shiftLeadId: string): Promise<
  { ok: true; eventId: string } | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from('events')
    .insert({
      shift_lead_id: shiftLeadId,
      event_date: todayJerusalem(),
      status: 'draft',
    })
    .select('id')
    .single()

  if (error || !data) {
    return { ok: false, error: 'שמירת האירוע נכשלה. בדקו את החיבור ונסו שוב.' }
  }
  return { ok: true, eventId: data.id as string }
}
