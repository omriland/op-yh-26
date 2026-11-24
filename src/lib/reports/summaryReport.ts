import { formatDate, formatNumber } from '../format'
import { supabase } from '../supabase'
import { toCsv } from './csv'
import type { ReportColumn, ReportTableRow } from './types'

export type SummaryGroup = 'responder' | 'road' | 'district' | 'event_type' | 'shift_lead'
export type SummarySortKey = 'label' | 'events' | 'monthly_average' | 'shifts' | 'km' | 'last_activity'
export type SortDirection = 'asc' | 'desc'

export type SummaryRpcRow = {
  group_id: string | null
  group_label: string
  event_count: number
  shift_count: number
  km_total: number
  last_activity: string | null
}

export type SummaryTotals = { events: number; shifts: number; km: number }

/** The report's date range, inclusive (YYYY-MM-DD). */
export type SummaryRange = { from: string; to: string }

export const DEFAULT_SUMMARY_GROUP: SummaryGroup = 'responder'
export const SUMMARY_TOTALS_LABEL = 'סה״כ'
const UNGROUPED_ROW_ID = 'ungrouped'

export const SUMMARY_GROUP_OPTIONS: { value: SummaryGroup; label: string }[] = [
  { value: 'responder', label: 'מתנדב' },
  { value: 'road', label: 'כביש' },
  { value: 'district', label: 'שלוחה' },
  { value: 'event_type', label: 'סוג אירוע' },
  { value: 'shift_lead', label: 'אחמ״ש' },
]

export const MONTHLY_AVERAGE_HEADER = 'ממוצע אירועים לפי חודש'
const MS_PER_DAY = 24 * 60 * 60 * 1000
/** The monthly average shows only for ranges longer than this many months. */
const MONTHLY_AVERAGE_MIN_MONTHS = 2

/** Kilometres mean something per volunteer and per event type, not per road, district or lead. */
export function summaryShowsKm(group: SummaryGroup): boolean {
  return group === 'responder' || group === 'event_type'
}

/** Length of the inclusive range in calendar months: Sep 1 to Oct 31 is exactly 2. 0 when invalid. */
export function summaryRangeMonths(range: SummaryRange | undefined): number {
  if (!range) return 0
  const from = parseDay(range.from)
  const to = parseDay(range.to)
  if (!from || !to || to < from) return 0
  const end = new Date(to.getTime() + MS_PER_DAY)
  let whole = (end.getUTCFullYear() - from.getUTCFullYear()) * 12 + (end.getUTCMonth() - from.getUTCMonth())
  if (end.getUTCDate() < from.getUTCDate()) whole -= 1
  const anchor = addMonths(from, whole)
  const next = addMonths(from, whole + 1)
  return whole + (end.getTime() - anchor.getTime()) / (next.getTime() - anchor.getTime())
}

function parseDay(value: string): Date | null {
  const time = Date.parse(`${value}T00:00:00Z`)
  return Number.isNaN(time) ? null : new Date(time)
}

function addMonths(day: Date, months: number): Date {
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + months, day.getUTCDate()))
}

/** Shift leads get a monthly average when the range is longer than two full months. */
export function summaryShowsMonthlyAverage(group: SummaryGroup, range: SummaryRange | undefined): boolean {
  return group === 'shift_lead' && summaryRangeMonths(range) > MONTHLY_AVERAGE_MIN_MONTHS
}

function monthlyAverage(events: number, range: SummaryRange | undefined): number {
  const months = summaryRangeMonths(range)
  return months > 0 ? Math.round((events / months) * 10) / 10 : 0
}

function groupLabelHeader(group: SummaryGroup): string {
  return SUMMARY_GROUP_OPTIONS.find((option) => option.value === group)?.label ?? ''
}

export function summaryColumns(group: SummaryGroup, range?: SummaryRange): ReportColumn[] {
  const average: ReportColumn[] = summaryShowsMonthlyAverage(group, range)
    ? [{ id: 'monthly_average', header: MONTHLY_AVERAGE_HEADER, numeric: true }]
    : []
  const shifts: ReportColumn[] =
    group === 'responder' ? [{ id: 'shifts', header: 'משמרות', numeric: true }] : []
  const km: ReportColumn[] = summaryShowsKm(group) ? [{ id: 'km', header: 'ק״מ', numeric: true }] : []
  return [
    { id: 'label', header: groupLabelHeader(group) },
    { id: 'events', header: 'אירועים', numeric: true },
    ...average,
    ...shifts,
    ...km,
    { id: 'last_activity', header: 'פעילות אחרונה', numeric: true },
  ]
}

function lastActivityText(row: SummaryRpcRow): string {
  return row.last_activity ? formatDate(row.last_activity) : '—'
}

function summaryValues(row: SummaryRpcRow, group: SummaryGroup, range?: SummaryRange): string[] {
  const average = summaryShowsMonthlyAverage(group, range)
    ? [formatNumber(monthlyAverage(row.event_count, range))]
    : []
  const shifts = group === 'responder' ? [formatNumber(row.shift_count)] : []
  const km = summaryShowsKm(group) ? [formatNumber(row.km_total)] : []
  return [row.group_label || '—', formatNumber(row.event_count), ...average, ...shifts, ...km, lastActivityText(row)]
}

function summaryRowId(row: SummaryRpcRow): string {
  return row.group_id ?? UNGROUPED_ROW_ID
}

export function summaryRowsToTable(
  rows: SummaryRpcRow[],
  group: SummaryGroup,
  range?: SummaryRange,
): ReportTableRow[] {
  return rows.map((row) => ({
    id: summaryRowId(row),
    values: summaryValues(row, group, range),
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

export function summaryTotalsValues(rows: SummaryRpcRow[], group: SummaryGroup, range?: SummaryRange): string[] {
  const totals = summaryTotals(rows)
  const average = summaryShowsMonthlyAverage(group, range)
    ? [formatNumber(monthlyAverage(totals.events, range))]
    : []
  const shifts = group === 'responder' ? [formatNumber(totals.shifts)] : []
  const km = summaryShowsKm(group) ? [formatNumber(totals.km)] : []
  return [SUMMARY_TOTALS_LABEL, formatNumber(totals.events), ...average, ...shifts, ...km, '']
}

function sortValue(row: SummaryRpcRow, key: SummarySortKey): string | number {
  if (key === 'label') return row.group_label
  if (key === 'events' || key === 'monthly_average') return row.event_count
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

export function summaryCsv(group: SummaryGroup, rows: SummaryRpcRow[], range?: SummaryRange): string {
  return toCsv(
    summaryColumns(group, range).map((column) => column.header),
    [...rows.map((row) => summaryValues(row, group, range)), summaryTotalsValues(rows, group, range)],
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
    const row = byId.get(summaryRowId(summary))
    return row ? [row] : []
  })
}

export function summaryTotalsFromTable(rows: ReportTableRow[], group: SummaryGroup, range?: SummaryRange): string[] {
  return summaryTotalsValues(summaryRowsOf(rows), group, range)
}

export function summaryCsvFromTable(rows: ReportTableRow[], group: SummaryGroup, range?: SummaryRange): string {
  return summaryCsv(group, summaryRowsOf(rows), range)
}
