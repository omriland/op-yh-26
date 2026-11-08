export type SortDirection = 'asc' | 'desc'

export type SortValue = string | number | boolean | Date | null | undefined

export type TableSort = { columnId: string; direction: SortDirection }

const hebrewCollator = new Intl.Collator('he', { numeric: true, sensitivity: 'base' })

function isBlank(value: SortValue): value is null | undefined | '' {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
}

function rank(value: Exclude<SortValue, null | undefined>): number | string {
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'boolean') return value ? 1 : 0
  return value
}

/** Ascending order of two present values. Numbers (and dates) sort before text. */
export function compareSortValues(
  left: Exclude<SortValue, null | undefined>,
  right: Exclude<SortValue, null | undefined>,
): number {
  const a = rank(left)
  const b = rank(right)
  if (typeof a === 'number' && typeof b === 'number') {
    if (Number.isNaN(a) || Number.isNaN(b)) return Number.isNaN(a) ? (Number.isNaN(b) ? 0 : 1) : -1
    return a - b
  }
  if (typeof a === 'number') return -1
  if (typeof b === 'number') return 1
  return hebrewCollator.compare(a, b)
}

/**
 * Stable sort by one value. Blank values (null, undefined, empty text) stay at the end in
 * both directions, so reversing never floods the top with dashes.
 */
export function sortRows<T>(
  rows: readonly T[],
  valueOf: (row: T) => SortValue,
  direction: SortDirection,
): T[] {
  const sign = direction === 'asc' ? 1 : -1
  return rows
    .map((row, index) => ({ row, index, value: valueOf(row) }))
    .sort((a, b) => {
      const aBlank = isBlank(a.value)
      const bBlank = isBlank(b.value)
      if (aBlank || bBlank) {
        if (aBlank && bBlank) return a.index - b.index
        return aBlank ? 1 : -1
      }
      const order = compareSortValues(
        a.value as Exclude<SortValue, null | undefined>,
        b.value as Exclude<SortValue, null | undefined>,
      )
      return order === 0 ? a.index - b.index : sign * order
    })
    .map((entry) => entry.row)
}

/** First click on a column sorts ascending; a click on the sorted column reverses it. */
export function nextSort(current: TableSort | null, columnId: string): TableSort {
  if (current?.columnId === columnId) {
    return { columnId, direction: current.direction === 'asc' ? 'desc' : 'asc' }
  }
  return { columnId, direction: 'asc' }
}

export function ariaSortOf(
  sort: TableSort | null,
  columnId: string,
): 'ascending' | 'descending' | 'none' {
  if (sort?.columnId !== columnId) return 'none'
  return sort.direction === 'asc' ? 'ascending' : 'descending'
}

const DISPLAY_DATE = /^(\d{1,2})[./](\d{1,2})[./](\d{2}|\d{4})(?:,?\s+(\d{1,2}):(\d{2}))?$/
const DISPLAY_TIME = /^(\d{1,2}):(\d{2})$/
const DISPLAY_NUMBER = /^[-−]?\d{1,3}(?:,\d{3})*(?:\.\d+)?$|^[-−]?\d+(?:\.\d+)?$/

/**
 * Sort key for a cell that only exists as display text (report rows): `16.08.2026`,
 * `16.08.2026, 14:05`, `14:05` and `1,234.5` become numbers; `—` is blank; the rest is text.
 * Numbers with a leading zero (`0521234567`) stay text so they keep their digits.
 */
export function displayTextSortValue(text: string | null | undefined): SortValue {
  const value = (text ?? '').trim()
  if (value === '' || value === '—' || value === '-') return null
  const date = DISPLAY_DATE.exec(value)
  if (date) {
    const [, day, month, rawYear, hour = '0', minute = '0'] = date
    const year = rawYear!.length === 2 ? 2000 + Number(rawYear) : Number(rawYear)
    return Date.UTC(year, Number(month) - 1, Number(day), Number(hour), Number(minute))
  }
  const time = DISPLAY_TIME.exec(value)
  if (time) return Number(time[1]) * 60 + Number(time[2])
  if (DISPLAY_NUMBER.test(value) && !/^[-−]?0\d/.test(value)) {
    return Number(value.replace(/,/g, '').replace('−', '-'))
  }
  return value
}

/** ISO date or timestamp text to a sortable number; blank when missing or unparseable. */
export function isoSortValue(value: string | null | undefined): SortValue {
  if (!value) return null
  const time = Date.parse(value)
  return Number.isNaN(time) ? null : time
}
