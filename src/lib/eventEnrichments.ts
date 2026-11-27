import { supabase } from './supabase'

export type EventEnrichment = {
  id: string
  event_id: string
  author_id: string | null
  author_name: string | null
  author_callsign: string | null
  body: string
  is_gold: boolean
  created_at: string
}

export const ENRICHMENTS_LABEL = 'העשרות'
export const ENRICHMENT_INPUT_LABEL = 'הוספת העשרה'
export const ENRICHMENT_SUBMIT_LABEL = 'הוספה'
export const ENRICHMENT_SAVING_LABEL = 'מוסיף…'
export const ENRICHMENTS_EMPTY = 'עדיין אין העשרות'
export const ENRICHMENTS_LOADING = 'טוען העשרות…'
export const ENRICHMENTS_LOAD_ERROR = 'לא הצלחנו לטעון את ההעשרות. נסו שוב.'
export const ENRICHMENTS_RETRY_LABEL = 'נסו שוב'
export const ENRICHMENT_ADD_ERROR = 'ההעשרה לא נשמרה. הטקסט נשאר בתיבה, נסו שוב.'
export const ENRICHMENT_GOLD_ERROR = 'לא הצלחנו לעדכן את העשרת הזהב. נסו שוב.'
export const ENRICHMENT_ADDED = 'ההעשרה נוספה'
export const DELETED_AUTHOR_LABEL = 'משתמש שנמחק'

const TIME_ZONE = 'Asia/Jerusalem'

const timestampFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

export function sortEnrichmentsOldestFirst(items: readonly EventEnrichment[]): EventEnrichment[] {
  return [...items].sort((a, b) => {
    const byTime = Date.parse(a.created_at) - Date.parse(b.created_at)
    if (byTime !== 0) return byTime
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

export type EnrichmentBodyCheck = { ok: true; body: string } | { ok: false; reason: 'empty' }

/** Plain text only: trims the outside, unifies line breaks, keeps everything else as typed. */
export function validateEnrichmentBody(raw: string): EnrichmentBodyCheck {
  const body = raw.replace(/\r\n?/g, '\n').trim()
  if (body === '') return { ok: false, reason: 'empty' }
  return { ok: true, body }
}

export function canSubmitEnrichment(text: string, saving: boolean): boolean {
  return !saving && validateEnrichmentBody(text).ok
}

/** `DD.MM.YYYY HH:mm` in Israel time, or an empty string for an invalid date. */
export function formatEnrichmentTimestamp(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Map(timestampFormatter.formatToParts(date).map((part) => [part.type, part.value]))
  const day = `${parts.get('day')}.${parts.get('month')}.${parts.get('year')}`
  return `${day} ${parts.get('hour')}:${parts.get('minute')}`
}

export function enrichmentsHeading(count: number): string {
  return `${ENRICHMENTS_LABEL} (${count})`
}

export function goldToggleLabel(isGold: boolean): string {
  return isGold ? 'בטל העשרת זהב' : 'סמן כהעשרת זהב'
}

/** Name and callsign as the author is known today; a neutral label when the name is gone. */
export function enrichmentAuthorLabel(item: EventEnrichment): string {
  const name = item.author_name?.trim()
  if (!name) return DELETED_AUTHOR_LABEL
  const callsign = item.author_callsign?.trim()
  return callsign ? `${name} (${callsign})` : name
}

/** A new list where only the chosen comment has the given gold flag. */
export function setEnrichmentGold(
  items: readonly EventEnrichment[],
  id: string,
  isGold: boolean,
): EventEnrichment[] {
  return items.map((item) => (item.id === id ? { ...item, is_gold: isGold } : item))
}

export async function listEventEnrichments(eventId: string): Promise<EventEnrichment[] | null> {
  const { data, error } = await supabase.rpc('list_event_enrichments', { p_event_id: eventId })
  if (error || !data) return null
  return sortEnrichmentsOldestFirst(data as EventEnrichment[])
}

/** Saves a comment. The database fills in the author and the time. */
export async function addEventEnrichment(eventId: string, body: string): Promise<boolean> {
  const { error } = await supabase.from('event_enrichments').insert({ event_id: eventId, body })
  return !error
}

export async function setEventEnrichmentGold(id: string, isGold: boolean): Promise<boolean> {
  const { error } = await supabase.rpc('set_event_enrichment_gold', {
    p_enrichment_id: id,
    p_gold: isGold,
  })
  return !error
}
