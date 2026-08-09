const dateFormatter = new Intl.DateTimeFormat('he-IL', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const dateTimeFormatter = new Intl.DateTimeFormat('he-IL', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const relativeFormatter = new Intl.RelativeTimeFormat('he-IL', { numeric: 'auto' })
const numberFormatter = new Intl.NumberFormat('he-IL')

/** DD.MM.YYYY */
export function formatDate(value: string | Date): string {
  return dateFormatter.format(toDate(value)).replace(/\//g, '.')
}

/** DD.MM.YYYY, HH:mm */
export function formatDateTime(value: string | Date): string {
  return dateTimeFormatter.format(toDate(value)).replace(/\//g, '.')
}

/** Hebrew relative wording for the last week, absolute date beyond it. */
export function formatDayHeading(value: string | Date): string {
  const date = startOfDay(toDate(value))
  const days = Math.round((date.getTime() - startOfDay(new Date()).getTime()) / 86_400_000)
  const relative = days > -7 && days <= 0 ? relativeFormatter.format(days, 'day') : null
  return relative ? `${relative} · ${formatDate(date)}` : formatDate(date)
}

export function formatNumber(value: number): string {
  return numberFormatter.format(value)
}

/** Postgres `time` / `timestamp` / ISO → display `HH:MM`. */
export function formatTime(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  const timePart = value.includes('T')
    ? value.split('T')[1]!
    : value.includes(' ')
      ? value.split(' ')[1]!
      : value
  return timePart.slice(0, 5)
}

/** YYYY-MM-DD prefix from a wall `timestamp` / ISO string. */
function wallDateYmd(value: string): string | null {
  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})/)
  return match?.[1] ?? null
}

/**
 * End time for display. When the wall date is after `eventDate` (overnight),
 * append flight-style `(+1)` — e.g. `06:30 (+1)`.
 */
export function formatEndTime(
  endedAt: string | null | undefined,
  eventDate: string,
): string | undefined {
  const time = formatTime(endedAt)
  if (!time || !endedAt) return time
  const endDate = wallDateYmd(endedAt)
  if (endDate && eventDate && endDate > eventDate) return `${time} (+1)`
  return time
}

/** 1234567 → 12-345-67 (7 digits) / 123-45-678 (8 digits) */
export function formatPlate(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 7) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`
  if (digits.length === 8) return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`
  return raw
}

const HEBREW = /[\u0590-\u05FF]/

/**
 * IBM Plex Mono carries no Hebrew glyphs — Hebrew set in it falls back mid-word.
 * Registry values that may be Hebrew (callsigns, patrol numbers) opt out of mono.
 */
export function monoClass(value: unknown): string {
  if (typeof value === 'number') return 'mono'
  if (typeof value !== 'string' || value === '') return ''
  return HEBREW.test(value) ? '' : 'mono'
}

export function initials(fullName: string): string {
  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
}

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value)
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}
