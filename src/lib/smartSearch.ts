import type { SmartSearchFilter } from '../../supabase/functions/_shared/smartSearchFilter.ts'
import { formatDate, formatPlate } from './format.ts'
import { eventStamp } from './status.ts'

export function isBlankQuery(q: string): boolean {
  return q.replace(/[\s\p{P}\p{S}\p{Cf}]/gu, '') === ''
}

export function isDirectQuery(q: string): boolean {
  return /^[\d\s\-/.]+$/.test(q) && /\d/.test(q)
}

export function directFilter(q: string): SmartSearchFilter {
  return { intent: 'find', entity: 'both', source: 'both', text: q.trim() }
}

export type SearchChip = { key: keyof SmartSearchFilter | 'dates'; label: string; numeric: boolean }

function datesLabel(from?: string, to?: string): string {
  if (from && to) return from === to ? formatDate(from) : `${formatDate(from)}–${formatDate(to)}`
  return from ? `מ־${formatDate(from)}` : `עד ${formatDate(to!)}`
}

export function chipsForFilter(f: SmartSearchFilter): SearchChip[] {
  const chips: SearchChip[] = []
  const add = (key: SearchChip['key'], label: string, numeric = false) => chips.push({ key, label, numeric })
  if (f.road) add('road', `כביש ${f.road}`)
  if (f.police_event_id) add('police_event_id', `אירוע ${f.police_event_id}`, true)
  if (f.plate) add('plate', `לוחית ${formatPlate(f.plate)}`, true)
  if (f.vehicle_text) add('vehicle_text', f.vehicle_text)
  if (f.person) {
    const prefix = f.person_role === 'responder' ? 'כונן: ' : f.person_role === 'lead' ? 'אחמ״ש: ' : ''
    add('person', `${prefix}${f.person}`)
  }
  if (f.event_type) add('event_type', f.event_type)
  if (f.district) add('district', f.district)
  if (f.location_text) add('location_text', f.location_text)
  if (f.date_from || f.date_to) add('dates', datesLabel(f.date_from, f.date_to), true)
  if (f.text) add('text', `״${f.text}״`)
  if (f.damaged) add('damaged', 'עם נזק')
  if (f.damage_location) add('damage_location', `נזק: ${f.damage_location}`)
  if (f.status) add('status', eventStamp(f.status).label)
  if (f.include_cancelled) add('include_cancelled', 'כולל מבוטלים')
  if (f.source === 'new') add('source', 'אירועים חדשים בלבד')
  if (f.source === 'archive') add('source', 'ארכיון בלבד')
  return chips
}

export function removeChip(f: SmartSearchFilter, key: SearchChip['key']): SmartSearchFilter {
  const next = { ...f }
  if (key === 'dates') {
    delete next.date_from
    delete next.date_to
  } else if (key === 'source') {
    next.source = 'both'
  } else if (key === 'person') {
    delete next.person
    delete next.person_role
  } else {
    delete next[key]
  }
  return next
}

export type SearchSection = 'events' | 'archive' | 'people'

export function sectionOrder(f: SmartSearchFilter, firstNewEventDate: string | null): SearchSection[] {
  const sections: SearchSection[] = []
  if (f.entity !== 'people') {
    if (f.source !== 'archive') sections.push('events')
    if (f.source !== 'new') sections.push('archive')
    const archiveFirst = f.date_to && firstNewEventDate && f.date_to < firstNewEventDate
    if (archiveFirst && sections.length === 2) sections.reverse()
  }
  if (f.entity !== 'events') sections.push('people')
  return sections
}
