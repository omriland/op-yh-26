export type ReportAudience = 'admin' | 'admin_and_shift_lead'

export type ReportViewer = {
  userId: string
  isAdmin: boolean
}

export type ReportInputs = {
  from?: string
  to?: string
  viewer?: ReportViewer
}

export type ReportColumn = {
  id: string
  header: string
  numeric?: boolean
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
}

export type ReportRowAction = {
  columnId: string
  hoverText: string
  confirmTitle: string
  confirmBody: (row: ReportTableRow) => string
  apply: (row: ReportTableRow) => Promise<void>
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
  action?: ReportRowAction
  load: (inputs: ReportInputs) => Promise<ReportTableRow[]>
}

export type ReportsNavPlacement = 'admin' | 'shift_lead' | 'none'
