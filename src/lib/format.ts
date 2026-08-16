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

/** Hebrew weekday letter: א'…ו', ש' for Saturday. */
const HEBREW_WEEKDAY_LETTERS = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ש'"] as const

export function hebrewWeekdayLetter(value: string | Date): string {
  return HEBREW_WEEKDAY_LETTERS[calendarDate(value).getDay()] ?? ''
}

/** `16.08.2026 (א')` */
export function formatDateWithWeekday(value: string | Date): string {
  return `${formatDate(value)} (${hebrewWeekdayLetter(value)})`
}

/** DD.MM.YYYY, HH:mm */
export function formatDateTime(value: string | Date): string {
  return dateTimeFormatter.format(toDate(value)).replace(/\//g, '.')
}

/**
 * Last-login display: relative Hebrew wording inside the last 24 hours
 * ("לפני 20 דקות", "לפני 3 שעות"), absolute `DD.MM.YYYY, HH:mm` beyond.
 * Null when the user never signed in.
 */
export function formatLastLogin(value: string | null | undefined): string | null {
  if (!value) return null
  const date = toDate(value)
  const elapsedMs = Date.now() - date.getTime()
  if (elapsedMs < 0 || elapsedMs >= 86_400_000) return formatDateTime(date)
  if (elapsedMs < 60_000) return 'עכשיו'
  if (elapsedMs < 3_600_000) {
    return relativeFormatter.format(-Math.floor(elapsedMs / 60_000), 'minute')
  }
  return relativeFormatter.format(-Math.floor(elapsedMs / 3_600_000), 'hour')
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

/**
 * License plate: 7 digits → XX-XXX-XX; 8 digits → XXX-XX-XXX.
 * Existing dashes/spaces are ignored so typists cannot put them in the wrong place.
 */
export function formatPlate(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 7) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`
  if (digits.length === 8) return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`
  return raw
}

/** Persist plates with canonical dashes; blank → null. */
export function plateNumberForSave(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim() ?? ''
  if (!trimmed) return null
  return formatPlate(trimmed)
}

/** Digits only — odometers, plates, phones. */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

/** Digits only — shared by plates and phones. */
export function plateDigits(value: string): string {
  return digitsOnly(value)
}

/** Returns a duplicated plate (digits) for the same list, or null if all unique. */
export function findDuplicatePlate(
  vehicles: { plate_number: string }[],
): string | null {
  const seen = new Set<string>()
  for (const vehicle of vehicles) {
    const digits = plateDigits(vehicle.plate_number)
    if (!digits) continue
    if (seen.has(digits)) return digits
    seen.add(digits)
  }
  return null
}

/** Digits only from a phone field (ignores spaces, hyphens, etc.). */
export function phoneDigits(raw: string): string {
  return plateDigits(raw).slice(0, 10)
}

/** 0501234567 → 050-1234567 (hyphen after the first three digits). */
export function formatPhone(raw: string): string {
  const digits = phoneDigits(raw)
  if (digits.length <= 3) return digits
  return `${digits.slice(0, 3)}-${digits.slice(3)}`
}

/** True when the value has exactly 10 digits. */
export function isValidPhone(raw: string): boolean {
  return phoneDigits(raw).length === 10
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

/** YYYY-MM-DD as a local calendar day — avoids UTC off-by-one on weekday. */
function calendarDate(value: string | Date): Date {
  if (value instanceof Date) return value
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return toDate(value)
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}
