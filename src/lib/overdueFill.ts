import type { ParticipationStatus } from './status'

export const OVERDUE_48H_MS = 48 * 60 * 60 * 1000
export const OVERDUE_7D_MS = 7 * 24 * 60 * 60 * 1000

export type OverdueMailKind = '48h' | '7d'

export const OVERDUE_FILL_EMAIL_SUBJECT = 'חריגת זמנים בתיעוד אירוע - אבן דרך'
export const OVERDUE_FILL_CTA_LABEL = 'להשלמת התיעוד'
export const OVERDUE_FILL_FUEL_NOTE =
  'שימו לב! אירוע שלא יתועד במלואו לא יחושב להחזר הדלק הרבעוני'

export const OVERDUE_FILL_CARD_TIP = 'אירוע ממתין לתיעוד מעל ל־48 שעות'

export function isMineFillOverdue(input: {
  isCancelled: boolean
  participationStatus: ParticipationStatus | null
  fillCompletableAt: string | null | undefined
  now?: Date
}): boolean {
  if (input.isCancelled) return false
  if (!input.participationStatus || input.participationStatus === 'done') return false
  if (!input.fillCompletableAt) return false
  const start = Date.parse(input.fillCompletableAt)
  if (Number.isNaN(start)) return false
  const now = (input.now ?? new Date()).getTime()
  return now - start >= OVERDUE_48H_MS
}

export function nextOverdueMailKind(input: {
  fillCompletableAt: string
  overdue48hEmailedAt: string | null
  overdue7dEmailedAt: string | null
  now?: Date
}): OverdueMailKind | null {
  const start = Date.parse(input.fillCompletableAt)
  if (Number.isNaN(start)) return null
  const now = (input.now ?? new Date()).getTime()
  const age = now - start
  if (age >= OVERDUE_7D_MS && !input.overdue7dEmailedAt) {
    if (!input.overdue48hEmailedAt) return '48h'
    return '7d'
  }
  if (age >= OVERDUE_48H_MS && !input.overdue48hEmailedAt) return '48h'
  return null
}

export function overdueFillDurationLabel(kind: OverdueMailKind): string {
  return kind === '48h' ? '48 שעות' : '7 ימים'
}

export function overdueFillGreeting(fullName: string): string {
  return `היי, ${fullName}`
}

export function overdueFillWaitingLine(kind: OverdueMailKind): string {
  return `יש לך אירוע שממתין לתיעוד מעל ל־${overdueFillDurationLabel(kind)}`
}

export function overdueFillClickLine(): string {
  return 'אפשר ללחוץ כאן כדי להשלים את התיעוד'
}
