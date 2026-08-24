import { todayJerusalem } from './eventForm'
import { eventGeocodeQuery, roadNumberForGeocode } from './eventGeocode'
import { locationPinIsLocked, type LocationPinSource } from './locationPin'
import { geocodePlaceQuery } from './googlePlaces'
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
  location_lat: number | null
  location_lng: number | null
  location_pin_source: LocationPinSource | null
  frozen_over_60km?: boolean
  frozen_suspicious_duplicate?: boolean
  event_type: { name: string } | null
  road: { name: string } | null
  shift_lead: { full_name: string; callsign: string } | null
  responders: { id: string; ended_at: string | null }[]
}

const COCKPIT_REEL_SELECT = `
  id,
  created_at,
  police_event_id,
  status,
  is_cancelled,
  location,
  location_lat,
  location_lng,
  location_pin_source,
  frozen_over_60km,
  frozen_suspicious_duplicate,
  event_type:event_types(name),
  road:roads(name),
  shift_lead:profiles!events_shift_lead_id_fkey(full_name, callsign),
  responders:event_responders(id, ended_at)
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

export function formatCockpitAge(iso: string, now: Date): string {
  const created = new Date(iso).getTime()
  if (Number.isNaN(created)) return 'עכשיו'
  const elapsed = now.getTime() - created
  if (elapsed < 60_000) return 'עכשיו'
  const minutes = Math.floor(elapsed / 60_000)
  if (minutes === 1) return 'לפני דקה'
  return `לפני ${minutes} דק׳`
}

export type CockpitEventPin = {
  eventId: string
  label: string
  title: string
  lat: number
  lng: number
}

export { eventGeocodeQuery, roadNumberForGeocode } from './eventGeocode'

export function cockpitEventPinLabel(event: {
  event_type: { name: string } | null
  road: { name: string } | null
  location: string | null
}): string {
  const typeName = event.event_type?.name.trim() ?? ''
  const roadName = event.road?.name.trim() ?? ''
  const place = event.location?.trim() ?? ''
  const number = roadName ? roadNumberForGeocode(roadName) : null
  const roadBit = number ?? roadName
  const placePart =
    place && roadBit && (place.startsWith(roadBit) || place.includes(` ${roadBit} `))
      ? place
      : [roadBit, place].filter(Boolean).join(' ')
  if (typeName && placePart) return `${typeName} · ${placePart}`
  return typeName || placePart
}

function toCockpitEventPin(
  event: {
    id: string
    police_event_id: string | null
    location: string | null
    event_type: { name: string } | null
    road: { name: string } | null
  },
  lat: number,
  lng: number,
): CockpitEventPin {
  const label = cockpitEventPinLabel(event) || cockpitReelTitle(event)
  const title = cockpitReelTitle(event)
  const detail = cockpitReelDetail(event)
  return {
    eventId: event.id,
    label,
    title: detail ? `${title} · ${detail}` : title,
    lat,
    lng,
  }
}

export function cockpitEventStillOpenOnMap(event: {
  responders?: { ended_at: string | null }[]
}): boolean {
  const responders = event.responders ?? []
  if (responders.length === 0) return true
  return responders.some((row) => !row.ended_at?.trim())
}

export function cockpitEventMapPins(
  events: Array<{
    id: string
    police_event_id: string | null
    location: string | null
    location_lat: number | null
    location_lng: number | null
    event_type: { name: string } | null
    road: { name: string } | null
    responders?: { ended_at: string | null }[]
  }>,
): CockpitEventPin[] {
  const pins: CockpitEventPin[] = []
  for (const event of events) {
    if (!cockpitEventStillOpenOnMap(event)) continue
    if (event.location_lat == null || event.location_lng == null) continue
    pins.push(toCockpitEventPin(event, event.location_lat, event.location_lng))
  }
  return pins
}

export async function geocodeCockpitEventPins(
  events: Array<{
    id: string
    police_event_id: string | null
    location: string | null
    location_lat: number | null
    location_lng: number | null
    location_pin_source?: string | null
    event_type: { name: string } | null
    road: { name: string } | null
    responders?: { ended_at: string | null }[]
  }>,
  lookup: (query: string) => Promise<{ lat: number; lng: number } | null> = geocodePlaceQuery,
): Promise<CockpitEventPin[]> {
  const pins: CockpitEventPin[] = []
  await Promise.all(
    events.map(async (event) => {
      if (!cockpitEventStillOpenOnMap(event)) return
      if (locationPinIsLocked(event.location_pin_source)) {
        if (event.location_lat != null && event.location_lng != null) {
          pins.push(toCockpitEventPin(event, event.location_lat, event.location_lng))
        }
        return
      }
      const query = eventGeocodeQuery(event.road?.name, event.location)
      if (!query) return
      const coords = await lookup(query)
      if (!coords) return
      pins.push(toCockpitEventPin(event, coords.lat, coords.lng))
    }),
  )
  return pins
}

/** Stored coords are a fallback; a Google lookup for the current כביש + מיקום wins. */
export function mergeCockpitEventPins(
  stored: CockpitEventPin[],
  geocoded: CockpitEventPin[],
): CockpitEventPin[] {
  const byId = new Map<string, CockpitEventPin>()
  for (const pin of stored) byId.set(pin.eventId, pin)
  for (const pin of geocoded) byId.set(pin.eventId, pin)
  return [...byId.values()]
}

export function cockpitReelDetail(event: {
  event_type: { name: string } | null
  road: { name: string } | null
  location: string | null
}): string | null {
  const parts = [event.event_type?.name, event.road?.name, event.location]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
  return parts.length ? parts.join(' · ') : null
}

export function cockpitWindowCountLabel(count: number): string {
  return `${count} בחלון`
}

export function cockpitNeighborId(
  ids: string[],
  currentId: string | undefined,
  direction: -1 | 1,
): string | undefined {
  if (ids.length === 0) return undefined
  if (!currentId) return direction === 1 ? ids[0] : ids[ids.length - 1]
  const index = ids.indexOf(currentId)
  if (index < 0) return direction === 1 ? ids[0] : ids[ids.length - 1]
  const next = index + direction
  if (next < 0 || next >= ids.length) return currentId
  return ids[next]
}

export type CockpitShortcutEvent = {
  key: string
  code?: string
  metaKey: boolean
  ctrlKey: boolean
  altKey?: boolean
  repeat?: boolean
}

export type CockpitShortcut =
  | { type: 'create' }
  | { type: 'select'; direction: -1 | 1 }
  | { type: 'delete' }

export function cockpitShortcut(
  event: CockpitShortcutEvent,
  typing: boolean,
): CockpitShortcut | null {
  if (typing) return null
  if (event.metaKey || event.ctrlKey || event.altKey) return null
  if (event.key === 'ArrowDown' || event.code === 'ArrowDown') {
    return { type: 'select', direction: 1 }
  }
  if (event.key === 'ArrowUp' || event.code === 'ArrowUp') {
    return { type: 'select', direction: -1 }
  }
  if (event.repeat) return null
  if (event.code === 'KeyN') return { type: 'create' }
  if (event.key === 'Backspace' || event.key === 'Delete') return { type: 'delete' }
  return null
}

type TypingLike = {
  tagName?: string
  isContentEditable?: boolean
  closest?: (selector: string) => unknown
}

export function isCockpitTypingTarget(target: EventTarget | null | TypingLike): boolean {
  if (!target || typeof target !== 'object') return false
  const el = target as TypingLike
  if (el.isContentEditable) return true
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return Boolean(
    el.closest?.('[contenteditable="true"], [role="combobox"], [role="listbox"]'),
  )
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

export async function saveEventLocationPin(input: {
  eventId: string
  lat: number
  lng: number
  userId: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from('events')
    .update({
      location_lat: input.lat,
      location_lng: input.lng,
      location_place_id: null,
      location_pin_source: 'shift_lead',
      location_pinned_at: new Date().toISOString(),
      location_pinned_by: input.userId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.eventId)
  if (error) return { ok: false, error: 'שמירת המיקום נכשלה. בדקו את החיבור ונסו שוב.' }
  return { ok: true }
}
