import type { ReportTableRow } from './types'

export function filterReportRows(rows: ReportTableRow[], query: string): ReportTableRow[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return rows
  return rows.filter((row) => row.values.some((value) => value.toLowerCase().includes(needle)))
}
