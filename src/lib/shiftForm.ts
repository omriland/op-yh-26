import { COUNT_DECREASE_BLOCKED, STALE_SAVE_MESSAGE } from './shiftBornEvents'
import { ODOMETER_ORDER_ERROR } from './odometer'
import { supabase } from './supabase'
import type { ShiftBornEventFillRow, ShiftBornFillDraft } from './shiftBornFill'
import { deriveShiftLogStatus, eventToLogSnapshot } from './shiftLogStatus'
import type { EventStatus, ShiftStatus } from './status'
import { addCalendarDays } from './mineListSections'
import {
  defaultShiftHours,
  isShiftFuture,
  SHIFT_KIND_LABELS,
  SHIFT_TOO_EARLY_MESSAGE,
  type ShiftKind,
  type ShiftVehicleType,
} from './shifts'
import { rangesOverlap } from './shiftWindow'

export type ShiftFormDraft = {
  id?: string
  status: ShiftStatus
  shift_date: string
  shift_kind: ShiftKind
  vehicle_type: ShiftVehicleType
  personal_vehicle_id: string | null
  responder_ids: string[]
  event_ids: string[]
  odometer_start: number | null
  odometer_end: number | null
  total_km: number | null
  notes: string
  event_type_counts: { event_type_id: string; count: number }[]
  treated_vehicle_counts: { vehicle_kind_id: string; count: number }[]
  cancelled_count: number
  /** HH:MM Asia/Jerusalem; empty on a legacy shift. */
  start_time: string
  end_time: string
  /** Opened with no hours: keeps working without them. */
  is_legacy?: boolean
  expected_updated_at?: string | null
}

export const SHIFT_HOURS_REQUIRED_ERROR = 'יש למלא שעת התחלה ושעת סיום'
export const SHIFT_HOURS_EQUAL_ERROR = 'שעת הסיום חייבת להיות שונה משעת ההתחלה'
const SHIFT_HOURS_AND_FIELDS_ERROR =
  'יש למלא תאריך, שם משמרת, סוג רכב ושעות לפני השמירה.'
export const SHIFT_OVERLAP_GENERAL_MESSAGE = 'המשמרת חופפת למשמרת אחרת של אחד מאנשי הצוות.'
const SHIFT_OVERLAP_DB_MESSAGE = SHIFT_OVERLAP_GENERAL_MESSAGE

const JERUSALEM_TIME_ZONE = 'Asia/Jerusalem'
const MINUTE_MS = 60 * 1000

function jerusalemOffsetMinutes(utcMs: number): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: JERUSALEM_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(utcMs))
  const part = (type: string) => Number(parts.find((row) => row.type === type)?.value)
  const wallAsUtc = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
    part('second'),
  )
  return (wallAsUtc - Math.floor(utcMs / 1000) * 1000) / MINUTE_MS
}

function jerusalemWallTimeToIso(date: string, time: string): string {
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute)
  const firstGuess = wallAsUtc - jerusalemOffsetMinutes(wallAsUtc) * MINUTE_MS
  const utcMs = wallAsUtc - jerusalemOffsetMinutes(firstGuess) * MINUTE_MS
  return new Date(utcMs).toISOString()
}

/** The end lands on the next calendar day when it is earlier than the start. */
export function buildShiftWindowTimestamps(
  shiftDate: string,
  startTime: string,
  endTime: string,
): { starts_at: string; ends_at: string } {
  const endDate = endTime < startTime ? addCalendarDays(shiftDate, 1) : shiftDate
  return {
    starts_at: jerusalemWallTimeToIso(shiftDate, startTime),
    ends_at: jerusalemWallTimeToIso(endDate, endTime),
  }
}

/** HH:MM on the Asia/Jerusalem wall clock; empty when there is no timestamp. */
export function formatJerusalemTimeOfDay(iso: string | null): string {
  if (!iso) return ''
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: JERUSALEM_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso))
}

/** Fills only the empty fields; a time the lead typed is never replaced. */
export function fillDefaultShiftHours(
  hours: { start_time: string; end_time: string },
  kind: ShiftKind,
): { start_time: string; end_time: string } {
  const defaults = defaultShiftHours(kind)
  if (!defaults) return hours
  return {
    start_time: hours.start_time || defaults.start,
    end_time: hours.end_time || defaults.end,
  }
}

/** Swaps hours the lead never typed for the new kind's defaults, or empties them. */
export function replaceUntouchedShiftHours(
  kind: ShiftKind,
): { start_time: string; end_time: string } {
  return fillDefaultShiftHours({ start_time: '', end_time: '' }, kind)
}

export function shiftHasHours(draft: Pick<ShiftFormDraft, 'start_time' | 'end_time'>): boolean {
  return Boolean(draft.start_time && draft.end_time)
}

export type CrewLiveShift = {
  id: string
  shift_kind: ShiftKind
  starts_at: string
  ends_at: string
  responder_ids: string[]
}

type OverlapKnownShift = Pick<CrewLiveShift, 'id' | 'shift_kind' | 'starts_at' | 'ends_at'>

function overlapShiftLabel(shift: OverlapKnownShift): string {
  const hours = `${formatJerusalemTimeOfDay(shift.starts_at)}–${formatJerusalemTimeOfDay(shift.ends_at)}`
  return `${SHIFT_KIND_LABELS[shift.shift_kind]} באותן שעות (${hours})`
}

/** Turns the database overlap refusal into a sentence; its DETAIL is the other shift's id. */
export function mapShiftOverlapError(
  error: { message?: string; details?: string | null },
  knownShifts: OverlapKnownShift[],
): string {
  const other = knownShifts.find((shift) => shift.id === error.details)
  if (!other) return SHIFT_OVERLAP_GENERAL_MESSAGE
  return `המשמרת חופפת למשמרת ${overlapShiftLabel(other)} של אחד מאנשי הצוות.`
}

export function findCrewOverlapMessage(input: {
  window: { starts_at: string; ends_at: string }
  crew: { id: string; name: string }[]
  others: CrewLiveShift[]
  ignoreShiftId?: string
}): string | null {
  const ownRange = { start: new Date(input.window.starts_at), end: new Date(input.window.ends_at) }
  for (const member of input.crew) {
    const clash = input.others.find(
      (other) =>
        other.id !== input.ignoreShiftId &&
        other.responder_ids.includes(member.id) &&
        rangesOverlap(ownRange, { start: new Date(other.starts_at), end: new Date(other.ends_at) }),
    )
    if (clash) return `לא ניתן לשבץ את ${member.name}: כבר משובץ במשמרת ${overlapShiftLabel(clash)}.`
  }
  return null
}

type CrewShiftRow = {
  responder_id: string
  shift: { id: string; shift_kind: ShiftKind; starts_at: string | null; ends_at: string | null }
}

/** Live shifts of these people around the date; the overlap check runs on them. */
export async function loadCrewLiveShifts(
  responderIds: string[],
  shiftDate: string,
): Promise<CrewLiveShift[]> {
  const { data, error } = await supabase
    .from('shift_responders')
    .select('responder_id, shift:shifts!inner(id, shift_kind, starts_at, ends_at)')
    .in('responder_id', responderIds)
    .gte('shift.shift_date', addCalendarDays(shiftDate, -1))
    .lte('shift.shift_date', addCalendarDays(shiftDate, 1))
  if (error) throw new Error(error.message)

  const byShift = new Map<string, CrewLiveShift>()
  for (const row of (data ?? []) as unknown as CrewShiftRow[]) {
    const { shift } = row
    if (!shift.starts_at || !shift.ends_at) continue
    const known = byShift.get(shift.id)
    if (known) {
      known.responder_ids.push(row.responder_id)
    } else {
      byShift.set(shift.id, {
        id: shift.id,
        shift_kind: shift.shift_kind,
        starts_at: shift.starts_at,
        ends_at: shift.ends_at,
        responder_ids: [row.responder_id],
      })
    }
  }
  return [...byShift.values()]
}

export function computeTotalKm(
  odometerStart: number | null,
  odometerEnd: number | null,
): number | null {
  if (odometerStart == null || odometerEnd == null) return null
  // A reversed pair is a typo, not a distance. Refuse it rather than writing a
  // negative into `total_km`, which feeds the fuel-refund and km-exception reports.
  if (odometerEnd < odometerStart) return null
  return odometerEnd - odometerStart
}

export type LinkableEvent = {
  id: string
  event_date: string
  police_event_id: string | null
  event_type: { name: string } | null
}

export function suggestRollupsFromLinkedEvents(input: {
  eventTypeIds: (string | null)[]
  treated: { vehicle_kind_id: string; quantity: number }[]
  cancelledFlags?: boolean[]
}): {
  event_type_counts: { event_type_id: string; count: number }[]
  treated_vehicle_counts: { vehicle_kind_id: string; count: number }[]
  cancelled_count: number
} {
  const typeCounts = new Map<string, number>()
  for (const eventTypeId of input.eventTypeIds) {
    if (!eventTypeId) continue
    typeCounts.set(eventTypeId, (typeCounts.get(eventTypeId) ?? 0) + 1)
  }

  const vehicleCounts = new Map<string, number>()
  for (const row of input.treated) {
    vehicleCounts.set(
      row.vehicle_kind_id,
      (vehicleCounts.get(row.vehicle_kind_id) ?? 0) + row.quantity,
    )
  }

  const cancelled_count = (input.cancelledFlags ?? []).filter(Boolean).length

  return {
    event_type_counts: [...typeCounts.entries()].map(([event_type_id, count]) => ({
      event_type_id,
      count,
    })),
    treated_vehicle_counts: [...vehicleCounts.entries()].map(([vehicle_kind_id, count]) => ({
      vehicle_kind_id,
      count,
    })),
    cancelled_count,
  }
}

/**
 * Device copy of the shift form. Each part keeps the server version it was typed
 * over, so a restore can tell whether a teammate saved since.
 */
export type ShiftFormStash = ShiftFormDraft & {
  /** Inline shift-born rows edited here and not saved yet. */
  born_drafts?: { id: string; base_updated_at: string; draft: ShiftBornFillDraft }[]
}

export function shiftFormStashFrom(
  draft: ShiftFormDraft,
  bornRows: ShiftBornEventFillRow[],
): ShiftFormStash {
  return {
    ...draft,
    born_drafts: bornRows
      .filter((row) => JSON.stringify(row.draft) !== JSON.stringify(row.saved))
      .map((row) => ({ id: row.id, base_updated_at: row.expected_updated_at, draft: row.draft })),
  }
}

/**
 * Put device-only edits back on top of what the server has now. The result always
 * carries the server's tokens: keeping the stashed one would refuse every save as
 * stale, forever. `serverMovedOn` says a teammate saved after the edits were typed,
 * so the screen can say so instead of overwriting them silently.
 */
export function resolveShiftFormStash(
  server: { draft: ShiftFormDraft; bornRows: ShiftBornEventFillRow[] },
  stashed: ShiftFormStash | null,
): {
  draft: ShiftFormDraft
  bornRows: ShiftBornEventFillRow[]
  restored: boolean
  serverMovedOn: boolean
} {
  const unchanged = { ...server, restored: false, serverMovedOn: false }
  if (!stashed) return unchanged
  const { born_drafts: bornDrafts = [], ...stashedDraft } = stashed
  const draft: ShiftFormDraft = {
    ...stashedDraft,
    id: server.draft.id,
    status: server.draft.status,
    is_legacy: server.draft.is_legacy,
    expected_updated_at: server.draft.expected_updated_at,
  }
  let bornMovedOn = false
  let bornRestored = false
  const bornRows = server.bornRows.map((row) => {
    const typed = bornDrafts.find((item) => item.id === row.id)
    if (!typed || JSON.stringify(typed.draft) === JSON.stringify(row.draft)) return row
    bornRestored = true
    if (typed.base_updated_at !== row.expected_updated_at) bornMovedOn = true
    return { ...row, draft: typed.draft }
  })
  if (!bornRestored && JSON.stringify(draft) === JSON.stringify(server.draft)) return unchanged
  return {
    draft,
    bornRows,
    restored: true,
    serverMovedOn:
      bornMovedOn ||
      (stashed.expected_updated_at ?? null) !== (server.draft.expected_updated_at ?? null),
  }
}

export const SHIFT_CREW_ERROR = 'יש לשבץ בין מתנדב אחד לשלושה'

/** A shift whose vehicle never left base is a real zero-km shift. */
export const SHIFT_ODOMETER_ORDER_ERROR = ODOMETER_ORDER_ERROR

export function shiftStatusFromDraft(
  draft: Pick<ShiftFormDraft, 'odometer_start' | 'odometer_end'>,
  events: Parameters<typeof deriveShiftLogStatus>[0]['events'] = [],
): ShiftStatus {
  return deriveShiftLogStatus({
    odometer_start: draft.odometer_start,
    odometer_end: draft.odometer_end,
    events,
  })
}

/** One-line summary for the form banner, naming whichever gate actually failed. */
export function summarizeShiftSaveErrors(fieldErrors: ShiftSaveError[]): string {
  if (fieldErrors.some((row) => row.field === 'odometer_end')) {
    return SHIFT_ODOMETER_ORDER_ERROR
  }
  if (fieldErrors.some((row) => row.field === 'responder_ids')) {
    return SHIFT_CREW_ERROR
  }
  const hoursFields = fieldErrors.filter(isHoursError)
  if (hoursFields.length === fieldErrors.length) {
    return hoursFields.some((row) => row.message === SHIFT_HOURS_EQUAL_ERROR)
      ? SHIFT_HOURS_EQUAL_ERROR
      : SHIFT_HOURS_REQUIRED_ERROR
  }
  if (hoursFields.length > 0) return SHIFT_HOURS_AND_FIELDS_ERROR
  return 'יש למלא תאריך, שם משמרת וסוג רכב לפני השמירה.'
}

function isHoursError(row: ShiftSaveError): boolean {
  return row.field === 'start_time' || row.field === 'end_time'
}

export type ShiftSaveError = {
  field:
    | 'shift_date'
    | 'shift_kind'
    | 'vehicle_type'
    | 'personal_vehicle_id'
    | 'responder_ids'
    | 'odometer_end'
    | 'start_time'
    | 'end_time'
  message: string
}

function validateShiftHours(draft: ShiftFormDraft): ShiftSaveError[] {
  if (draft.is_legacy) return []
  const errors: ShiftSaveError[] = []
  if (!draft.start_time) errors.push({ field: 'start_time', message: SHIFT_HOURS_REQUIRED_ERROR })
  if (!draft.end_time) errors.push({ field: 'end_time', message: SHIFT_HOURS_REQUIRED_ERROR })
  if (draft.start_time && draft.start_time === draft.end_time) {
    errors.push({ field: 'end_time', message: SHIFT_HOURS_EQUAL_ERROR })
  }
  return errors
}

/** Minimal save gate: date + shift kind + vehicle (plate when private). */
export function validateShiftSave(draft: ShiftFormDraft): ShiftSaveError[] {
  const errors: ShiftSaveError[] = []
  if (!draft.shift_date?.trim()) {
    errors.push({ field: 'shift_date', message: 'יש לבחור תאריך' })
  }
  if (!draft.shift_kind) {
    errors.push({ field: 'shift_kind', message: 'יש לבחור שם משמרת' })
  }
  if (!draft.vehicle_type) {
    errors.push({ field: 'vehicle_type', message: 'יש לבחור סוג רכב' })
  }
  if (draft.vehicle_type === 'personal' && !draft.personal_vehicle_id) {
    errors.push({ field: 'personal_vehicle_id', message: 'יש לבחור לוחית לרכב פרטי' })
  }
  if (draft.responder_ids.length < 1 || draft.responder_ids.length > 3) {
    errors.push({ field: 'responder_ids', message: SHIFT_CREW_ERROR })
  }
  if (
    draft.odometer_start != null &&
    draft.odometer_end != null &&
    draft.odometer_end < draft.odometer_start
  ) {
    errors.push({ field: 'odometer_end', message: SHIFT_ODOMETER_ORDER_ERROR })
  }
  errors.push(...validateShiftHours(draft))
  return errors
}

export function shiftEventAlreadyLinkedMessage(policeEventId: string | null | undefined): string {
  const number = policeEventId?.trim()
  if (number) return `אירוע ${number} כבר מקושר למשמרת אחרת`
  return 'האירוע כבר מקושר למשמרת אחרת'
}

async function verifyPersonalVehicle(draft: ShiftFormDraft): Promise<string | null> {
  if (draft.vehicle_type !== 'personal' || !draft.personal_vehicle_id) return null

  const { data, error } = await supabase
    .from('vehicles')
    .select('user_id, archived')
    .eq('id', draft.personal_vehicle_id)
    .maybeSingle()

  if (error) {
    return 'שמירת המשמרת נכשלה. בדקו את החיבור ונסו שוב.'
  }
  if (!data || !draft.responder_ids.includes(data.user_id as string)) {
    return 'הרכב הפרטי חייב להיות של מתנדב משובץ למשמרת'
  }
  if (data.archived) {
    // A vehicle archived after the shift was logged stays on that shift's record.
    if (draft.id) {
      const { data: shift } = await supabase
        .from('shifts')
        .select('personal_vehicle_id')
        .eq('id', draft.id)
        .maybeSingle()
      if (shift?.personal_vehicle_id === draft.personal_vehicle_id) return null
    }
    return 'לא ניתן לשייך רכב בארכיון למשמרת. יש לבחור לוחית אחרת.'
  }
  return null
}

async function syncShiftResponders(
  shiftId: string,
  responderIds: string[],
  knownShifts: CrewLiveShift[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: existing, error: existingError } = await supabase
    .from('shift_responders')
    .select('id, responder_id')
    .eq('shift_id', shiftId)

  if (existingError) {
    return { ok: false, error: 'שמירת המשמרת נכשלה. בדקו את החיבור ונסו שוב.' }
  }

  const keepIds = new Set(responderIds)
  const toRemove = (existing ?? []).filter((row) => !keepIds.has(row.responder_id as string))

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from('shift_responders')
      .delete()
      .in(
        'id',
        toRemove.map((row) => row.id as string),
      )
    if (error) {
      return { ok: false, error: 'שמירת המשמרת נכשלה. בדקו את החיבור ונסו שוב.' }
    }
  }

  const existingResponderIds = new Set(
    (existing ?? []).map((row) => row.responder_id as string),
  )
  // Sorted so the database locks responders in the same order on every insert.
  const toAdd = responderIds
    .filter((responderId) => !existingResponderIds.has(responderId))
    .sort()

  if (toAdd.length > 0) {
    const { error } = await supabase.from('shift_responders').insert(
      toAdd.map((responder_id) => ({
        shift_id: shiftId,
        responder_id,
      })),
    )
    if (error) {
      return { ok: false, error: mapShiftUpdateError(error, knownShifts) }
    }
  }

  return { ok: true }
}

async function syncEventTypeCounts(
  shiftId: string,
  counts: { event_type_id: string; count: number }[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: existing, error: existingError } = await supabase
    .from('shift_event_type_counts')
    .select('id, event_type_id')
    .eq('shift_id', shiftId)

  if (existingError) {
    return { ok: false, error: 'שמירת המשמרת נכשלה. בדקו את החיבור ונסו שוב.' }
  }

  const keepTypeIds = new Set(counts.map((row) => row.event_type_id))
  const toRemove = (existing ?? []).filter(
    (row) => !keepTypeIds.has(row.event_type_id as string),
  )

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from('shift_event_type_counts')
      .delete()
      .in(
        'id',
        toRemove.map((row) => row.id as string),
      )
    if (error) {
      return { ok: false, error: 'שמירת המשמרת נכשלה. בדקו את החיבור ונסו שוב.' }
    }
  }

  const existingByType = new Map(
    (existing ?? []).map((row) => [row.event_type_id as string, row.id as string]),
  )

  for (const row of counts) {
    const existingId = existingByType.get(row.event_type_id)
    if (existingId) {
      const { error } = await supabase
        .from('shift_event_type_counts')
        .update({ count: row.count })
        .eq('id', existingId)
      if (error) {
        return { ok: false, error: 'שמירת המשמרת נכשלה. בדקו את החיבור ונסו שוב.' }
      }
    } else {
      const { error } = await supabase.from('shift_event_type_counts').insert({
        shift_id: shiftId,
        event_type_id: row.event_type_id,
        count: row.count,
      })
      if (error) {
        return { ok: false, error: 'שמירת המשמרת נכשלה. בדקו את החיבור ונסו שוב.' }
      }
    }
  }

  return { ok: true }
}

const SHIFT_IDENTITY_FORBIDDEN = 'אין הרשאה לשנות פרטי משמרת'
/** sync_shift_born_events: a lead lowering a count on another lead's shift. */
const SHIFT_BORN_DELETE_FORBIDDEN = 'אין הרשאה למחוק אירוע שנוצר על ידי אחמ״ש אחר.'
/** raise_crew_window_closed: a crew save before the shift starts or after its grace period. */
const SHIFT_NOT_STARTED = 'המשמרת עוד לא התחילה.'
const SHIFT_WINDOW_CLOSED = 'חלון התיעוד של המשמרת נסגר.'

export type ShiftUpdatePayload = {
  shift_date?: string
  shift_kind?: ShiftKind
  vehicle_type?: ShiftVehicleType
  personal_vehicle_id?: string | null
  odometer_start: number | null
  odometer_end: number | null
  total_km: number | null
  notes: string | null
  starts_at?: string
  ends_at?: string
  last_saved_by?: string
  updated_at: string
}

/** Build shift row update; omit identity columns when responder cannot edit them. */
export function buildShiftUpdatePayload(
  draft: ShiftFormDraft,
  options: { canEditIdentity: boolean },
): ShiftUpdatePayload {
  const body: ShiftUpdatePayload = {
    odometer_start: draft.odometer_start,
    odometer_end: draft.odometer_end,
    total_km: computeTotalKm(draft.odometer_start, draft.odometer_end),
    notes: draft.notes.trim() || null,
    updated_at: new Date().toISOString(),
  }

  if (!options.canEditIdentity) return body

  const window = shiftHasHours(draft)
    ? buildShiftWindowTimestamps(draft.shift_date, draft.start_time, draft.end_time)
    : {}

  return {
    ...body,
    ...window,
    shift_date: draft.shift_date,
    shift_kind: draft.shift_kind,
    vehicle_type: draft.vehicle_type,
    personal_vehicle_id:
      draft.vehicle_type === 'personal' ? draft.personal_vehicle_id : null,
  }
}

function mapShiftUpdateError(
  error: { message?: string; details?: string | null },
  knownShifts: CrewLiveShift[],
): string {
  if (error.message?.includes(SHIFT_OVERLAP_DB_MESSAGE)) {
    return mapShiftOverlapError(error, knownShifts)
  }
  if (error.message?.includes(SHIFT_IDENTITY_FORBIDDEN)) {
    return SHIFT_IDENTITY_FORBIDDEN
  }
  if (error.message?.includes(STALE_SAVE_MESSAGE)) {
    return STALE_SAVE_MESSAGE
  }
  if (error.message?.includes(COUNT_DECREASE_BLOCKED)) {
    return COUNT_DECREASE_BLOCKED
  }
  if (error.message?.includes(SHIFT_BORN_DELETE_FORBIDDEN)) {
    return SHIFT_BORN_DELETE_FORBIDDEN
  }
  if (error.message?.includes(SHIFT_NOT_STARTED)) {
    return SHIFT_NOT_STARTED
  }
  if (error.message?.includes(SHIFT_WINDOW_CLOSED)) {
    return SHIFT_WINDOW_CLOSED
  }
  return 'שמירת המשמרת נכשלה. בדקו את החיבור ונסו שוב.'
}

export async function refreshShiftLogStatus(
  shiftId: string,
): Promise<ShiftStatus | null> {
  const [{ data: shift, error: shiftError }, { data: events, error: eventsError }] =
    await Promise.all([
      supabase
        .from('shifts')
        .select('odometer_start, odometer_end')
        .eq('id', shiftId)
        .maybeSingle(),
      supabase
        .from('events')
        .select(
          'status, police_event_id, treatment_detail, treatment_notes, road_id, location, treated:event_treated_vehicles(quantity)',
        )
        .eq('shift_id', shiftId)
        .eq('origin', 'shift'),
    ])

  if (shiftError || eventsError || !shift) return null

  const status = deriveShiftLogStatus({
    odometer_start: (shift.odometer_start as number | null) ?? null,
    odometer_end: (shift.odometer_end as number | null) ?? null,
    events: (events ?? []).map((row) =>
      eventToLogSnapshot({
        status: row.status as EventStatus,
        police_event_id: row.police_event_id as string | null,
        treatment_detail: row.treatment_detail as string | null,
        treatment_notes: row.treatment_notes as string | null,
        road_id: row.road_id as string | null,
        location: row.location as string | null,
        treated: row.treated as { quantity?: number }[] | null,
      }),
    ),
  })

  await supabase.from('shifts').update({ status }).eq('id', shiftId)
  return status
}

/**
 * A lead saving hours or crew of a live shift: the crew's other live shifts, and a
 * refusal sentence when one of them already holds the same hours.
 */
async function loadCrewShiftsToCheck(
  draft: ShiftFormDraft,
  canEditIdentity: boolean,
  responderNames: Record<string, string> = {},
): Promise<{ ok: true; others: CrewLiveShift[] } | { ok: false; error: string }> {
  if (!canEditIdentity || !shiftHasHours(draft)) return { ok: true, others: [] }

  let others: CrewLiveShift[]
  try {
    others = await loadCrewLiveShifts(draft.responder_ids, draft.shift_date)
  } catch {
    return { ok: false, error: 'שמירת המשמרת נכשלה. בדקו את החיבור ונסו שוב.' }
  }
  const message = findCrewOverlapMessage({
    window: buildShiftWindowTimestamps(draft.shift_date, draft.start_time, draft.end_time),
    crew: draft.responder_ids.map((id) => ({ id, name: responderNames[id] ?? 'המתנדב' })),
    others,
    ignoreShiftId: draft.id,
  })
  return message ? { ok: false, error: message } : { ok: true, others }
}

export async function saveShiftForm(
  draft: ShiftFormDraft,
  shiftLeadId: string,
  options?: {
    syncResponders?: boolean
    canEditIdentity?: boolean
    /** Names for the overlap sentence, by responder id. */
    responderNames?: Record<string, string>
  },
): Promise<
  | { ok: true; shiftId: string; status: ShiftStatus }
  | {
      ok: false
      error: string
      fieldErrors?: ShiftSaveError[]
      /**
       * Set when the shift row itself was written before a later step failed.
       * The caller must adopt it, or every retry is refused as stale.
       */
      saved?: { shiftId: string; updated_at: string }
    }
> {
  const fieldErrors = validateShiftSave(draft)
  if (fieldErrors.length > 0) {
    return {
      ok: false,
      // Name the actual blocker. A reversed odometer is not a missing-field problem,
      // and telling the user to fill in the date would send them to the wrong section.
      error: summarizeShiftSaveErrors(fieldErrors),
      fieldErrors,
    }
  }

  const canEditIdentity = options?.canEditIdentity ?? true

  // Crew may write a shift only from its date on; the server answers a refusal
  // with zero rows, which must not read as someone else's save.
  if (!canEditIdentity && isShiftFuture(draft.shift_date)) {
    return { ok: false, error: SHIFT_TOO_EARLY_MESSAGE }
  }

  if (canEditIdentity) {
    const personalVehicleError = await verifyPersonalVehicle(draft)
    if (personalVehicleError) {
      return {
        ok: false,
        error: personalVehicleError,
        fieldErrors:
          draft.vehicle_type === 'personal'
            ? [{ field: 'personal_vehicle_id', message: personalVehicleError }]
            : undefined,
      }
    }
  }

  const crewShifts = await loadCrewShiftsToCheck(draft, canEditIdentity, options?.responderNames)
  if (!crewShifts.ok) return { ok: false, error: crewShifts.error }

  let shiftId = draft.id
  let written: { shiftId: string; updated_at: string }
  const syncResponders = options?.syncResponders ?? true

  if (shiftId) {
    const shiftPayload = {
      ...buildShiftUpdatePayload(draft, { canEditIdentity }),
      last_saved_by: shiftLeadId,
    }
    let query = supabase.from('shifts').update(shiftPayload).eq('id', shiftId)
    if (draft.expected_updated_at) {
      query = query.eq('updated_at', draft.expected_updated_at)
    }
    const { data, error } = await query.select('id, updated_at').maybeSingle()
    if (error) {
      return { ok: false, error: mapShiftUpdateError(error, crewShifts.others) }
    }
    if (!data) {
      if (!canEditIdentity) {
        // A lead may have moved the shift ahead while this form was open.
        const { data: current } = await supabase
          .from('shifts')
          .select('shift_date')
          .eq('id', shiftId)
          .maybeSingle()
        if (current?.shift_date && isShiftFuture(current.shift_date as string)) {
          return { ok: false, error: SHIFT_TOO_EARLY_MESSAGE }
        }
      }
      return { ok: false, error: STALE_SAVE_MESSAGE }
    }
    written = { shiftId, updated_at: data.updated_at as string }
  } else {
    const shiftPayload = {
      ...buildShiftUpdatePayload(draft, { canEditIdentity: true }),
      last_saved_by: shiftLeadId,
    }
    const { data, error } = await supabase
      .from('shifts')
      .insert({ ...shiftPayload, shift_lead_id: shiftLeadId, status: 'in_progress' })
      .select('id, updated_at')
      .single()

    if (error) {
      return { ok: false, error: mapShiftUpdateError(error, crewShifts.others) }
    }
    if (!data) {
      return { ok: false, error: 'שמירת המשמרת נכשלה. בדקו את החיבור ונסו שוב.' }
    }
    shiftId = data.id as string
    written = { shiftId, updated_at: data.updated_at as string }
  }

  if (syncResponders) {
    const respondersSync = await syncShiftResponders(shiftId, draft.responder_ids, crewShifts.others)
    if (!respondersSync.ok) return { ...respondersSync, saved: written }
  }

  const typeCountsSync = await syncEventTypeCounts(shiftId, draft.event_type_counts)
  if (!typeCountsSync.ok) return { ...typeCountsSync, saved: written }

  const { error: syncError } = await supabase.rpc('sync_shift_born_events', {
    p_shift_id: shiftId,
  })
  if (syncError) {
    return { ok: false, error: mapShiftUpdateError(syncError, crewShifts.others), saved: written }
  }

  const status = (await refreshShiftLogStatus(shiftId)) ?? 'in_progress'
  return { ok: true, shiftId, status }
}

/** Admin-only delete (enforced by RLS). */
export async function deleteShift(
  shiftId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from('shifts').delete().eq('id', shiftId)
  if (error) {
    return { ok: false, error: 'מחיקת המשמרת נכשלה. בדקו את ההרשאות ונסו שוב.' }
  }
  return { ok: true }
}

/** Recent events not already linked to another shift (optionally allow current shift's links). */
export async function loadLinkableEvents(excludeShiftId?: string): Promise<LinkableEvent[]> {
  const [{ data: linkedRows, error: linkedError }, { data: events, error: eventsError }] =
    await Promise.all([
      supabase.from('shift_events').select('event_id, shift_id'),
      supabase
        .from('events')
        .select('id, event_date, police_event_id, event_type:event_types(name)')
        .order('event_date', { ascending: false })
        .limit(200),
    ])

  if (linkedError) throw new Error(linkedError.message)
  if (eventsError) throw new Error(eventsError.message)

  const linkedEventIds = new Set(
    (linkedRows ?? [])
      .filter((row) => {
        const shiftId = row.shift_id as string
        return excludeShiftId == null || shiftId !== excludeShiftId
      })
      .map((row) => row.event_id as string),
  )
  return (events ?? []).filter((row) => !linkedEventIds.has(row.id as string)) as unknown as LinkableEvent[]
}

export async function refreshRollups(eventIds: string[]): Promise<{
  event_type_counts: { event_type_id: string; count: number }[]
  treated_vehicle_counts: { vehicle_kind_id: string; count: number }[]
  cancelled_count: number
}> {
  if (eventIds.length === 0) {
    return suggestRollupsFromLinkedEvents({ eventTypeIds: [], treated: [] })
  }

  const { data: events, error: eventsError } = await supabase
    .from('events')
    .select('event_type_id, is_cancelled')
    .in('id', eventIds)

  if (eventsError) throw new Error(eventsError.message)

  const eventTypeIds = (events ?? []).map((row) => row.event_type_id as string | null)
  const cancelledFlags = (events ?? []).map((row) => Boolean(row.is_cancelled))

  const { data: responders, error: respondersError } = await supabase
    .from('event_responders')
    .select('id')
    .in('event_id', eventIds)

  if (respondersError) throw new Error(respondersError.message)

  const responderIds = (responders ?? []).map((row) => row.id as string)
  let treated: { vehicle_kind_id: string; quantity: number }[] = []

  if (responderIds.length > 0) {
    const { data: treatedRows, error: treatedError } = await supabase
      .from('event_treated_vehicles')
      .select('vehicle_kind_id, quantity')
      .in('event_responder_id', responderIds)

    if (treatedError) throw new Error(treatedError.message)
    treated = (treatedRows ?? []) as { vehicle_kind_id: string; quantity: number }[]
  }

  return suggestRollupsFromLinkedEvents({ eventTypeIds, treated, cancelledFlags })
}
