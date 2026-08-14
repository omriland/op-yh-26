export type ReportAudience = 'admin' | 'admin_and_shift_lead'

export type ReportInputs = {
  from?: string
  to?: string
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
}

export type ReportKind = {
  id: string
  title: string
  includes: string
  audience: ReportAudience
  hasDateRange: boolean
  csvFilename: string
  columns: ReportColumn[]
  load: (inputs: ReportInputs) => Promise<ReportTableRow[]>
}

export type ReportsNavPlacement = 'admin' | 'shift_lead' | 'none'
