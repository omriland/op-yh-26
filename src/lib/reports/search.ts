import { textIncludesQuery } from '../searchQuery'
import { queryMatchesText } from './librarySearch'
import type { ReportTableRow } from './types'

export function filterReportRows(rows: ReportTableRow[], query: string): ReportTableRow[] {
  const needle = query.trim()
  if (!needle) return rows
  return rows.filter((row) => {
    if (row.searchText != null) return queryMatchesText(row.searchText, needle)
    return row.values.some((value) => textIncludesQuery(value, needle))
  })
}
