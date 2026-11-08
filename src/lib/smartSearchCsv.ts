import type { EventListItem } from './events'
import { formatDate, formatPlate } from './format'
import { eventLifecycle, lifecycleLabel } from './eventLifecycle'
import { toCsv } from './reports/csv'
import type { ArchiveRow } from './smartSearchApi'

type PlateRow = { plate_number: string; manufacturer?: string | null; model?: string | null; sort_order?: number }
type CsvEvent = Omit<EventListItem, 'responders'> & {
  found_by: string
  shared_plates?: PlateRow[] | null
  responders: (EventListItem['responders'][number] & { treated_plates?: PlateRow[] | null })[]
}

const bySortOrder = (a: PlateRow, b: PlateRow) => (a.sort_order ?? 0) - (b.sort_order ?? 0)

/** Event-owned plates first, then each responder's, one entry per plate number. */
function eventPlates(e: CsvEvent): PlateRow[] {
  const all = [
    ...[...(e.shared_plates ?? [])].sort(bySortOrder),
    ...e.responders.flatMap((r) => [...(r.treated_plates ?? [])].sort(bySortOrder)),
  ]
  const seen = new Set<string>()
  return all.filter((p) => {
    if (seen.has(p.plate_number)) return false
    seen.add(p.plate_number)
    return true
  })
}

const EVENT_HEADERS = [
  'תאריך', 'מספר אירוע', 'סוג אירוע', 'כביש / מיקום', 'אחמ״ש', 'מתנדבים', 'סטטוס תיעוד',
  'נמצא לפי', 'לוחיות', 'יצרן ודגם', 'כוננים', 'ק״מ', 'פירוט הטיפול',
]

export function eventsCsv(rows: CsvEvent[]): string {
  return toCsv(
    EVENT_HEADERS,
    rows.map((e) => {
      const plates = eventPlates(e)
      const done = e.responders.filter((r) => r.status === 'done').length
      return [
        formatDate(e.event_date),
        e.police_event_id ?? '',
        e.event_type?.name ?? '',
        [e.road?.name, e.location].filter(Boolean).join(' · '),
        e.origin === 'shift' ? '' : (e.shift_lead?.full_name ?? ''),
        `${done}/${e.responders.length}`,
        lifecycleLabel(eventLifecycle(e).status, 'lead'),
        e.found_by,
        plates.map((p) => formatPlate(p.plate_number)).join('; '),
        plates.map((p) => [p.manufacturer, p.model].filter(Boolean).join(' ')).join('; '),
        e.responders.map((r) => r.profile?.full_name ?? r.profile?.callsign ?? '').join('; '),
        e.responders.map((r) => (r.total_km == null ? '' : String(r.total_km))).join('; '),
        e.treatment_detail ?? '',
      ]
    }),
  )
}

const ARCHIVE_HEADERS = ['תאריך', 'מספר אירוע', 'כביש / מיקום', 'כוננים', 'רכבים', 'נזק', 'נמצא לפי', 'פעולות שבוצעו']

export function archiveCsv(rows: ArchiveRow[]): string {
  return toCsv(
    ARCHIVE_HEADERS,
    rows.map((r) => [
      r.event_date ? formatDate(r.event_date) : '',
      r.event_number ?? '',
      [r.road, r.location].filter(Boolean).join(' · '),
      r.people,
      r.cars,
      r.damage,
      r.found_by,
      r.actions,
    ]),
  )
}

export function searchCsvFilename(kind: 'events' | 'archive', today: string): string {
  return `חיפוש-${kind === 'events' ? 'אירועים' : 'ארכיון'}-${today}.csv`
}
