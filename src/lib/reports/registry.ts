import { fetchDuplicateClusters } from '../duplicateEventsReport'
import { loadFuelDetailReport } from '../fuelDetailReport'
import {
  defaultFuelRefundRange,
  isValidFuelRefundRange,
  loadFuelRefundReport,
} from '../fuelRefundReport'
import { formatDate, formatDayHeading, formatNumber, formatTime } from '../format'
import { fetchKmExceptionRows } from '../kmExceptionsReport'
import type { ReportKind, ReportTableRow } from './types'

function person(name: string | null | undefined, callsign: string | null | undefined): string {
  return [name, callsign].filter(Boolean).join(' · ') || '—'
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

const kmSummary: ReportKind = {
  id: 'km_summary',
  title: 'סיכום ק״מ לפי כונן',
  includes: 'קילומטרים ואירועים לכל כונן פעיל לפי תאריך דיווח',
  audience: 'admin',
  hasDateRange: true,
  csvFilename: 'סיכום-קמ.csv',
  columns: [
    { id: 'responder', header: 'כונן' },
    { id: 'km', header: 'קילומטרים', numeric: true },
    { id: 'events', header: 'אירועים', numeric: true },
  ],
  async load(inputs) {
    const range = requireRange(inputs)
    if (!range) return []
    const rows = await loadFuelRefundReport(range.from, range.to)
    return rows.map(
      (row): ReportTableRow => ({
        id: row.id,
        values: [person(row.full_name, row.callsign), formatNumber(row.total_km), formatNumber(row.event_count)],
      }),
    )
  },
}

const kmDetail: ReportKind = {
  id: 'km_detail',
  title: 'פירוט ק״מ לפי השתתפות',
  includes: 'שורה לכל השתתפות עם ק״מ לפי תאריך דיווח',
  audience: 'admin',
  hasDateRange: true,
  csvFilename: 'פירוט-קמ.csv',
  columns: [
    { id: 'responder', header: 'כונן' },
    { id: 'date', header: 'תאריך', numeric: true },
    { id: 'time', header: 'שעה', numeric: true },
    { id: 'location', header: 'מיקום' },
    { id: 'type', header: 'סוג אירוע' },
    { id: 'km', header: 'סה״כ ק״מ', numeric: true },
    { id: 'notes', header: 'הערות' },
  ],
  async load(inputs) {
    const range = requireRange(inputs)
    if (!range) return []
    const rows = await loadFuelDetailReport(range.from, range.to)
    return rows.map(
      (row): ReportTableRow => ({
        id: row.id,
        values: [
          person(row.full_name, row.callsign),
          formatDate(row.created_at),
          formatTime(row.started_at) ?? '—',
          row.location || '—',
          row.event_type_name || '—',
          formatNumber(row.total_km),
          row.notes || '—',
        ],
      }),
    )
  },
}

const kmExceptions: ReportKind = {
  id: 'km_exceptions',
  title: 'חריגי ק״מ',
  includes: 'השתתפויות עם 60 ק״מ ומעלה',
  audience: 'admin_and_shift_lead',
  hasDateRange: false,
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
  async load() {
    const rows = await fetchKmExceptionRows()
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
  includes: 'כונן + מקום + יום בחלון ±30 דקות',
  audience: 'admin_and_shift_lead',
  hasDateRange: false,
  csvFilename: 'אירועים-כפולים.csv',
  columns: [
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

export const REPORT_KINDS: ReportKind[] = [kmSummary, kmDetail, kmExceptions, duplicateEvents]

export function reportKindById(id: string): ReportKind | undefined {
  return REPORT_KINDS.find((kind) => kind.id === id)
}
