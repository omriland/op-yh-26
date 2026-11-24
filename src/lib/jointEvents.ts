import { supabase } from './supabase'

export const JOINT_EVENT_CONFIRM_TITLE =
  'אירוע זה יתמזג עם אירוע קיים באותו התאריך. האם ברצונך להמשיך?'
export const JOINT_EVENT_CONFIRM_HINT =
  'תופעה זו יכולה לקרות כאשר משמרת ומתנדב ברכב פרטי טיפלו באותו האירוע יחד'
export const JOINT_EVENT_CONFIRM_PROCEED = 'המשך'
export const JOINT_EVENT_CONFIRM_CANCEL = 'ביטול'
export const JOINT_EVENT_LINE_LABEL = 'אירוע משותף עם'

export type JointEventOrigin = 'manual' | 'shift'

export type JointEventRow = {
  id: string
  event_date: string
  police_event_id: string | null
  origin: JointEventOrigin
  is_cancelled?: boolean
}

export type JointEventPartner = {
  id: string
  origin: JointEventOrigin
  shift_id: string | null
}

export type JointSaveDecision = 'free' | 'confirm' | 'blocked'

function trimmedNumber(policeEventId: string | null | undefined): string {
  return (policeEventId ?? '').trim()
}

function sharesNumberAndDate(row: JointEventRow, eventDate: string, number: string): boolean {
  if (row.is_cancelled) return false
  if (row.event_date.trim() !== eventDate.trim()) return false
  return trimmedNumber(row.police_event_id) === number
}

/** Whether saving this event is free, needs the joint confirm, or is a plain duplicate. */
export function jointSaveDecision(input: {
  eventDate: string
  policeEventId: string
  origin: JointEventOrigin
  currentEventId?: string | null
  existing: JointEventRow[]
}): JointSaveDecision {
  const number = trimmedNumber(input.policeEventId)
  if (!number) return 'free'

  const sharing = input.existing.filter((row) => sharesNumberAndDate(row, input.eventDate, number))
  if (input.currentEventId && sharing.some((row) => row.id === input.currentEventId)) return 'free'

  if (sharing.some((row) => row.origin === input.origin)) return 'blocked'
  return sharing.length > 0 ? 'confirm' : 'free'
}

export function jointPartnerHref(partner: JointEventPartner): string {
  if (partner.origin === 'shift' && partner.shift_id) {
    return `/shifts/${partner.shift_id}/event/${partner.id}`
  }
  return `/events/${partner.id}`
}

/** Event count where a manual and a shift event sharing number and date are one event. */
export function countEventsWithJointPairsOnce(events: JointEventRow[]): number {
  const active = events.filter((row) => !row.is_cancelled)
  const manualKeys = new Map<string, number>()
  const shiftKeys = new Map<string, number>()

  for (const row of active) {
    const number = trimmedNumber(row.police_event_id)
    if (!number) continue
    const bucket = row.origin === 'shift' ? shiftKeys : manualKeys
    const key = `${row.event_date}|${number}`
    bucket.set(key, (bucket.get(key) ?? 0) + 1)
  }

  let pairs = 0
  for (const [key, manualCount] of manualKeys) {
    pairs += Math.min(manualCount, shiftKeys.get(key) ?? 0)
  }
  return active.length - pairs
}

type PartnerRpcRow = {
  partner_id: string
  partner_origin: JointEventOrigin
  partner_shift_id: string | null
}

export async function fetchJointPartner(eventId: string): Promise<JointEventPartner | null> {
  const { data, error } = await supabase.rpc('joint_event_partner', { p_event_id: eventId })
  if (error) throw new Error(error.message)
  const row = ((data ?? []) as PartnerRpcRow[])[0]
  if (!row) return null
  return { id: row.partner_id, origin: row.partner_origin, shift_id: row.partner_shift_id }
}

/** Same-day rows that share a number, from any origin, for the joint decision. */
export async function fetchJointCandidateRows(input: {
  eventDate: string
  policeEventId: string
}): Promise<JointEventRow[]> {
  const number = trimmedNumber(input.policeEventId)
  const eventDate = input.eventDate.trim()
  if (!number || !eventDate) return []
  const { data, error } = await supabase
    .from('events')
    .select('id, event_date, police_event_id, origin, is_cancelled')
    .eq('event_date', eventDate)
    .eq('police_event_id', number)
    .eq('is_cancelled', false)
  if (error) throw new Error(error.message)
  return (data ?? []) as JointEventRow[]
}
