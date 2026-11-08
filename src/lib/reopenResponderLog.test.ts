import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  REOPENED_LOG_STATUS,
  canReopenResponderLog,
  defaultReopenChoice,
  eventStatusAfterReopen,
  reopenParticipationLogs,
} from './reopenResponderLog'

const sql = readFileSync(
  resolve(
    import.meta.dirname,
    '../../supabase/migrations/20261106160000_super_admin_reopen_log_and_shift_event_type.sql',
  ),
  'utf8',
)

function log(over: Partial<{
  id: string
  status: 'pending' | 'in_progress' | 'done'
  totalKm: number | null
  notes: string
  vehicle_plate: string
  treatment_detail: string
  route: string
  odometer_start: number
  odometer_end: number
  started_at: string
  ended_at: string
}> = {}) {
  return {
    id: 'p1',
    status: 'done' as const,
    totalKm: 18,
    notes: 'הערה שנשמרה',
    vehicle_plate: '1234567',
    treatment_detail: 'פינוי',
    route: 'כביש 1',
    odometer_start: 100,
    odometer_end: 118,
    started_at: '2026-11-04T10:00:00',
    ended_at: '2026-11-04T11:00:00',
    ...over,
  }
}

describe('canReopenResponderLog', () => {
  it('is true only when super_admin is present', () => {
    expect(canReopenResponderLog(['super_admin'])).toBe(true)
    expect(canReopenResponderLog(['admin', 'super_admin'])).toBe(true)
    expect(canReopenResponderLog(['admin'])).toBe(false)
    expect(canReopenResponderLog(['shift_lead'])).toBe(false)
    expect(canReopenResponderLog(['responder'])).toBe(false)
    expect(canReopenResponderLog([])).toBe(false)
  })
})

describe('defaultReopenChoice', () => {
  it('does not pick the only responder', () => {
    expect(defaultReopenChoice(['only'])).toBeNull()
    expect(defaultReopenChoice(['a', 'b'])).toBeNull()
  })
})

describe('reopenParticipationLogs', () => {
  it('returns the chosen log to the editable draft and keeps its content', () => {
    const original = log()
    const result = reopenParticipationLogs([original], 'p1')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows[0]).toEqual({ ...original, status: REOPENED_LOG_STATUS })
    expect(result.rows[0]?.status).toBe('in_progress')
    expect(result.rows[0]?.notes).toBe('הערה שנשמרה')
    expect(result.rows[0]?.totalKm).toBe(18)
    expect(result.rows[0]?.vehicle_plate).toBe('1234567')
    expect(result.rows[0]?.treatment_detail).toBe('פינוי')
    expect(result.rows[0]?.odometer_start).toBe(100)
    expect(result.rows[0]?.odometer_end).toBe(118)
  })

  it('leaves every other responder untouched', () => {
    const chosen = log({ id: 'chosen' })
    const other = log({ id: 'other', status: 'done', notes: 'של השני', totalKm: 4 })
    const result = reopenParticipationLogs([chosen, other], 'chosen')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows[0]?.status).toBe('in_progress')
    expect(result.rows[1]).toEqual(other)
  })

  it('does not invent a row', () => {
    expect(reopenParticipationLogs([log()], 'missing')).toEqual({
      ok: false,
      error: 'not_found',
    })
  })
})

describe('eventStatusAfterReopen', () => {
  it('drops a fully done event to partial when one of two logs reopens', () => {
    expect(
      eventStatusAfterReopen({
        endedAt: '2026-11-04T12:00:00',
        participationId: 'a',
        responders: [
          { id: 'a', status: 'done', totalKm: 10 },
          { id: 'b', status: 'done', totalKm: 12 },
        ],
      }),
    ).toBe('partial')
  })

  it('drops the event to in_progress when the only done log reopens', () => {
    expect(
      eventStatusAfterReopen({
        endedAt: '2026-11-04T12:00:00',
        participationId: 'a',
        responders: [{ id: 'a', status: 'done', totalKm: 10 }],
      }),
    ).toBe('in_progress')
  })

  it('keeps the reopened log content while the event status moves', () => {
    const rows = [
      log({ id: 'a' }),
      log({ id: 'b', notes: 'נשאר סגור', totalKm: 3 }),
    ]
    const reopened = reopenParticipationLogs(rows, 'a')
    expect(reopened.ok).toBe(true)
    if (!reopened.ok) return
    expect(reopened.rows[0]?.notes).toBe('הערה שנשמרה')
    expect(reopened.rows[1]?.status).toBe('done')
    expect(
      eventStatusAfterReopen({
        endedAt: '2026-11-04T12:00:00',
        participationId: 'a',
        responders: rows.map((row) => ({
          id: row.id,
          status: row.status,
          totalKm: row.totalKm,
        })),
      }),
    ).toBe('partial')
  })
})

describe('reopen_responder_log', () => {
  const body = sql.slice(sql.indexOf('function public.reopen_responder_log'), sql.indexOf('function public.set_shift_born_event_type'))

  it('is super_admin only and updates one participation status', () => {
    expect(body).toContain('security definer')
    expect(body).toContain("not public.has_role(auth.uid(), 'super_admin')")
    expect(body).toContain("raise exception 'אין הרשאה'")
    expect(body).toContain("status = 'in_progress'")
    expect(body).toContain('where id = p_event_responder_id')
    expect(body).not.toContain("has_role(auth.uid(), 'admin')")
    expect(body).not.toContain("has_role(auth.uid(), 'shift_lead')")
  })

  it('does not write the log content and skips the secondary-lead lock', () => {
    const update = body.slice(body.indexOf('update public.event_responders'), body.indexOf('perform set_config'))
    expect(update).toMatch(/set\s+status = 'in_progress', updated_at = now\(\)/)
    expect(update).not.toContain('treatment_detail')
    expect(update).not.toContain('treatment_notes')
    expect(update).not.toContain('total_km')
    expect(update).not.toContain('vehicle_plate')
    expect(update).not.toContain('odometer_start')
    expect(update).not.toContain('route')
    expect(body).toContain("set_config('yahpaz.skip_auto_secondary', '1', true)")
    expect(body).toContain('derived_event_status')
    expect(body).toContain('grant execute on function public.reopen_responder_log(uuid) to authenticated')
  })
})
