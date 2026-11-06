import type { EventStatus, ParticipationStatus } from './status'
import { deriveStoredEventStatus } from './eventStatus'
import { supabase } from './supabase'

/**
 * A responder log's editable draft is participation `in_progress`.
 * The stamp for that status, on the volunteer's own row, is טיוטה נשמרה.
 * There is no `draft` value on `participation_status`.
 */
export const REOPENED_LOG_STATUS: ParticipationStatus = 'in_progress'

export const REOPEN_RESPONDER_LOG_MENU = 'פתיחת תיעוד מחדש'
export const REOPEN_RESPONDER_LOG_TITLE = 'פתיחת תיעוד מחדש'
export const REOPEN_RESPONDER_LOG_BODY =
  'בחרו מתנדב. התיעוד שלו ייפתח לעריכה, והתוכן שנשמר יישאר.'
export const REOPEN_RESPONDER_LOG_CONFIRM = 'פתיחת התיעוד'
export const REOPEN_RESPONDER_LOG_DONE = 'התיעוד נפתח מחדש'
export const REOPEN_RESPONDER_LOG_FAILED =
  'פתיחת התיעוד נכשלה. בדקו את החיבור ונסו שוב.'

export function canReopenResponderLog(roles: readonly string[]): boolean {
  return roles.includes('super_admin')
}

/** One responder must still be picked, including when the event has only one. */
export function defaultReopenChoice(_responderIds: readonly string[]): null {
  return null
}

type ReopenableLog = {
  id: string
  status: ParticipationStatus
  totalKm?: number | null
}

/**
 * Set one participation back to the editable draft (`in_progress`).
 * Every other field on that row, and every other row, is copied through.
 */
export function reopenParticipationLogs<T extends ReopenableLog>(
  rows: readonly T[],
  participationId: string,
): { ok: true; rows: T[] } | { ok: false; error: 'not_found' } {
  if (!rows.some((row) => row.id === participationId)) {
    return { ok: false, error: 'not_found' }
  }
  return {
    ok: true,
    rows: rows.map((row) =>
      row.id === participationId ? { ...row, status: REOPENED_LOG_STATUS } : row,
    ),
  }
}

/** Event status after that one log is reopened, using the existing derivation. */
export function eventStatusAfterReopen(input: {
  endedAt: string | null
  responders: readonly {
    id: string
    status: ParticipationStatus
    totalKm: number | null
    kmApplicable?: boolean
  }[]
  participationId: string
}): EventStatus | null {
  const reopened = reopenParticipationLogs(input.responders, input.participationId)
  if (!reopened.ok) return null
  return deriveStoredEventStatus({
    endedAt: input.endedAt,
    responders: reopened.rows.map((row) => ({
      status: row.status,
      totalKm: row.totalKm,
      kmApplicable: row.kmApplicable,
    })),
  })
}

export function reopenResponderLogError(message: string | undefined): string {
  if (message?.includes('אין הרשאה')) return 'אין לך הרשאה לפעולה זו.'
  if (message?.includes('הדיווח אינו קיים')) return 'הדיווח אינו קיים.'
  if (message?.includes('לאירוע ממשמרת אין תיעוד נפרד למתנדב')) {
    return 'לאירוע ממשמרת אין תיעוד נפרד למתנדב.'
  }
  return REOPEN_RESPONDER_LOG_FAILED
}

export async function reopenResponderLog(
  eventResponderId: string,
): Promise<{ ok: true; eventStatus: EventStatus } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('reopen_responder_log', {
    p_event_responder_id: eventResponderId,
  })
  if (error) return { ok: false, error: reopenResponderLogError(error.message) }
  return { ok: true, eventStatus: data as EventStatus }
}
