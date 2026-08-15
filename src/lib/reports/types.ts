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
  groupKey?: string
  groupLabel?: string
  searchText?: string
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
  load: (inputs: ReportInputs) => Promise<ReportTableRow[]>
}

export type ReportsNavPlacement = 'admin' | 'shift_lead' | 'none'
