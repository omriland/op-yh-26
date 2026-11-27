import type { EventFreezeFlags } from '../eventFreeze'
import type { SortDirection, SummaryGroup, SummaryRpcRow } from './summaryReport'

export type ReportAudience = 'admin' | 'admin_and_shift_lead'

export type ReportViewer = {
  userId: string
  isAdmin: boolean
}

export type ReportInputs = {
  from?: string
  to?: string
  viewer?: ReportViewer
  group?: SummaryGroup
  days?: number
}

export type ReportColumn = {
  id: string
  header: string
  numeric?: boolean
  csvOnly?: boolean
}

export type ReportTableRow = {
  id: string
  values: string[]
  eventId?: string
  assignmentId?: string
  actionValue?: number
  groupKey?: string
  groupLabel?: string
  searchText?: string
  freeze?: EventFreezeFlags
  summaryRow?: SummaryRpcRow
}

export type ReportRowAction = {
  columnId: string
  hoverText: string
  confirmTitle: string
  confirmBody: (row: ReportTableRow) => string
  apply: (row: ReportTableRow) => Promise<void>
}

export type ReportRowCommand = {
  id: string
  label: string
  variant: 'secondary' | 'destructive'
  confirmTitle: string
  confirmBody: (row: ReportTableRow) => string
  confirmLabel: string
  loadingLabel: string
  successToast: string
  failToast: string
  visible?: (row: ReportTableRow, viewer: ReportViewer) => boolean
  apply: (row: ReportTableRow) => Promise<void>
}

export type ReportDateRange = { from: string; to: string }

/** A report whose rows are groups the viewer picks, with totals, sorting and a per-group event list. */
export type ReportGrouping = {
  options: { value: SummaryGroup; label: string }[]
  defaultValue: SummaryGroup
  columnsFor: (group: SummaryGroup, range?: ReportDateRange) => ReportColumn[]
  sortRows: (rows: ReportTableRow[], columnId: string, direction: SortDirection) => ReportTableRow[]
  totalsValues: (rows: ReportTableRow[], group: SummaryGroup, range?: ReportDateRange) => string[]
  toCsv: (rows: ReportTableRow[], group: SummaryGroup, range?: ReportDateRange) => string
  detailColumns: ReportColumn[]
  loadDetail: (row: ReportTableRow, group: SummaryGroup, range: ReportDateRange) => Promise<ReportTableRow[]>
}

/** A report with a whole-number "days" input on screen. */
export type ReportDaysInput = {
  label: string
  defaultValue: number
  isValid: (days: number) => boolean
  errorText: string
}

export type ReportKind = {
  id: string
  title: string
  includes: string
  audience: ReportAudience
  hasDateRange: boolean
  hasPeriodPicker?: boolean
  searchPlaceholder?: string
  csvFilename: string
  columns: ReportColumn[]
  grouping?: ReportGrouping
  daysInput?: ReportDaysInput
  action?: ReportRowAction
  commands?: ReportRowCommand[]
  /** Desktop table rows show a floating preview of the event while hovered or focused. */
  previewEventOnHover?: boolean
  load: (inputs: ReportInputs) => Promise<ReportTableRow[]>
}

export type ReportsNavPlacement = 'admin' | 'shift_lead' | 'none'
