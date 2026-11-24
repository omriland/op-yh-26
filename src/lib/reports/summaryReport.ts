import { formatDate, formatNumber } from '../format'
import { supabase } from '../supabase'
import type { EventsByResponderRow } from '../eventsByResponderReport'
import { toCsv } from './csv'
import type { ReportColumn, ReportTableRow } from './types'

export type SummaryGroup = 'responder' | 'road' | 'district' | 'event_type' | 'shift_lead'
export type SummarySortKey = 'label' | 'events' | 'shifts' | 'km' | 'last_activity'
export type SortDirection = 'asc' | 'desc'

export type SummaryRpcRow = {
  group_id: string
  group_label: string
  event_count: number
  shift_count: number
  km_total: number
  last_activity: string | null
}

export type SummaryTotals = { events: number; shifts: number; km: number }

export const DEFAULT_SUMMARY_GROUP: SummaryGroup = 'responder'
export const SUMMARY_TOTALS_LABEL = 'סה״כ'

export const SUMMARY_GROUP_OPTIONS: { value: SummaryGroup; label: string }[] = [
  { value: 'responder', label: 'מתנדב' },
  { value: 'road', label: 'כביש' },
  { value: 'district', label: 'שלוחה' },
  { value: 'event_type', label: 'סוג אירוע' },
  { value: 'shift_lead', label: 'אחמ״ש' },
]

function groupLabelHeader(group: SummaryGroup): string {
  return SUMMARY_GROUP_OPTIONS.find((option) => option.value === group)?.label ?? ''
}

export function summaryColumns(group: SummaryGroup): ReportColumn[] {
  const shifts: ReportColumn[] =
    group === 'responder' ? [{ id: 'shifts', header: 'משמרות', numeric: true }] : []
  return [
    { id: 'label', header: groupLabelHeader(group) },
    { id: 'events', header: 'אירועים', numeric: true },
    ...shifts,
    { id: 'km', header: 'ק״מ', numeric: true },
    { id: 'last_activity', header: 'פעילות אחרונה', numeric: true },
  ]
}

function lastActivityText(row: SummaryRpcRow): string {
  return row.last_activity ? formatDate(row.last_activity) : '—'
}

function summaryValues(row: SummaryRpcRow, group: SummaryGroup): string[] {
  const shifts = group === 'responder' ? [formatNumber(row.shift_count)] : []
  return [
    row.group_label || '—',
    formatNumber(row.event_count),
    ...shifts,
    formatNumber(row.km_total),
    lastActivityText(row),
  ]
}

export function summaryRowsToTable(rows: SummaryRpcRow[], group: SummaryGroup): ReportTableRow[] {
  return rows.map((row) => ({
    id: row.group_id,
    values: summaryValues(row, group),
    searchText: row.group_label,
    summaryRow: row,
  }))
}

export function summaryTotals(rows: SummaryRpcRow[]): SummaryTotals {
  const totals = { events: 0, shifts: 0, km: 0 }
  for (const row of rows) {
    totals.events += row.event_count
    totals.shifts += row.shift_count
    totals.km += row.km_total
  }
  return { ...totals, km: Math.round(totals.km * 100) / 100 }
}

export function summaryTotalsValues(rows: SummaryRpcRow[], group: SummaryGroup): string[] {
  const totals = summaryTotals(rows)
  const shifts = group === 'responder' ? [formatNumber(totals.shifts)] : []
  return [SUMMARY_TOTALS_LABEL, formatNumber(totals.events), ...shifts, formatNumber(totals.km), '']
}

function sortValue(row: SummaryRpcRow, key: SummarySortKey): string | number {
  if (key === 'label') return row.group_label
  if (key === 'events') return row.event_count
  if (key === 'shifts') return row.shift_count
  if (key === 'km') return row.km_total
  return row.last_activity ?? ''
}

function compareValues(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), 'he')
}

export function sortSummaryRows(
  rows: SummaryRpcRow[],
  key: SummarySortKey,
  direction: SortDirection,
): SummaryRpcRow[] {
  const sign = direction === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => sign * compareValues(sortValue(a, key), sortValue(b, key)))
}

export function summaryCsv(group: SummaryGroup, rows: SummaryRpcRow[]): string {
  return toCsv(
    summaryColumns(group).map((column) => column.header),
    [...rows.map((row) => summaryValues(row, group)), summaryTotalsValues(rows, group)],
  )
}

export async function loadActivitySummary(
  from: string,
  to: string,
  group: SummaryGroup,
): Promise<SummaryRpcRow[]> {
  const { data, error } = await supabase.rpc('report_activity_summary', {
    p_from: from,
    p_to: to,
    p_group: group,
  })
  if (error) throw new Error(error.message)
  return (data ?? []) as SummaryRpcRow[]
}

function leadLabels(event: EventsByResponderRow): string[] {
  const name = event.shift_lead_name ?? ''
  const callsign = event.shift_lead_callsign ?? ''
  return [name, [callsign, name].filter(Boolean).join(' · ')]
}

/** Whether an event line belongs to the group a summary row stands for. */
function eventBelongsToGroup(
  event: EventsByResponderRow,
  group: SummaryGroup,
  summary: SummaryRpcRow,
): boolean {
  if (group === 'responder') return event.responder_id === summary.group_id
  if (group === 'road') return (event.road_name ?? '') === summary.group_label
  if (group === 'district') return (event.district_name ?? '') === summary.group_label
  if (group === 'event_type') return (event.event_type_name ?? '') === summary.group_label
  return leadLabels(event).includes(summary.group_label)
}

export function eventsOfGroup(
  events: EventsByResponderRow[],
  group: SummaryGroup,
  summary: SummaryRpcRow,
): EventsByResponderRow[] {
  const inGroup = events.filter((event) => eventBelongsToGroup(event, group, summary))
  if (group === 'responder') return inGroup
  const seen = new Set<string>()
  return inGroup.filter((event) => {
    if (seen.has(event.event_id)) return false
    seen.add(event.event_id)
    return true
  })
}

function summaryRowsOf(rows: ReportTableRow[]): SummaryRpcRow[] {
  return rows.flatMap((row) => (row.summaryRow ? [row.summaryRow] : []))
}

export function sortSummaryTableRows(
  rows: ReportTableRow[],
  columnId: string,
  direction: SortDirection,
): ReportTableRow[] {
  const sorted = sortSummaryRows(summaryRowsOf(rows), columnId as SummarySortKey, direction)
  const byId = new Map(rows.map((row) => [row.id, row]))
  return sorted.flatMap((summary) => {
    const row = byId.get(summary.group_id)
    return row ? [row] : []
  })
}

export function summaryTotalsFromTable(rows: ReportTableRow[], group: SummaryGroup): string[] {
  return summaryTotalsValues(summaryRowsOf(rows), group)
}

export function summaryCsvFromTable(rows: ReportTableRow[], group: SummaryGroup): string {
  return summaryCsv(group, summaryRowsOf(rows))
}
