import { sortByRoadName } from './roadSort'
import { supabase } from './supabase'
import type { EventStatus, ParticipationStatus } from './status'
import { fillReadyNotifyIds } from './fillReadyNotify'
import { notifyFillReady } from './responderFillToken'
import { planTrackingSync } from './liveTrack'
import { startResponderTracking, stopResponderTracking } from './liveTrackApi'
import {
  applyAutoGeocodeToLocationPayload,
  eventGeocodeQuery,
  eventNeedsPersistedGeocode,
} from './eventGeocode'
import { geocodePlaceQuery } from './googlePlaces'
import { digitsOnly, isCompleteTimeInput } from './format'
import {
  LOCATION_REQUIRED_ERROR,
  needsPlacesLocation,
} from './systemDistricts'
import {
  emptyLocationPinMeta,
  locationPinIsLocked,
  type LocationPinSource,
} from './locationPin'
import {
  EVENT_SECONDARY_LEADS_EMBED,
  createTimeCreatorSecondary,
  mapSecondaryLeadRows,
  type SecondaryLead,
} from './eventShiftLeads'

export type LookupOption = { id: string; name: string; code?: string | null }

export type AssignableUser = {
  id: string
  full_name: string
  callsign: string
  hasVehicle: boolean
}

export const NO_VEHICLE_KM_PLACEHOLDER = 'מתנדב ללא רכב'

/** Create-only: the lead may appear in the picker but cannot be assigned. */
export const SELF_ASSIGN_ON_CREATE_ERROR = 'לא ניתן לשבץ את יוצר האירוע כמתנדב.'

export function createIncludesSelfAssign(
  shiftLeadId: string,
  responders: { responder_id: string }[],
): boolean {
  return responders.some((row) => row.responder_id === shiftLeadId)
}

export function isSelfAssignDisabledInPicker(
  blockSelfAssign: boolean,
  currentUserId: string | undefined,
  personId: string,
): boolean {
  return Boolean(blockSelfAssign && currentUserId && personId === currentUserId)
}

export function hasActiveVehicle(
  vehicles: { archived?: boolean | null }[] | null | undefined,
): boolean {
  return (vehicles ?? []).some((row) => !row.archived)
}

/** Lead `total_km` is never stored for a responder with no active vehicle. */
export function leadKmForSave(hasVehicle: boolean, totalKm: string): number | null {
  if (!hasVehicle) return null
  const trimmed = totalKm.trim()
  if (trimmed === '') return null
  return Number(trimmed)
}

export type TreatedDraft = { vehicle_kind_id: string; quantity: number }

export type ResponderDraft = {
  key: string
  assignmentId?: string
  responder_id: string
  full_name: string
  callsign: string
  /** HH:MM UI — stored as started_at on event_date */
  start_time: string
  /** HH:MM UI — stored as ended_at on event_date, or next day if end < start */
  end_time: string
  total_km: string
  emergency_means: boolean
  treated: TreatedDraft[]
  status: ParticipationStatus
  hasOwnedData: boolean
  expanded: boolean
  /** Active (non-archived) vehicle on the responder profile. */
  hasVehicle: boolean
}

/** `timestamp` / `time` / ISO → `HH:MM` for time inputs. */
export function toTimeInput(value: string | null | undefined): string {
  if (!value) return ''
  const timePart = value.includes('T') ? value.split('T')[1]! : value.includes(' ') ? value.split(' ')[1]! : value
  return timePart.slice(0, 5)
}

/** End clock earlier than start ⇒ overnight (end on event_date + 1). */
export function isOvernightEnd(startTime: string, endTime: string): boolean {
  if (!isCompleteTimeInput(startTime) || !isCompleteTimeInput(endTime)) return false
  return endTime < startTime
}

function addDaysYmd(ymd: string, days: number): string {
  const date = new Date(`${ymd}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** Wall-clock timestamp (no TZ) for Postgres `timestamp without time zone`. */
export function wallTimestamp(
  eventDate: string,
  timeHm: string,
  dayOffset = 0,
): string | null {
  const time = timeHm.trim()
  if (!time || !eventDate) return null
  // Reject partial / non-24h values from the digit-masked time field.
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(time)) return null
  const hour = Number(time.slice(0, 2))
  const minute = Number(time.slice(3, 5))
  if (hour > 23 || minute > 59) return null
  const normalized = time.length === 5 ? `${time}:00` : time.slice(0, 8)
  return `${addDaysYmd(eventDate, dayOffset)}T${normalized}`
}

export type EventFormDraft = {
  id?: string
  status: EventStatus
  event_date: string
  police_event_id: string
  district_id: string
  patrol_callsign: string
  event_type_id: string
  road_id: string
  location: string
  location_place_id: string | null
  location_lat: number | null
  location_lng: number | null
  location_pin_source: LocationPinSource | null
  location_pinned_at: string | null
  location_pinned_by: string | null
  notes: string
  is_cancelled: boolean
  /** נת״צ — event took place in a bus / public-transit lane. */
  bus_lane: boolean
  /** Creator — not the last editor. Missing on older stashes. */
  shift_lead_id?: string
  shift_lead: { full_name: string; callsign: string }
  secondary_leads: SecondaryLead[]
  responders: ResponderDraft[]
}

export const CANCELLED_TREATED_BLOCK =
  'לא ניתן לסמן בוטל כל עוד רשומים רכבים שטופלו. נקו תחילה את הכמויות.'

export const CANCELLED_CLEAR_ADMIN_ONLY =
  'רק מנהל או אחמ״ש יכולים לבטל סימון בוטל.'

/** Admin, super_admin, and shift_lead may clear the cancelled flag. */
export function canClearEventCancelled(roles: readonly string[]): boolean {
  return (
    roles.includes('admin') ||
    roles.includes('super_admin') ||
    roles.includes('shift_lead')
  )
}

export function totalTreatedQuantity(
  responders: { treated: { quantity: number }[] }[],
): number {
  return responders.reduce(
    (sum, responder) =>
      sum + responder.treated.reduce((inner, row) => inner + row.quantity, 0),
    0,
  )
}

export function applyCancelledChange(input: {
  next: boolean
  current: boolean
  treatedTotal: number
  canClearCancelled: boolean
}): { ok: true; is_cancelled: boolean } | { ok: false; error: string } {
  const { next, current, treatedTotal, canClearCancelled } = input
  if (next === current) return { ok: true, is_cancelled: current }
  if (next && treatedTotal > 0) return { ok: false, error: CANCELLED_TREATED_BLOCK }
  if (!next && !canClearCancelled) return { ok: false, error: CANCELLED_CLEAR_ADMIN_ONLY }
  return { ok: true, is_cancelled: next }
}

export type EventFormErrors = Partial<
  Record<
    | 'event_date'
    | 'police_event_id'
    | 'district_id'
    | 'event_type_id'
    | 'road_id'
    | 'location'
    | 'form',
    string
  >
>

export function validateCancelledSave(input: {
  is_cancelled: boolean
  treatedTotal: number
  canClearCancelled: boolean
  previousIsCancelled: boolean
}): EventFormErrors | null {
  const { is_cancelled, treatedTotal, canClearCancelled, previousIsCancelled } = input
  if (is_cancelled && treatedTotal > 0) {
    return { form: CANCELLED_TREATED_BLOCK }
  }
  if (previousIsCancelled && !is_cancelled && !canClearCancelled) {
    return { form: CANCELLED_CLEAR_ADMIN_ONLY }
  }
  return null
}

export type EventLookups = {
  districts: LookupOption[]
  eventTypes: LookupOption[]
  roads: LookupOption[]
  vehicleKinds: LookupOption[]
}

/** YYYY-MM-DD in Asia/Jerusalem. */
export function todayJerusalem(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export function emptyEventDraft(lead: {
  id?: string
  full_name: string
  callsign: string
}): EventFormDraft {
  return {
    status: 'draft',
    event_date: todayJerusalem(),
    police_event_id: '',
    district_id: '',
    patrol_callsign: '',
    event_type_id: '',
    road_id: '',
    location: '',
    location_place_id: null,
    location_lat: null,
    location_lng: null,
    location_pin_source: null,
    location_pinned_at: null,
    location_pinned_by: null,
    notes: '',
    is_cancelled: false,
    bus_lane: false,
    shift_lead_id: lead.id,
    shift_lead: { full_name: lead.full_name, callsign: lead.callsign },
    secondary_leads: [],
    responders: [],
  }
}

/** New event with only the default date — no typed fields, pin, cancel, or responders. */
export function isAbandonedEmptyEventDraft(
  draft: EventFormDraft,
  initialEventDate: string,
  originalShiftLeadId?: string,
): boolean {
  if (draft.responders.length > 0) return false
  if (draft.is_cancelled) return false
  if (draft.event_date !== initialEventDate) return false
  if (draft.police_event_id.trim()) return false
  if (draft.district_id) return false
  if (draft.patrol_callsign.trim()) return false
  if (draft.event_type_id) return false
  if (draft.road_id) return false
  if (draft.location.trim()) return false
  if (draft.location_place_id) return false
  if (draft.location_lat != null || draft.location_lng != null) return false
  if (draft.notes.trim()) return false
  if (draft.bus_lane) return false
  if ((draft.secondary_leads ?? []).length > 0) return false
  const originalLead = originalShiftLeadId?.trim() ?? ''
  const currentLead = draft.shift_lead_id?.trim() ?? ''
  if (originalLead && currentLead && originalLead !== currentLead) return false
  return true
}

let abandonEmptyEventHandler: (() => Promise<boolean>) | null = null
let abandonEmptyEventPeek: (() => boolean) | null = null

export function registerAbandonedEmptyEventHandler(
  handler: (() => Promise<boolean>) | null,
  peek?: (() => boolean) | null,
) {
  abandonEmptyEventHandler = handler
  abandonEmptyEventPeek = handler ? (peek ?? null) : null
}

/** True when the mounted form has a real edit (including date-only) so it must not be reused or dropped. */
export function mountedEventIsKeptFromAbandon(): boolean {
  if (!abandonEmptyEventPeek) return false
  return !abandonEmptyEventPeek()
}

/** True only when a mounted form peek says this is still an untouched empty insert. */
export function mountedEventIsAbandonedEmpty(): boolean {
  return Boolean(abandonEmptyEventPeek?.())
}

/** Drop a never-touched new event when leaving the form (nav, back, cockpit switch). */
export async function discardAbandonedEmptyEventIfAny(): Promise<boolean> {
  return (await abandonEmptyEventHandler?.()) ?? false
}

async function fetchLookup(table: 'event_types' | 'roads' | 'vehicle_kinds') {
  const { data, error } = await supabase
    .from(table)
    .select('id, name')
    .eq('active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw new Error(error.message)
  const items = (data ?? []) as LookupOption[]
  return table === 'roads' ? sortByRoadName(items) : items
}

async function fetchDistrictLookup(): Promise<LookupOption[]> {
  const { data, error } = await supabase
    .from('districts')
    .select('id, name, code')
    .eq('active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as LookupOption[]
}

export async function fetchEventLookups(): Promise<EventLookups> {
  const [districts, eventTypes, roads, vehicleKinds] = await Promise.all([
    fetchDistrictLookup(),
    fetchLookup('event_types'),
    fetchLookup('roads'),
    fetchLookup('vehicle_kinds'),
  ])
  return { districts, eventTypes, roads, vehicleKinds }
}

export async function fetchShiftLeadUsers(): Promise<AssignableUser[]> {
  const { data, error } = await supabase.rpc('list_shift_lead_profiles')
  if (error) throw new Error(error.message)
  return ((data ?? []) as { id: string; full_name: string; callsign: string }[]).map((row) => ({
    id: row.id,
    full_name: row.full_name,
    callsign: row.callsign,
    hasVehicle: true,
  }))
}

export async function fetchAssignableUsers(): Promise<AssignableUser[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, callsign, vehicles(id, archived)')
    .eq('active', true)
    .order('full_name', { ascending: true })
  if (error) throw new Error(error.message)
  return ((data ?? []) as {
    id: string
    full_name: string
    callsign: string
    vehicles: { id: string; archived: boolean | null }[] | null
  }[]).map((row) => ({
    id: row.id,
    full_name: row.full_name,
    callsign: row.callsign,
    hasVehicle: hasActiveVehicle(row.vehicles),
  }))
}

type LoadedResponder = {
  id: string
  responder_id: string
  started_at: string | null
  ended_at: string | null
  total_km: number | null
  emergency_means: boolean
  status: ParticipationStatus
  vehicle_plate: string | null
  odometer_start: number | null
  odometer_end: number | null
  route: string | null
  treatment_detail: string | null
  treatment_notes: string | null
  profile: {
    full_name: string
    callsign: string
    vehicles: { id: string; archived: boolean | null }[] | null
  } | null
  treated: { vehicle_kind_id: string; quantity: number }[]
}

/** PostgREST 42703 / PGRST204 when `events.bus_lane` has not been migrated yet. */
export function isMissingBusLaneColumn(error: {
  code?: string
  message?: string
} | null): boolean {
  const message = error?.message ?? ''
  return (
    error?.code === '42703' ||
    error?.code === 'PGRST204' ||
    /events\.bus_lane|column.*bus_lane/i.test(message)
  )
}

const EVENT_EDIT_SELECT = `
      id, status, event_date, police_event_id, district_id, patrol_callsign,
      event_type_id, road_id, location, location_place_id, location_lat, location_lng,
      location_pin_source, location_pinned_at, location_pinned_by,
      notes, is_cancelled, bus_lane, shift_lead_id,
      shift_lead:profiles!events_shift_lead_id_fkey(full_name, callsign),
      ${EVENT_SECONDARY_LEADS_EMBED},
      responders:event_responders(
        id, responder_id, started_at, ended_at, total_km, emergency_means, status,
        vehicle_plate, odometer_start, odometer_end, route,
        treatment_detail, treatment_notes,
        profile:profiles(full_name, callsign, vehicles(id, archived)),
        treated:event_treated_vehicles(vehicle_kind_id, quantity)
      )
    `

const EVENT_EDIT_SELECT_NO_BUS_LANE = EVENT_EDIT_SELECT.replace(', bus_lane', '')

export async function fetchEventForEdit(eventId: string): Promise<EventFormDraft | null> {
  let { data, error } = await supabase
    .from('events')
    .select(EVENT_EDIT_SELECT)
    .eq('id', eventId)
    .maybeSingle()

  if (error && isMissingBusLaneColumn(error)) {
    const retry = await supabase
      .from('events')
      .select(EVENT_EDIT_SELECT_NO_BUS_LANE)
      .eq('id', eventId)
      .maybeSingle()
    data = retry.data as typeof data
    error = retry.error
  }

  if (error) throw new Error(error.message)
  if (!data) return null

  const row = data as unknown as {
    id: string
    status: EventStatus
    event_date: string
    police_event_id: string | null
    district_id: string | null
    patrol_callsign: string | null
    event_type_id: string | null
    road_id: string | null
    location: string | null
    location_place_id: string | null
    location_lat: number | null
    location_lng: number | null
    location_pin_source: LocationPinSource | null
    location_pinned_at: string | null
    location_pinned_by: string | null
    notes: string | null
    is_cancelled: boolean
    bus_lane: boolean
    shift_lead_id: string | null
    shift_lead: { full_name: string; callsign: string } | null
    secondary_leads?: unknown
    responders: LoadedResponder[]
  }

  return {
    id: row.id,
    status: row.status,
    event_date: row.event_date,
    police_event_id: row.police_event_id ?? '',
    district_id: row.district_id ?? '',
    patrol_callsign: row.patrol_callsign ?? '',
    event_type_id: row.event_type_id ?? '',
    road_id: row.road_id ?? '',
    location: row.location ?? '',
    location_place_id: row.location_place_id ?? null,
    location_lat: row.location_lat ?? null,
    location_lng: row.location_lng ?? null,
    location_pin_source: row.location_pin_source ?? null,
    location_pinned_at: row.location_pinned_at ?? null,
    location_pinned_by: row.location_pinned_by ?? null,
    notes: row.notes ?? '',
    is_cancelled: row.is_cancelled ?? false,
    bus_lane: row.bus_lane ?? false,
    shift_lead_id: row.shift_lead_id ?? undefined,
    shift_lead: row.shift_lead ?? { full_name: '—', callsign: '—' },
    secondary_leads: mapSecondaryLeadRows(row.secondary_leads),
    responders: (row.responders ?? []).map((responder) => {
      const hasVehicle = hasActiveVehicle(responder.profile?.vehicles)
      return {
        key: responder.id,
        assignmentId: responder.id,
        responder_id: responder.responder_id,
        full_name: responder.profile?.full_name ?? 'מתנדב',
        callsign: responder.profile?.callsign ?? '—',
        start_time: toTimeInput(responder.started_at),
        end_time: toTimeInput(responder.ended_at),
        total_km: hasVehicle && responder.total_km != null ? String(responder.total_km) : '',
        emergency_means: responder.emergency_means,
        treated: (responder.treated ?? []).map((item) => ({
          vehicle_kind_id: item.vehicle_kind_id,
          quantity: item.quantity,
        })),
        status: responder.status,
        hasOwnedData: Boolean(
          responder.vehicle_plate ||
            responder.odometer_start != null ||
            responder.odometer_end != null ||
            responder.route ||
            responder.treatment_detail ||
            responder.treatment_notes,
        ),
        expanded: false,
        hasVehicle,
      }
    }),
  }
}

/** Cockpit: missing תאריך / כביש / סוג אירוע — persisted, but not a “real” event yet. */
export const COCKPIT_IDENTITY_DRAFT_WARNING = 'האירוע בטיוטה'

export const POLICE_EVENT_ID_DUPLICATE_ERROR =
  'כבר קיים אירוע עם המספר הזה באותו תאריך.'

type EventIdentityGap = 'date' | 'type' | 'road' | 'location'

const IDENTITY_CAPTION: Record<Exclude<EventIdentityGap, 'location'>, string> = {
  date: 'תאריך',
  type: 'סוג',
  road: 'כביש',
}

const IDENTITY_TOAST: Record<EventIdentityGap, string> = {
  date: 'תאריך',
  type: 'סוג אירוע',
  road: 'כביש',
  location: 'מיקום',
}

function joinHebrewList(items: string[]): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]!
  if (items.length === 2) return `${items[0]} ו${items[1]}`
  return `${items.slice(0, -1).join(', ')} ו${items[items.length - 1]}`
}

export function missingEventIdentityGaps(draft: {
  event_date: string
  event_type_id: string
  road_id: string
}): Exclude<EventIdentityGap, 'location'>[] {
  const missing: Exclude<EventIdentityGap, 'location'>[] = []
  if (!draft.event_date.trim()) missing.push('date')
  if (!draft.event_type_id.trim()) missing.push('type')
  if (!draft.road_id.trim()) missing.push('road')
  return missing
}

export function eventLacksRequiredIdentity(draft: {
  event_date: string
  event_type_id: string
  road_id: string
}): boolean {
  return missingEventIdentityGaps(draft).length > 0
}

/** Red cockpit caption: name what is still missing of תאריך / סוג / כביש. */
export function cockpitIdentityDraftWarning(draft: {
  event_date: string
  event_type_id: string
  road_id: string
}): string | null {
  const missing = missingEventIdentityGaps(draft).map((key) => IDENTITY_CAPTION[key])
  if (missing.length === 0) return null
  if (missing.length === 3) return COCKPIT_IDENTITY_DRAFT_WARNING
  if (missing.length === 1) return `חסר ${missing[0]}`
  return `חסרים ${joinHebrewList(missing)}`
}

/** Standalone create toast: list only the fields that actually blocked persist. */
export function eventCreateBlockedMessage(errors: EventFormErrors): string {
  const missing: string[] = []
  if (errors.event_date) missing.push(IDENTITY_TOAST.date)
  if (errors.event_type_id) missing.push(IDENTITY_TOAST.type)
  if (errors.road_id) missing.push(IDENTITY_TOAST.road)
  if (errors.location) missing.push(IDENTITY_TOAST.location)
  const fields =
    missing.length > 0
      ? joinHebrewList(missing)
      : joinHebrewList([IDENTITY_TOAST.date, IDENTITY_TOAST.type, IDENTITY_TOAST.road])
  return `יש למלא ${fields} כדי ליצור אירוע.`
}

export type SameDayPoliceEventRow = {
  id: string
  event_date: string
  police_event_id: string | null
  is_cancelled?: boolean
}

export function sameDayPoliceEventIdCollides(input: {
  eventDate: string
  policeEventId: string
  currentEventId?: string | null
  existing: SameDayPoliceEventRow[]
}): boolean {
  const policeId = digitsOnly(input.policeEventId)
  const date = input.eventDate.trim()
  if (!policeId || !date) return false
  return input.existing.some((row) => {
    if (row.is_cancelled) return false
    if (input.currentEventId && row.id === input.currentEventId) return false
    if (row.event_date.trim() !== date) return false
    return digitsOnly(row.police_event_id ?? '') === policeId
  })
}

export function policeEventIdForCockpitSave(input: {
  typed: string
  lastSaved: string
  collides: boolean
}): string {
  if (!input.collides) return digitsOnly(input.typed)
  if (digitsOnly(input.lastSaved) === digitsOnly(input.typed)) return ''
  return digitsOnly(input.lastSaved)
}

export async function fetchSameDayPoliceEventIdRows(input: {
  eventDate: string
  policeEventId: string
}): Promise<SameDayPoliceEventRow[]> {
  const policeId = digitsOnly(input.policeEventId)
  const eventDate = input.eventDate.trim()
  if (!policeId || !eventDate) return []
  const { data, error } = await supabase
    .from('events')
    .select('id, event_date, police_event_id, is_cancelled')
    .eq('event_date', eventDate)
    .eq('police_event_id', policeId)
    .eq('is_cancelled', false)
  if (error) throw new Error(error.message)
  return (data ?? []) as SameDayPoliceEventRow[]
}

export async function cockpitPoliceEventIdCollides(
  input: {
    eventDate: string
    policeEventId: string
    currentEventId?: string | null
  },
  loadRows: (query: {
    eventDate: string
    policeEventId: string
  }) => Promise<SameDayPoliceEventRow[]> = fetchSameDayPoliceEventIdRows,
): Promise<boolean> {
  const policeId = digitsOnly(input.policeEventId)
  if (!policeId || !input.eventDate.trim()) return false
  const existing = await loadRows({
    eventDate: input.eventDate,
    policeEventId: policeId,
  })
  return sameDayPoliceEventIdCollides({ ...input, existing })
}

/** Minimum to create/keep an event: date + event type + road (+ location for Places). */
export function validateEventMinimum(
  draft: EventFormDraft,
  districts: LookupOption[] = [],
  roads: LookupOption[] = [],
): EventFormErrors {
  const errors: EventFormErrors = {}
  if (!draft.event_date) errors.event_date = 'יש לבחור תאריך.'
  if (!draft.event_type_id) errors.event_type_id = 'יש לבחור סוג אירוע.'
  if (!draft.road_id) errors.road_id = 'יש לבחור כביש.'
  if (
    needsPlacesLocation(districts, draft.district_id, roads, draft.road_id) &&
    !draft.location.trim()
  ) {
    errors.location = LOCATION_REQUIRED_ERROR
  }
  return errors
}

export function hasEventMinimum(
  draft: EventFormDraft,
  districts: LookupOption[] = [],
  roads: LookupOption[] = [],
): boolean {
  return Object.keys(validateEventMinimum(draft, districts, roads)).length === 0
}

export function canPersistEventDraft(
  draft: EventFormDraft,
  districts: LookupOption[] = [],
  options?: { allowPartial?: boolean; roads?: LookupOption[] },
): EventFormErrors {
  if (options?.allowPartial) {
    return draft.event_date ? {} : { event_date: 'יש לבחור תאריך.' }
  }
  return validateEventMinimum(draft, districts, options?.roads)
}

export function eventForeignIds(
  draft: EventFormDraft,
  options?: { allowPartial?: boolean },
): {
  event_type_id: string | null
  road_id: string | null
  district_id: string | null
} {
  const allowPartial = Boolean(options?.allowPartial)
  return {
    event_type_id: draft.event_type_id || (allowPartial ? null : draft.event_type_id),
    road_id: draft.road_id || (allowPartial ? null : draft.road_id),
    district_id: draft.district_id || null,
  }
}

/** Persist location text plus the canonical map pin. */
export function buildLocationPayload(draft: EventFormDraft): {
  location: string | null
  location_place_id: string | null
  location_lat: number | null
  location_lng: number | null
  location_pin_source: LocationPinSource | null
  location_pinned_at: string | null
  location_pinned_by: string | null
} {
  const location = draft.location.trim() || null
  const locked = locationPinIsLocked(draft.location_pin_source)
  const hasCoords = draft.location_lat != null && draft.location_lng != null

  if (!location && !locked) {
    return {
      location: null,
      location_place_id: null,
      location_lat: null,
      location_lng: null,
      ...emptyLocationPinMeta(),
    }
  }

  if (locked && hasCoords) {
    return {
      location,
      location_place_id: null,
      location_lat: draft.location_lat,
      location_lng: draft.location_lng,
      location_pin_source: draft.location_pin_source,
      location_pinned_at: draft.location_pinned_at,
      location_pinned_by: draft.location_pinned_by,
    }
  }

  const hasPlace = Boolean(draft.location_place_id) && hasCoords
  if (hasPlace) {
    return {
      location,
      location_place_id: draft.location_place_id,
      location_lat: draft.location_lat,
      location_lng: draft.location_lng,
      location_pin_source: 'places',
      location_pinned_at: null,
      location_pinned_by: null,
    }
  }

  if (draft.location_pin_source === 'geocode' && hasCoords) {
    return {
      location,
      location_place_id: null,
      location_lat: draft.location_lat,
      location_lng: draft.location_lng,
      location_pin_source: 'geocode',
      location_pinned_at: null,
      location_pinned_by: null,
    }
  }

  return {
    location,
    location_place_id: null,
    location_lat: null,
    location_lng: null,
    ...emptyLocationPinMeta(),
  }
}

/**
 * Derive stored event status from current assignments.
 * Adding a new pending responder after `done` must reopen to `partial` —
 * never freeze the previous status.
 */
export function deriveEventStatus(draft: EventFormDraft): EventStatus {
  if (draft.responders.length === 0) return 'draft'
  if (draft.responders.every((row) => row.status === 'done')) return 'done'
  if (draft.responders.some((row) => row.status === 'done')) return 'partial'
  return 'in_progress'
}

/** Attach DB assignment ids after insert so the next save updates instead of re-inserting. */
export function mergeAssignmentIds(
  responders: ResponderDraft[],
  byResponderId: Record<string, string>,
): ResponderDraft[] {
  return responders.map((row) => {
    const assignmentId = row.assignmentId ?? byResponderId[row.responder_id]
    return assignmentId ? { ...row, assignmentId } : row
  })
}

export async function saveEventForm(input: {
  draft: EventFormDraft
  shiftLeadId: string
  vehicleKinds: LookupOption[]
  districts: LookupOption[]
  roads?: LookupOption[]
  canClearCancelled: boolean
  previousIsCancelled: boolean
  allowPartial?: boolean
  /** Create session (including cockpit). Rejects a tampered self-assign. */
  blockSelfAssign?: boolean
}): Promise<
  | {
      ok: true
      eventId: string
      status: EventStatus
      assignmentIds: Record<string, string>
      trackingStartFailed: boolean
      trackingStopFailed: boolean
      location_lat: number | null
      location_lng: number | null
      location_pin_source: LocationPinSource | null
      secondary_leads: SecondaryLead[]
    }
  | { ok: false; error: string; fieldErrors?: EventFormErrors }
> {
  const { draft, shiftLeadId, vehicleKinds, districts, canClearCancelled, previousIsCancelled } =
    input
  const allowPartial = Boolean(input.allowPartial)
  const rejectSelfAssign = Boolean(input.blockSelfAssign) || !draft.id
  if (rejectSelfAssign && createIncludesSelfAssign(shiftLeadId, draft.responders)) {
    return { ok: false, error: SELF_ASSIGN_ON_CREATE_ERROR }
  }

  const fieldErrors = canPersistEventDraft(draft, districts, {
    allowPartial,
    roads: input.roads,
  })
  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      error: eventCreateBlockedMessage(fieldErrors),
      fieldErrors,
    }
  }

  const cancelledErrors = validateCancelledSave({
    is_cancelled: draft.is_cancelled,
    treatedTotal: totalTreatedQuantity(draft.responders),
    canClearCancelled,
    previousIsCancelled,
  })
  if (cancelledErrors) {
    return {
      ok: false,
      error: cancelledErrors.form ?? CANCELLED_TREATED_BLOCK,
      fieldErrors: cancelledErrors,
    }
  }

  const nextStatus = deriveEventStatus(draft)

  let locationPayload = buildLocationPayload(draft)
  const roadName = input.roads?.find((row) => row.id === draft.road_id)?.name ?? null
  const placesAssisted = needsPlacesLocation(
    districts,
    draft.district_id,
    input.roads ?? [],
    draft.road_id,
  )
  if (
    eventNeedsPersistedGeocode({
      location: draft.location,
      location_lat: locationPayload.location_lat,
      location_lng: locationPayload.location_lng,
      location_pin_source: locationPayload.location_pin_source,
      roadName,
      placesAssisted,
    })
  ) {
    const query = eventGeocodeQuery(roadName, draft.location)
    const coords = query ? await geocodePlaceQuery(query) : null
    locationPayload = applyAutoGeocodeToLocationPayload(locationPayload, coords)
  }
  const foreignIds = eventForeignIds(draft, { allowPartial })
  const mainLeadId = draft.shift_lead_id?.trim() || shiftLeadId
  const wasCreate = !draft.id
  const eventPayload = {
    event_date: draft.event_date,
    police_event_id: digitsOnly(draft.police_event_id) || null,
    district_id: foreignIds.district_id,
    patrol_callsign: draft.patrol_callsign.trim() || null,
    event_type_id: foreignIds.event_type_id,
    road_id: foreignIds.road_id,
    location: locationPayload.location,
    location_place_id: locationPayload.location_place_id,
    location_lat: locationPayload.location_lat,
    location_lng: locationPayload.location_lng,
    location_pin_source: locationPayload.location_pin_source,
    location_pinned_at: locationPayload.location_pinned_at,
    location_pinned_by: locationPayload.location_pinned_by,
    notes: draft.notes.trim() || null,
    is_cancelled: draft.is_cancelled,
    bus_lane: draft.bus_lane,
    status: nextStatus,
    updated_at: new Date().toISOString(),
    ...(draft.shift_lead_id ? { shift_lead_id: mainLeadId } : {}),
  }

  let eventId = draft.id

  const payloadWithoutBusLane = (({ bus_lane: _busLane, ...rest }) => rest)(eventPayload)

  if (eventId) {
    let { error } = await supabase.from('events').update(eventPayload).eq('id', eventId)
    if (error && isMissingBusLaneColumn(error)) {
      const retry = await supabase.from('events').update(payloadWithoutBusLane).eq('id', eventId)
      error = retry.error
    }
    if (error) {
      return { ok: false, error: 'שמירת האירוע נכשלה. בדקו את החיבור ונסו שוב.' }
    }
  } else {
    let { data, error } = await supabase
      .from('events')
      .insert({ ...eventPayload, shift_lead_id: mainLeadId })
      .select('id')
      .single()
    if (error && isMissingBusLaneColumn(error)) {
      const retry = await supabase
        .from('events')
        .insert({ ...payloadWithoutBusLane, shift_lead_id: mainLeadId })
        .select('id')
        .single()
      data = retry.data as typeof data
      error = retry.error
    }
    if (error || !data) {
      return { ok: false, error: 'שמירת האירוע נכשלה. בדקו את החיבור ונסו שוב.' }
    }
    eventId = data.id as string
  }

  const sync = await syncResponders({
    eventId,
    eventDate: draft.event_date,
    responders: draft.responders,
    vehicleKinds,
    isCancelled: draft.is_cancelled,
  })
  if (!sync.ok) return sync

  const creatorSecondary = wasCreate
    ? createTimeCreatorSecondary({ creatorId: shiftLeadId, mainLeadId })
    : null
  const secondarySync = await syncSecondaryLeads({
    eventId,
    desired: draft.secondary_leads ?? [],
    creatorSecondary,
  })
  if (!secondarySync.ok) return secondarySync

  const notifyIds = fillReadyNotifyIds(sync.previousKm, sync.nextKmRows)
  if (notifyIds.length > 0 && !draft.is_cancelled) {
    // Soft-fail: event save already succeeded.
    void notifyFillReady({ eventResponderIds: notifyIds }).catch(() => {})
  }

  const nextAssignments = draft.responders.flatMap((responder) => {
    const assignmentId = sync.assignmentIds[responder.responder_id]
    if (!assignmentId) return []
    const overnight = isOvernightEnd(responder.start_time, responder.end_time)
    return [
      {
        id: assignmentId,
        endedAt: wallTimestamp(draft.event_date, responder.end_time, overnight ? 1 : 0),
      },
    ]
  })
  const trackingPlan = planTrackingSync({
    previous: sync.previousAssignments,
    next: nextAssignments,
  })
  const leftoverStopIds = trackingPlan.stopIds.filter((id) => !sync.removedIds.includes(id))
  let trackingStopFailed = sync.trackingStopFailed
  let trackingStartFailed = false
  if (leftoverStopIds.length > 0) {
    const stopped = await stopResponderTracking(leftoverStopIds)
    if (!stopped.ok) trackingStopFailed = true
  }
  if (trackingPlan.startIds.length > 0) {
    const started = await startResponderTracking(trackingPlan.startIds)
    if (!started.ok) trackingStartFailed = true
  }

  return {
    ok: true,
    eventId,
    status: nextStatus,
    assignmentIds: sync.assignmentIds,
    trackingStartFailed,
    trackingStopFailed,
    location_lat: locationPayload.location_lat,
    location_lng: locationPayload.location_lng,
    location_pin_source: locationPayload.location_pin_source,
    secondary_leads: secondarySync.secondaries,
  }
}

async function fetchSecondaryLeads(eventId: string): Promise<SecondaryLead[]> {
  const { data, error } = await supabase
    .from('event_secondary_leads')
    .select(
      'user_id, locked, added_at, profile:profiles!event_secondary_leads_user_id_fkey(full_name, callsign)',
    )
    .eq('event_id', eventId)
    .order('added_at', { ascending: true })
  if (error) return []
  return mapSecondaryLeadRows(data)
}

async function syncSecondaryLeads(input: {
  eventId: string
  desired: SecondaryLead[]
  creatorSecondary: { user_id: string; locked: false } | null
}): Promise<{ ok: true; secondaries: SecondaryLead[] } | { ok: false; error: string }> {
  const existing = await fetchSecondaryLeads(input.eventId)
  const wanted = new Map<string, { locked: boolean }>()
  for (const row of input.desired) {
    if (row.user_id) wanted.set(row.user_id, { locked: row.locked })
  }
  if (input.creatorSecondary) {
    const current = wanted.get(input.creatorSecondary.user_id)
    wanted.set(input.creatorSecondary.user_id, {
      locked: Boolean(current?.locked),
    })
  }

  for (const row of existing) {
    if (!wanted.has(row.user_id) && !row.locked) {
      const { error } = await supabase
        .from('event_secondary_leads')
        .delete()
        .eq('event_id', input.eventId)
        .eq('user_id', row.user_id)
        .eq('locked', false)
      if (error) {
        return { ok: false, error: 'שמירת האירוע נכשלה. בדקו את החיבור ונסו שוב.' }
      }
    }
  }

  for (const [userId, row] of wanted) {
    const found = existing.find((item) => item.user_id === userId)
    if (!found) {
      const { error } = await supabase.from('event_secondary_leads').insert({
        event_id: input.eventId,
        user_id: userId,
        locked: row.locked,
      })
      if (error) {
        return { ok: false, error: 'שמירת האירוע נכשלה. בדקו את החיבור ונסו שוב.' }
      }
    } else if (row.locked && !found.locked) {
      const { error } = await supabase
        .from('event_secondary_leads')
        .update({ locked: true })
        .eq('event_id', input.eventId)
        .eq('user_id', userId)
      if (error) {
        return { ok: false, error: 'שמירת האירוע נכשלה. בדקו את החיבור ונסו שוב.' }
      }
    }
  }

  return { ok: true, secondaries: await fetchSecondaryLeads(input.eventId) }
}

async function syncResponders(input: {
  eventId: string
  eventDate: string
  responders: ResponderDraft[]
  vehicleKinds: LookupOption[]
  isCancelled: boolean
}): Promise<
  | {
      ok: true
      assignmentIds: Record<string, string>
      previousKm: { id: string; total_km: number | null }[]
      nextKmRows: { assignmentId: string; totalKm: number | null }[]
      previousAssignments: { id: string; endedAt: string | null }[]
      removedIds: string[]
      trackingStopFailed: boolean
    }
  | { ok: false; error: string }
> {
  const { eventId, eventDate, responders, vehicleKinds, isCancelled } = input

  const { data: existing, error: existingError } = await supabase
    .from('event_responders')
    .select('id, responder_id, total_km, ended_at')
    .eq('event_id', eventId)

  if (existingError) {
    return { ok: false, error: 'שמירת האירוע נכשלה. בדקו את החיבור ונסו שוב.' }
  }

  const previousAssignments = (existing ?? []).map((row) => ({
    id: row.id as string,
    endedAt: (row.ended_at as string | null) ?? null,
  }))

  const existingByResponder = new Map(
    (existing ?? []).map((row) => [row.responder_id as string, row.id as string]),
  )
  const previousKm = (existing ?? []).map((row) => ({
    id: row.id as string,
    total_km: (row.total_km as number | null) ?? null,
  }))
  const keepIds = new Set(responders.map((row) => row.responder_id))
  const toRemove = (existing ?? []).filter((row) => !keepIds.has(row.responder_id as string))
  const removedIds = toRemove.map((row) => row.id as string)
  let trackingStopFailed = false

  if (removedIds.length > 0) {
    const stopped = await stopResponderTracking(removedIds)
    if (!stopped.ok) trackingStopFailed = true
    const { error } = await supabase.from('event_responders').delete().in('id', removedIds)
    if (error) {
      return { ok: false, error: 'שמירת האירוע נכשלה. בדקו את החיבור ונסו שוב.' }
    }
  }

  const assignmentIds: Record<string, string> = {}
  const nextKmRows: { assignmentId: string; totalKm: number | null }[] = []

  for (const responder of responders) {
    const km = leadKmForSave(responder.hasVehicle, responder.total_km)
    if (km != null && Number.isNaN(km)) {
      return { ok: false, error: 'קילומטרים חייבים להיות מספר.' }
    }

    const overnight = isOvernightEnd(responder.start_time, responder.end_time)
    const startedAt = wallTimestamp(eventDate, responder.start_time, 0)
    const endedAt = wallTimestamp(eventDate, responder.end_time, overnight ? 1 : 0)

    // Draft may lack assignmentId after the first insert in this session — reuse DB row.
    let assignmentId =
      responder.assignmentId ?? existingByResponder.get(responder.responder_id) ?? undefined
    if (assignmentId) {
      const { error } = await supabase
        .from('event_responders')
        .update({
          started_at: startedAt,
          ended_at: endedAt,
          total_km: km,
          emergency_means: responder.emergency_means,
          updated_at: new Date().toISOString(),
        })
        .eq('id', assignmentId)
      if (error) {
        return { ok: false, error: 'שמירת האירוע נכשלה. בדקו את החיבור ונסו שוב.' }
      }
    } else {
      const { data, error } = await supabase
        .from('event_responders')
        .insert({
          event_id: eventId,
          responder_id: responder.responder_id,
          started_at: startedAt,
          ended_at: endedAt,
          total_km: km,
          emergency_means: responder.emergency_means,
          status: 'pending',
        })
        .select('id')
        .single()
      if (error || !data) {
        return { ok: false, error: 'שמירת האירוע נכשלה. בדקו את החיבור ונסו שוב.' }
      }
      assignmentId = data.id as string
      existingByResponder.set(responder.responder_id, assignmentId)
    }

    assignmentIds[responder.responder_id] = assignmentId
    nextKmRows.push({ assignmentId, totalKm: km })

    const { error: clearError } = await supabase
      .from('event_treated_vehicles')
      .delete()
      .eq('event_responder_id', assignmentId)
    if (clearError) {
      return { ok: false, error: 'שמירת האירוע נכשלה. בדקו את החיבור ונסו שוב.' }
    }

    if (!isCancelled) {
      const treatedRows: {
        event_responder_id: string
        vehicle_kind_id: string
        quantity: number
      }[] = []
      for (const kind of vehicleKinds) {
        const quantity =
          responder.treated.find((row) => row.vehicle_kind_id === kind.id)?.quantity ?? 0
        if (quantity > 0) {
          treatedRows.push({
            event_responder_id: assignmentId,
            vehicle_kind_id: kind.id,
            quantity,
          })
        }
      }

      if (treatedRows.length > 0) {
        const { error } = await supabase.from('event_treated_vehicles').insert(treatedRows)
        if (error) {
          return { ok: false, error: 'שמירת האירוע נכשלה. בדקו את החיבור ונסו שוב.' }
        }
      }
    }
  }

  return {
    ok: true,
    assignmentIds,
    previousKm,
    nextKmRows,
    previousAssignments,
    removedIds,
    trackingStopFailed,
  }
}
