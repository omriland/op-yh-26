import { fetchDuplicateClusters } from '../duplicateEventsReport'
import { loadEventsByResponderReport } from '../eventsByResponderReport'
import {
  defaultFuelRefundRange,
  isValidFuelRefundRange,
} from '../fuelRefundReport'
import { formatDate, formatDayHeading, formatNumber, formatTime } from '../format'
import {
  applyLeadKmFromOdometer,
  loadKmDiscrepancyReport,
  policeEventLabel,
} from '../kmDiscrepancyReport'
import { fetchKmExceptionRows } from '../kmExceptionsReport'
import {
  documentationFillLabel,
  loadOpenDocumentationReport,
} from '../openDocumentationReport'
import type { ReportKind, ReportTableRow } from './types'

function person(name: string | null | undefined, callsign: string | null | undefined): string {
  return [name, callsign].filter(Boolean).join(' · ') || '—'
}

function lead(callsign: string | null | undefined, name: string | null | undefined): string {
  return [callsign, name].filter(Boolean).join(' · ') || '—'
}

function km(value: number | null): string {
  return value == null ? '—' : formatNumber(value)
}

function place(road: string | null | undefined, location: string | null | undefined): string {
  return [road, location].filter(Boolean).join(' · ') || '—'
}

function eventType(name: string | null | undefined, cancelled?: boolean): string {
  const label = cancelled ? ['בוטל', name].filter(Boolean).join(' · ') : name
  return label || '—'
}

function requireRange(inputs: { from?: string; to?: string }): { from: string; to: string } | null {
  const defaults = defaultFuelRefundRange()
  const from = inputs.from ?? defaults.from
  const to = inputs.to ?? defaults.to
  if (!isValidFuelRefundRange(from, to)) return null
  return { from, to }
}

const openDocumentation: ReportKind = {
  id: 'open_documentation',
  title: 'אירועים שהוזנו ע״י אחמ״ש ולא נסגרו ע״י מתנדב',
  includes: 'אירועים שהוזנו על ידי אחמ״ש ומתנדב טרם השלים את התיעוד שלהם',
  audience: 'admin_and_shift_lead',
  hasDateRange: true,
  hasPeriodPicker: true,
  searchPlaceholder: 'חיפוש לפי מתנדב, מספר אירוע או מיקום',
  csvFilename: 'אירועים-פתוחים-לתיעוד.csv',
  columns: [
    { id: 'police', header: 'מס אירוע', numeric: true },
    { id: 'date', header: 'תאריך', numeric: true },
    { id: 'responder', header: 'מתנדב' },
    { id: 'lead', header: 'אחמ״ש' },
    { id: 'place', header: 'כביש ומיקום' },
    { id: 'fill', header: 'סטטוס תיעוד' },
  ],
  async load(inputs) {
    const range = requireRange(inputs)
    if (!range || !inputs.viewer) return []
    const rows = await loadOpenDocumentationReport(range.from, range.to, inputs.viewer)
    return rows.map((row): ReportTableRow => {
      const responder = person(row.responder_name, row.responder_callsign)
      const placeText = place(row.road_name, row.location)
      return {
        id: row.id,
        eventId: row.event_id,
        searchText: [responder, row.police_event_id ?? '', placeText].join(' '),
        values: [
          row.police_event_id ?? '—',
          formatDate(row.event_date),
          responder,
          person(row.shift_lead_name, row.shift_lead_callsign),
          placeText,
          documentationFillLabel(row.fill_status),
        ],
      }
    })
  },
}

const eventsByResponder: ReportKind = {
  id: 'events_by_responder',
  title: 'אירועים לפי מתנדב',
  includes: 'כל האירועים של כל מתנדב בטווח התאריכים שנבחר',
  audience: 'admin_and_shift_lead',
  hasDateRange: true,
  hasPeriodPicker: true,
  searchPlaceholder: 'חיפוש לפי מתנדב, מספר אירוע או מיקום',
  csvFilename: 'אירועים-לפי-מתנדב.csv',
  columns: [
    { id: 'responder', header: 'מתנדב' },
    { id: 'date', header: 'תאריך', numeric: true },
    { id: 'police', header: 'מספר אירוע', numeric: true },
    { id: 'type', header: 'סוג אירוע' },
    { id: 'district', header: 'שלוחה' },
    { id: 'place', header: 'כביש ומיקום' },
    { id: 'lead', header: 'אחמ״ש' },
    { id: 'km', header: 'ק״מ', numeric: true },
  ],
  async load(inputs) {
    const range = requireRange(inputs)
    if (!range) return []
    const rows = await loadEventsByResponderReport(range.from, range.to)
    return rows.map((row): ReportTableRow => {
      const responder = person(row.responder_name, row.responder_callsign)
      const placeText = place(row.road_name, row.location)
      const leadText = lead(row.shift_lead_callsign, row.shift_lead_name)
      return {
        id: row.id,
        eventId: row.event_id,
        groupKey: row.responder_id,
        groupLabel: responder,
        searchText: [responder, row.police_event_id ?? '', placeText, row.district_name ?? ''].join(' '),
        values: [
          responder,
          formatDate(row.event_date),
          policeEventLabel(row.police_event_id, row.is_cancelled),
          eventType(row.event_type_name),
          row.district_name ?? '—',
          placeText,
          leadText,
          km(row.total_km),
        ],
      }
    })
  },
}

const kmDiscrepancy: ReportKind = {
  id: 'km_discrepancy',
  title: 'אירועים עם פערי דיווח ק״מ',
  includes: 'אירועים בהם יש פער בין דיווח האחמ״ש לבין הק״מ שהזין המתנדב',
  audience: 'admin',
  hasDateRange: true,
  hasPeriodPicker: true,
  searchPlaceholder: 'חיפוש לפי מתנדב, מספר אירוע או מיקום',
  csvFilename: 'פערי-דיווח-קמ.csv',
  columns: [
    { id: 'police', header: 'מספר אירוע', numeric: true },
    { id: 'date', header: 'תאריך', numeric: true },
    { id: 'place', header: 'כביש ומיקום' },
    { id: 'responder', header: 'מתנדב' },
    { id: 'lead', header: 'אחמ״ש' },
    { id: 'lead_km', header: 'ק״מ אחמ״ש', numeric: true },
    { id: 'responder_km', header: 'ק״מ מתנדב', numeric: true },
    { id: 'diff', header: 'הפרש', numeric: true },
  ],
  action: {
    columnId: 'responder_km',
    hoverText: 'החלפת הקילומטרים של האחמ״ש במספר זה',
    confirmTitle: 'החלפת קילומטרים?',
    confirmBody: (row) =>
      `הקילומטרים שהזין האחמ״ש יוחלפו ב־${formatNumber(row.actionValue ?? 0)} ק״מ לפי מד האוץ של המתנדב.`,
    async apply(row) {
      if (!row.assignmentId) throw new Error('missing assignment')
      await applyLeadKmFromOdometer(row.assignmentId)
    },
  },
  async load(inputs) {
    const range = requireRange(inputs)
    if (!range) return []
    const rows = await loadKmDiscrepancyReport(range.from, range.to)
    return rows.map((row): ReportTableRow => {
      const responder = person(row.responder_name, row.responder_callsign)
      const placeText = place(row.road_name, row.location)
      return {
        id: row.id,
        eventId: row.event_id,
        assignmentId: row.assignment_id,
        actionValue: row.responder_km,
        searchText: [responder, row.police_event_id ?? '', placeText].join(' '),
        values: [
          policeEventLabel(row.police_event_id, row.is_cancelled),
          formatDate(row.event_date),
          placeText,
          responder,
          person(row.shift_lead_name, row.shift_lead_callsign),
          formatNumber(row.lead_km),
          formatNumber(row.responder_km),
          formatNumber(row.diff),
        ],
      }
    })
  },
}

const kmExceptions: ReportKind = {
  id: 'km_exceptions',
  title: 'חריגי ק״מ',
  includes: 'אירועים עם 60 ק״מ ומעלה',
  audience: 'admin_and_shift_lead',
  hasDateRange: true,
  hasPeriodPicker: true,
  csvFilename: 'חריגי-קמ.csv',
  columns: [
    { id: 'date', header: 'תאריך', numeric: true },
    { id: 'responder', header: 'כונן' },
    { id: 'km', header: 'ק״מ', numeric: true },
    { id: 'type', header: 'סוג אירוע' },
    { id: 'place', header: 'כביש / מיקום' },
    { id: 'lead', header: 'אחמ״ש' },
    { id: 'police', header: 'מספר אירוע', numeric: true },
  ],
  async load(inputs) {
    const range = requireRange(inputs)
    if (!range) return []
    const rows = await fetchKmExceptionRows(range.from, range.to)
    return rows.map(
      (row): ReportTableRow => ({
        id: `${row.event_id}:${row.responder_callsign}:${row.total_km}`,
        eventId: row.event_id,
        groupKey: row.event_date,
        groupLabel: formatDayHeading(row.event_date),
        values: [
          formatDate(row.event_date),
          person(row.responder_name, row.responder_callsign),
          formatNumber(row.total_km),
          eventType(row.event_type_name, row.is_cancelled),
          place(row.road_name, row.location),
          row.shift_lead_name ?? '—',
          row.police_event_id ?? '—',
        ],
      }),
    )
  },
}

const duplicateEvents: ReportKind = {
  id: 'duplicate_events',
  title: 'אירועים כפולים',
  includes: 'אירועים עם אותו הכונן, באותו מקום בחלון זמן של חצי שעה',
  audience: 'admin_and_shift_lead',
  hasDateRange: false,
  csvFilename: 'אירועים-כפולים.csv',
  columns: [
    { id: 'date', header: 'תאריך', numeric: true },
    { id: 'time', header: 'שעה', numeric: true },
    { id: 'responder', header: 'כונן' },
    { id: 'type', header: 'סוג אירוע' },
    { id: 'place', header: 'כביש / מיקום' },
    { id: 'police', header: 'מספר אירוע', numeric: true },
  ],
  async load() {
    const clusters = await fetchDuplicateClusters()
    return clusters.flatMap((cluster) =>
      cluster.members.map(
        (member): ReportTableRow => ({
          id: `${cluster.id}:${member.event_id}:${member.responder_id}`,
          eventId: member.event_id,
          groupKey: cluster.id,
          groupLabel: `${formatDate(cluster.event_date)} · ${cluster.sizeLabel}`,
          values: [
            formatDate(member.event_date),
            formatTime(member.started_at) ?? '—',
            person(member.full_name, member.callsign),
            eventType(member.event_type_name, member.is_cancelled),
            place(member.road_name, member.location),
            member.police_event_id ?? '—',
          ],
        }),
      ),
    )
  },
}

export const REPORT_KINDS: ReportKind[] = [
  openDocumentation,
  eventsByResponder,
  kmDiscrepancy,
  kmExceptions,
  duplicateEvents,
]

export function reportKindById(id: string): ReportKind | undefined {
  return REPORT_KINDS.find((kind) => kind.id === id)
}
