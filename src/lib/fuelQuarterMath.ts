/** Moshe fuel-card keys — fixed in v1. */
export const KM_PER_LITER = 6
export const LITERS_PER_CARD = 15
export const KM_PER_CARD = LITERS_PER_CARD * KM_PER_LITER

export function litersFromPayableKm(payableKm: number): number {
  return payableKm / KM_PER_LITER
}

/** floor(liters/15); never suggest negative cards. */
export function suggestedCards(payableKm: number): number {
  const liters = litersFromPayableKm(payableKm)
  if (liters <= 0) return 0
  return Math.floor(liters / LITERS_PER_CARD)
}

export function remainingKm(payableKm: number, cards: number): number {
  return payableKm - cards * KM_PER_CARD
}

/** Unit KPIs for a quarter: driven km + suggested cards from that same total. */
export function unitFuelQuarterKpis(rows: { quarter_km: number; cards: number }[]): {
  totalKm: number
  suggestedCards: number
  issuedCards: number
} {
  const totalKm = rows.reduce((sum, row) => sum + row.quarter_km, 0)
  const issuedCards = rows.reduce((sum, row) => sum + row.cards, 0)
  return { totalKm, suggestedCards: suggestedCards(totalKm), issuedCards }
}

/** 1-based calendar months in the quarter. */
export function quarterMonthIndexes(quarter: 1 | 2 | 3 | 4): [number, number, number] {
  const start = (quarter - 1) * 3 + 1
  return [start, start + 1, start + 2]
}

export type MonthKmBuckets = {
  km_month_1: number
  km_month_2: number
  km_month_3: number
}

/** Sum lead `total_km` into the three months of `year`/`quarter` by local `created_at`. */
export function monthKmBuckets(
  year: number,
  quarter: 1 | 2 | 3 | 4,
  rows: { created_at: string; total_km: number | null }[],
): MonthKmBuckets {
  const months = quarterMonthIndexes(quarter)
  const sums = [0, 0, 0]

  for (const row of rows) {
    if (row.total_km == null) continue
    const d = new Date(row.created_at)
    if (d.getFullYear() !== year) continue
    const m = d.getMonth() + 1
    const slot = months.indexOf(m)
    if (slot === -1) continue
    sums[slot]! += row.total_km
  }

  return {
    km_month_1: sums[0]!,
    km_month_2: sums[1]!,
    km_month_3: sums[2]!,
  }
}

export function payableKm(
  opening: number,
  buckets: MonthKmBuckets,
): number {
  return opening + buckets.km_month_1 + buckets.km_month_2 + buckets.km_month_3
}

const HE_MONTHS = [
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

export function quarterMonthLabels(quarter: 1 | 2 | 3 | 4): [string, string, string] {
  const [a, b, c] = quarterMonthIndexes(quarter)
  return [HE_MONTHS[a - 1]!, HE_MONTHS[b - 1]!, HE_MONTHS[c - 1]!]
}

export function defaultFuelQuarter(now: Date = new Date()): {
  year: number
  quarter: 1 | 2 | 3 | 4
} {
  const year = now.getFullYear()
  const quarter = (Math.floor(now.getMonth() / 3) + 1) as 1 | 2 | 3 | 4
  return { year, quarter }
}

/** Inclusive local YYYY-MM-DD bounds for a calendar quarter. */
export function quarterLocalDateRange(
  year: number,
  quarter: 1 | 2 | 3 | 4,
): { from: string; to: string } {
  const [m1, , m3] = quarterMonthIndexes(quarter)
  const from = `${year}-${String(m1).padStart(2, '0')}-01`
  const lastDay = new Date(year, m3, 0).getDate()
  const to = `${year}-${String(m3).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { from, to }
}
