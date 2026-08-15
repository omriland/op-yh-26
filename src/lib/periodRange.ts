import { defaultFuelRefundRange, toLocalDateString } from './fuelRefundReport'

export type RecentPreset =
  | { unit: 'days'; amount: 7 | 30 | 90 }
  | { unit: 'months'; amount: 3 | 6 | 12 }

export type PeriodValue =
  | { mode: 'range'; from: string; to: string }
  | { mode: 'month'; year: number; month: number }
  | { mode: 'year'; year: number }
  | { mode: 'recent'; preset: RecentPreset }

export const RECENT_DAY_PRESETS = [7, 30, 90] as const
export const RECENT_MONTH_PRESETS = [3, 6, 12] as const

const monthYearFormatter = new Intl.DateTimeFormat('he-IL', {
  month: 'long',
  year: 'numeric',
})

export function defaultPeriod(now: Date = new Date()): PeriodValue {
  const range = defaultFuelRefundRange(now)
  return { mode: 'range', from: range.from, to: range.to }
}

export function todayYmd(now: Date = new Date()): string {
  return toLocalDateString(now)
}

export function minYmd(a: string, b: string): string {
  return a <= b ? a : b
}

export function periodToRange(value: PeriodValue, now: Date = new Date()): { from: string; to: string } {
  const today = todayYmd(now)

  if (value.mode === 'range') {
    return { from: value.from, to: minYmd(value.to, today) }
  }

  if (value.mode === 'month') {
    const from = `${value.year}-${pad2(value.month)}-01`
    const last = new Date(value.year, value.month, 0)
    return { from, to: minYmd(toLocalDateString(last), today) }
  }

  if (value.mode === 'year') {
    return {
      from: `${value.year}-01-01`,
      to: minYmd(`${value.year}-12-31`, today),
    }
  }

  if (value.preset.unit === 'days') {
    const from = addLocalDays(now, -(value.preset.amount - 1))
    return { from: toLocalDateString(from), to: today }
  }

  const from = addLocalMonths(now, -value.preset.amount)
  return { from: toLocalDateString(from), to: today }
}

export function formatPeriodLabel(value: PeriodValue, now: Date = new Date()): string {
  if (value.mode === 'range') {
    const range = periodToRange(value, now)
    return `${formatYmd(range.from)}–${formatYmd(range.to)}`
  }
  if (value.mode === 'month') {
    return monthYearFormatter.format(new Date(value.year, value.month - 1, 1))
  }
  if (value.mode === 'year') {
    return String(value.year)
  }
  if (value.preset.unit === 'days') {
    return `${value.preset.amount} הימים האחרונים`
  }
  return `${value.preset.amount} החודשים האחרונים`
}

export function formatYmd(ymd: string): string {
  const [year, month, day] = ymd.split('-')
  return `${day}.${month}.${year}`
}

export function ymdToLocalDate(ymd: string): Date {
  const [year, month, day] = ymd.split('-').map(Number)
  return new Date(year!, month! - 1, day!)
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function addLocalDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

function addLocalMonths(date: Date, months: number): Date {
  const day = date.getDate()
  const cursor = new Date(date.getFullYear(), date.getMonth() + months, 1)
  const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
  cursor.setDate(Math.min(day, last))
  return cursor
}
