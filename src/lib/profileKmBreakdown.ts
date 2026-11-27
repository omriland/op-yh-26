/** One row of public.profile_km_monthly. `month` is the first day of the month, YYYY-MM-DD. */
export type ProfileKmMonthlyRow = {
  month: string
  km: number
}

export type KmMonth = {
  key: string
  label: string
  km: number
}

export type KmQuarter = {
  key: string
  label: string
  km: number
}

export type ProfileKmBreakdown = {
  months: KmMonth[]
  quarters: KmQuarter[]
  totalKm: number
}

const MONTH_NAMES_HE = [
  'ינואר',
  'פברואר',
  'מרץ',
  'אפריל',
  'מאי',
  'יוני',
  'יולי',
  'אוגוסט',
  'ספטמבר',
  'אוקטובר',
  'נובמבר',
  'דצמבר',
]

const MONTHS_PER_QUARTER = 3

/** Keeps two decimals and drops floating point noise (0.1 + 0.2 becomes 0.3). */
function roundKm(km: number): number {
  return Math.round(km * 100) / 100
}

/** Reads the date text on purpose: a Date object would shift the month in some timezones. */
function readYearAndMonth(monthDate: string): { year: number; month: number } {
  const [yearText, monthText] = monthDate.split('-')
  return { year: Number(yearText), month: Number(monthText) }
}

export function monthLabelHe(monthDate: string): string {
  const { year, month } = readYearAndMonth(monthDate)
  return `${MONTH_NAMES_HE[month - 1]} ${year}`
}

export function quarterLabelHe(year: number, quarter: number): string {
  return `רבעון ${quarter}, ${year}`
}

function addKmToKey(totals: Map<string, number>, key: string, km: number): void {
  totals.set(key, (totals.get(key) ?? 0) + km)
}

function sortKeysNewestFirst(keys: Iterable<string>): string[] {
  return [...keys].sort().reverse()
}

function buildMonths(kmByMonthKey: Map<string, number>): KmMonth[] {
  return sortKeysNewestFirst(kmByMonthKey.keys()).map((key) => ({
    key,
    label: monthLabelHe(`${key}-01`),
    km: roundKm(kmByMonthKey.get(key)!),
  }))
}

function buildQuarters(kmByQuarterKey: Map<string, number>): KmQuarter[] {
  return sortKeysNewestFirst(kmByQuarterKey.keys()).map((key) => {
    const [yearText, quarterText] = key.split('-Q')
    return {
      key,
      label: quarterLabelHe(Number(yearText), Number(quarterText)),
      km: roundKm(kmByQuarterKey.get(key)!),
    }
  })
}

/**
 * Calendar quarters: Q1 is January to March, the same boundaries as fuelQuarterMath.
 * Months here come from the event date, while fuelQuarterMath uses the time the
 * participation row was created, so an event near a quarter edge can land in a
 * different quarter than in the fuel workbook.
 */
export function buildProfileKmBreakdown(rows: readonly ProfileKmMonthlyRow[]): ProfileKmBreakdown {
  const kmByMonthKey = new Map<string, number>()
  const kmByQuarterKey = new Map<string, number>()
  let totalKm = 0

  for (const row of rows) {
    const { year, month } = readYearAndMonth(row.month)
    const quarter = Math.ceil(month / MONTHS_PER_QUARTER)
    addKmToKey(kmByMonthKey, `${year}-${String(month).padStart(2, '0')}`, row.km)
    addKmToKey(kmByQuarterKey, `${year}-Q${quarter}`, row.km)
    totalKm += row.km
  }

  return {
    months: buildMonths(kmByMonthKey),
    quarters: buildQuarters(kmByQuarterKey),
    totalKm: roundKm(totalKm),
  }
}
