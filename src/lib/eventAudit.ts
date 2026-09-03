import type { AppRole } from './auth'
import { supabase } from './supabase'

export const EVENT_AUDIT_PAGE_SIZE = 50
export const EVENT_AUDIT_LOAD_MORE_LABEL = 'טען עוד'
export const EVENT_AUDIT_NOISE_KEYS = ['updated_at'] as const

export type EventAuditOp = 'INSERT' | 'UPDATE' | 'DELETE'
export type EventAuditTable = 'events' | 'event_responders'
export type EventAuditJson = Record<string, unknown> | null

export type EventAuditRow = {
  id: string
  table_name: EventAuditTable
  row_id: string
  event_id: string | null
  op: EventAuditOp
  actor_id: string | null
  changed_at: string
  old_row: EventAuditJson
  new_row: EventAuditJson
  changed_fields: string[] | null
  actor_name: string | null
  actor_callsign: string | null
  police_event_id: string | null
}

const FIELD_LABELS: Record<string, string> = {
  id: 'מזהה',
  shift_lead_id: 'אחמ״ש',
  event_date: 'תאריך',
  police_event_id: 'מספר אירוע',
  district_id: 'שלוחה',
  patrol_callsign: 'או״ק סיור',
  event_type_id: 'סוג אירוע',
  notes: 'הערות',
  road_id: 'כביש',
  location: 'מיקום',
  status: 'סטטוס',
  created_at: 'נוצר',
  updated_at: 'עודכן',
  is_cancelled: 'בוטל',
  location_place_id: 'מזהה מקום',
  location_lat: 'קו רוחב',
  location_lng: 'קו אורך',
  origin: 'מקור',
  shift_id: 'משמרת',
  treatment_detail: 'פירוט טיפול',
  emergency_means: 'אמצעי חירום',
  treatment_notes: 'הערות טיפול',
  last_saved_by: 'נשמר לאחרונה ע״י',
  approved_over_60km: 'אושר מעל 60 ק״מ',
  approved_suspicious_duplicate: 'אושר ככפול',
  frozen_over_60km: 'נעול מעל 60 ק״מ',
  frozen_suspicious_duplicate: 'נעול ככפול',
  approved_over_60km_responder_ids: 'מאושרי 60 ק״מ',
  location_pin_source: 'מקור סיכה',
  location_pinned_at: 'סיכה עודכנה',
  location_pinned_by: 'סיכה עודכנה ע״י',
  bus_lane: 'נתיב תחבורה ציבורית',
  event_id: 'אירוע',
  responder_id: 'כונן',
  vehicle_plate: 'לוחית',
  total_km: 'קילומטרים',
  odometer_start: 'מד אוץ התחלה',
  odometer_end: 'מד אוץ סיום',
  route: 'מסלול',
  started_at: 'שעת התחלה',
  ended_at: 'שעת סיום',
  fill_token_hash: 'טוקן מילוי',
  fill_token_expires_at: 'תוקף טוקן מילוי',
  fill_ready_emailed_at: 'נשלח מייל מילוי',
  track_token_hash: 'טוקן מעקב',
  track_token_expires_at: 'תוקף טוקן מעקב',
  tracking_sms_sent_at: 'נשלח SMS מעקב',
  fill_completable_at: 'ניתן להשלים מילוי',
  overdue_48h_emailed_at: 'תזכורת 48ש',
  overdue_7d_emailed_at: 'תזכורת 7י',
}

const OP_LABELS: Record<EventAuditOp, string> = {
  INSERT: 'יצירה',
  UPDATE: 'עדכון',
  DELETE: 'מחיקה',
}

const TABLE_LABELS: Record<EventAuditTable, string> = {
  events: 'אירוע',
  event_responders: 'כונן',
}

type AuditDbRow = {
  id: string
  table_name: EventAuditTable
  row_id: string
  event_id: string | null
  op: EventAuditOp
  actor_id: string | null
  changed_at: string
  old_row: EventAuditJson
  new_row: EventAuditJson
  changed_fields: string[] | null
}

function uniqueIds(ids: Array<string | null | undefined>): string[] {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))]
}

export function canReadEventAudit(roles: readonly AppRole[]): boolean {
  return roles.includes('super_admin')
}

export function eventAuditOpLabel(op: EventAuditOp): string {
  return OP_LABELS[op]
}

export function eventAuditTableLabel(tableName: EventAuditTable): string {
  return TABLE_LABELS[tableName]
}

export function eventAuditFieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key
}

export function eventAuditActorName(row: Pick<EventAuditRow, 'actor_name' | 'actor_callsign' | 'actor_id'>): string {
  const name = row.actor_name?.trim()
  if (name) {
    return row.actor_callsign ? `${name} · ${row.actor_callsign}` : name
  }
  return row.actor_id ? 'משתמש' : 'מערכת'
}

export function eventAuditEventLabel(row: Pick<EventAuditRow, 'police_event_id' | 'event_id'>): string {
  const number = row.police_event_id?.trim()
  if (number) return number
  return row.event_id ?? '—'
}

export function eventAuditChangedKeys(
  oldRow: EventAuditJson,
  newRow: EventAuditJson,
  stored?: string[] | null,
): string[] {
  if (stored && stored.length > 0) {
    return stored.filter((key) => !EVENT_AUDIT_NOISE_KEYS.includes(key as (typeof EVENT_AUDIT_NOISE_KEYS)[number]))
  }
  const keys = new Set([...Object.keys(oldRow ?? {}), ...Object.keys(newRow ?? {})])
  return [...keys]
    .filter((key) => !EVENT_AUDIT_NOISE_KEYS.includes(key as (typeof EVENT_AUDIT_NOISE_KEYS)[number]))
    .filter((key) => !Object.is((oldRow ?? {})[key], (newRow ?? {})[key]))
    .sort()
}

export function eventAuditSummary(row: Pick<EventAuditRow, 'op' | 'old_row' | 'new_row' | 'changed_fields'>): string {
  if (row.op === 'INSERT') return 'יצירה'
  if (row.op === 'DELETE') return 'מחיקה'
  const keys = eventAuditChangedKeys(row.old_row, row.new_row, row.changed_fields)
  if (keys.length === 0) return 'עדכון'
  return keys.map(eventAuditFieldLabel).join(' · ')
}

export function eventAuditValueLabel(value: unknown): string {
  if (value == null) return '—'
  if (typeof value === 'boolean') return value ? 'כן' : 'לא'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return value.trim() || '—'
  return JSON.stringify(value)
}

export function eventAuditFieldDiffs(
  oldRow: EventAuditJson,
  newRow: EventAuditJson,
  stored?: string[] | null,
): Array<{ key: string; label: string; before: string; after: string }> {
  return eventAuditChangedKeys(oldRow, newRow, stored).map((key) => ({
    key,
    label: eventAuditFieldLabel(key),
    before: eventAuditValueLabel((oldRow ?? {})[key]),
    after: eventAuditValueLabel((newRow ?? {})[key]),
  }))
}

function policeEventIdFromJson(row: EventAuditJson): string | null {
  const value = row?.police_event_id
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

async function hydrateAuditRows(rows: AuditDbRow[]): Promise<EventAuditRow[]> {
  const actorIds = uniqueIds(rows.map((row) => row.actor_id))
  const eventIds = uniqueIds(rows.map((row) => row.event_id))

  const [actorsRes, eventsRes] = await Promise.all([
    actorIds.length
      ? supabase.from('profiles').select('id, full_name, callsign').in('id', actorIds)
      : Promise.resolve({ data: [] as Array<{ id: string; full_name: string; callsign: string }>, error: null }),
    eventIds.length
      ? supabase.from('events').select('id, police_event_id').in('id', eventIds)
      : Promise.resolve({ data: [] as Array<{ id: string; police_event_id: string | null }>, error: null }),
  ])

  const actors = new Map(
    (actorsRes.data ?? []).map((row) => [row.id, { name: row.full_name, callsign: row.callsign }]),
  )
  const events = new Map((eventsRes.data ?? []).map((row) => [row.id, row.police_event_id]))

  return rows.map((row) => {
    const actor = row.actor_id ? actors.get(row.actor_id) : undefined
    return {
      ...row,
      actor_name: actor?.name ?? null,
      actor_callsign: actor?.callsign ?? null,
      police_event_id:
        (row.event_id ? events.get(row.event_id) : null) ??
        policeEventIdFromJson(row.new_row) ??
        policeEventIdFromJson(row.old_row),
    }
  })
}

export async function fetchEventAuditPage(input: {
  offset: number
  eventId?: string
  limit?: number
}): Promise<{ rows: EventAuditRow[]; hasMore: boolean; nextOffset: number }> {
  const limit = input.limit ?? EVENT_AUDIT_PAGE_SIZE
  const from = input.offset
  const to = input.offset + limit - 1

  let query = supabase
    .from('event_audit')
    .select(
      'id, table_name, row_id, event_id, op, actor_id, changed_at, old_row, new_row, changed_fields',
    )
    .order('changed_at', { ascending: false })
    .range(from, to)

  if (input.eventId) query = query.eq('event_id', input.eventId)

  const { data, error } = await query
  if (error) throw new Error(error.message)

  const fetched = (data ?? []) as AuditDbRow[]
  return {
    rows: await hydrateAuditRows(fetched),
    hasMore: fetched.length === limit,
    nextOffset: input.offset + fetched.length,
  }
}
