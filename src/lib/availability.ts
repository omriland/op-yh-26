import { formatDate } from './format'

export type AvailabilityStatus = 'available' | 'unavailable'

export const DEFAULT_AVAILABILITY: AvailabilityStatus = 'available'

export const AVAILABILITY_LABELS: Record<AvailabilityStatus, string> = {
  available: 'זמין',
  unavailable: 'לא זמין',
}

export const AVAILABILITY_DATE_ERROR = 'בחרו תאריך מהמחר או השאירו ריק.'

export const AVAILABILITY_OPTIONS: { value: AvailabilityStatus; label: string }[] = [
  { value: 'available', label: AVAILABILITY_LABELS.available },
  { value: 'unavailable', label: AVAILABILITY_LABELS.unavailable },
]

const VALUES = new Set<string>(['available', 'unavailable'])

export function isAvailabilityStatus(value: unknown): value is AvailabilityStatus {
  return typeof value === 'string' && VALUES.has(value)
}

export function parseAvailabilityStatus(value: unknown): AvailabilityStatus {
  return isAvailabilityStatus(value) ? value : DEFAULT_AVAILABILITY
}

export function availabilityLabel(value: unknown): string {
  return AVAILABILITY_LABELS[parseAvailabilityStatus(value)]
}

export function israelToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export function effectiveAvailability(
  status: AvailabilityStatus,
  availableFrom: string | null,
  today: string,
): AvailabilityStatus {
  if (status === 'available') return 'available'
  if (availableFrom && availableFrom <= today) return 'available'
  return 'unavailable'
}

export function availabilitySearchLabel(
  status: AvailabilityStatus,
  availableFrom: string | null,
  today = israelToday(),
): string {
  return availabilityLabel(effectiveAvailability(status, availableFrom, today))
}

export function availabilityReturnCaption(availableFrom: string | null): string | null {
  if (!availableFrom) return null
  return `חזרה ב־${formatDate(availableFrom)}`
}

export function mapAvailabilityHoverLabel(
  status: AvailabilityStatus,
  availableFrom: string | null,
  today = israelToday(),
): string | null {
  if (effectiveAvailability(status, availableFrom, today) !== 'unavailable') return null
  if (availableFrom) return `לא זמין עד ${formatDate(availableFrom)}`
  return AVAILABILITY_LABELS.unavailable
}

export function isValidReturnDate(availableFrom: string, today: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(availableFrom) && availableFrom > today
}

export type AvailabilityWrite =
  | { ok: true; availability: AvailabilityStatus; available_from: string | null }
  | { ok: false; error: string }

export function buildAvailabilityWrite(input: {
  status: AvailabilityStatus
  availableFrom: string | null | undefined
  today: string
}): AvailabilityWrite {
  if (input.status === 'available') {
    return { ok: true, availability: 'available', available_from: null }
  }
  const date = input.availableFrom?.trim() ?? ''
  if (!date) {
    return { ok: true, availability: 'unavailable', available_from: null }
  }
  if (!isValidReturnDate(date, input.today)) {
    return { ok: false, error: AVAILABILITY_DATE_ERROR }
  }
  return { ok: true, availability: 'unavailable', available_from: date }
}

/** Mirrors `apply_due_availability` for one row. */
export function applyDueAvailabilityRow(
  status: AvailabilityStatus,
  availableFrom: string | null,
  today: string,
): { availability: AvailabilityStatus; available_from: string | null } {
  if (
    status === 'unavailable' &&
    availableFrom &&
    availableFrom <= today
  ) {
    return { availability: 'available', available_from: null }
  }
  return { availability: status, available_from: availableFrom }
}

export function tomorrowJerusalem(today = israelToday()): string {
  const [year, month, day] = today.split('-').map(Number)
  const next = new Date(Date.UTC(year, month - 1, day + 1))
  return next.toISOString().slice(0, 10)
}
