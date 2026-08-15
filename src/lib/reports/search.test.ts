import { describe, expect, it } from 'vitest'
import { filterReportRows } from './search'
import type { ReportTableRow } from './types'

const rows: ReportTableRow[] = [
  { id: 'a', values: ['עמרי לנדמן', '12', '3'] },
  { id: 'b', values: ['משה כהן', '60', '1'] },
]

const fieldRows: ReportTableRow[] = [
  {
    id: '1',
    values: ['P-1', '10.08.2026', 'דנה כהן · D1', 'ליאור · L1', 'כביש 1 · צומת', 'טרם הוזן'],
    searchText: 'דנה כהן D1 P-1 כביש 1 צומת',
  },
  {
    id: '2',
    values: ['P-2', '11.08.2026', 'יוסי לוי · Y2', 'ליאור · L1', 'כביש 2 · גשר', 'נשמרה טיוטה'],
    searchText: 'יוסי לוי Y2 P-2 כביש 2 גשר',
  },
]

describe('filterReportRows', () => {
  it('returns all rows when the query is blank', () => {
    expect(filterReportRows(rows, '  ')).toEqual(rows)
  })

  it('matches case-insensitively across cell text', () => {
    expect(filterReportRows(rows, 'משה').map((row) => row.id)).toEqual(['b'])
    expect(filterReportRows(rows, '12').map((row) => row.id)).toEqual(['a'])
  })

  it('fuzzy-matches searchText only when present', () => {
    expect(filterReportRows(fieldRows, 'דנה').map((row) => row.id)).toEqual(['1'])
    expect(filterReportRows(fieldRows, 'P-1').map((row) => row.id)).toEqual(['1'])
    expect(filterReportRows(fieldRows, 'גשר').map((row) => row.id)).toEqual(['2'])
  })

  it('does not match אחמ״ש or status when only searchText is queried', () => {
    expect(filterReportRows(fieldRows, 'ליאור')).toEqual([])
    expect(filterReportRows(fieldRows, 'טיוטה')).toEqual([])
  })

  it('allows a one-letter typo on words of three letters or more', () => {
    expect(filterReportRows(fieldRows, 'דנא').map((row) => row.id)).toEqual(['1'])
  })
})
