import { describe, expect, it } from 'vitest'
import { filterReportRows } from './search'
import type { ReportTableRow } from './types'

const rows: ReportTableRow[] = [
  { id: 'a', values: ['עמרי לנדמן', '12', '3'] },
  { id: 'b', values: ['משה כהן', '60', '1'] },
]

describe('filterReportRows', () => {
  it('returns all rows when the query is blank', () => {
    expect(filterReportRows(rows, '  ')).toEqual(rows)
  })

  it('matches case-insensitively across cell text', () => {
    expect(filterReportRows(rows, 'משה').map((row) => row.id)).toEqual(['b'])
    expect(filterReportRows(rows, '12').map((row) => row.id)).toEqual(['a'])
  })
})
