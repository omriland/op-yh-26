import { describe, expect, it } from 'vitest'
import {
  EVENT_EDIT_LOCK_MS,
  EVENT_EDIT_LOCKED_TOOLTIP,
  isEventEditAgeLocked,
} from './eventEditLock'

const NOW = Date.parse('2026-09-10T08:00:00.000Z')

describe('isEventEditAgeLocked', () => {
  it('locks a shift-lead edit after more than 7 days', () => {
    const createdAt = new Date(NOW - EVENT_EDIT_LOCK_MS - 1).toISOString()
    expect(
      isEventEditAgeLocked({ createdAt, roles: ['shift_lead'], now: NOW }),
    ).toBe(true)
  })

  it('stays unlocked at exactly 7 days', () => {
    const createdAt = new Date(NOW - EVENT_EDIT_LOCK_MS).toISOString()
    expect(
      isEventEditAgeLocked({ createdAt, roles: ['shift_lead'], now: NOW }),
    ).toBe(false)
  })

  it('never locks admin or super_admin', () => {
    const createdAt = new Date(NOW - EVENT_EDIT_LOCK_MS * 3).toISOString()
    expect(isEventEditAgeLocked({ createdAt, roles: ['admin'], now: NOW })).toBe(false)
    expect(
      isEventEditAgeLocked({ createdAt, roles: ['super_admin', 'shift_lead'], now: NOW }),
    ).toBe(false)
  })

  it('does not lock a create (missing created_at)', () => {
    expect(isEventEditAgeLocked({ roles: ['shift_lead'], now: NOW })).toBe(false)
    expect(isEventEditAgeLocked({ createdAt: '', roles: ['shift_lead'], now: NOW })).toBe(
      false,
    )
  })

  it('keeps the hover copy', () => {
    expect(EVENT_EDIT_LOCKED_TOOLTIP).toBe(
      'לא ניתן לערוך אירוע שנוצר לפני מעל ל-7 ימים',
    )
  })
})
