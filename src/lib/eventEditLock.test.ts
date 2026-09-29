import { describe, expect, it } from 'vitest'
import {
  EVENT_EDIT_LOCK_MS,
  EVENT_EDIT_LOCKED_TOOLTIP,
  isEventEditAgeLocked,
  lockedLeadKmFillable,
  lockedLeadKmWrites,
  type LockedLeadKmRow,
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

function row(overrides: Partial<LockedLeadKmRow> = {}): LockedLeadKmRow {
  return {
    assignmentId: 'assign-1',
    hasVehicle: true,
    totalKm: '',
    ...overrides,
  }
}

describe('locked lead km after 7 days', () => {
  it('sets a null KM, including 0', () => {
    expect(
      lockedLeadKmWrites({
        stored: [row({ totalKm: '' })],
        responders: [row({ totalKm: '18' })],
      }),
    ).toEqual([{ assignmentId: 'assign-1', totalKm: 18 }])
    expect(
      lockedLeadKmWrites({
        stored: [row({ assignmentId: 'assign-0', totalKm: '' })],
        responders: [row({ assignmentId: 'assign-0', totalKm: '0' })],
      }),
    ).toEqual([{ assignmentId: 'assign-0', totalKm: 0 }])
  })

  it('does not change a KM that is already stored, including 0', () => {
    expect(lockedLeadKmFillable({ hasVehicle: true, totalKm: '0' })).toBe(false)
    expect(lockedLeadKmFillable({ hasVehicle: true, totalKm: '12' })).toBe(false)
    expect(
      lockedLeadKmWrites({
        stored: [row({ totalKm: '12' }), row({ assignmentId: 'assign-0', totalKm: '0' })],
        responders: [
          row({ totalKm: '40' }),
          row({ assignmentId: 'assign-0', totalKm: '9' }),
        ],
      }),
    ).toEqual([])
  })

  it('does not write any field other than a null total_km', () => {
    const writes = lockedLeadKmWrites({
      stored: [row({ totalKm: '' })],
      responders: [row({ totalKm: '7' })],
    })
    expect(writes).toHaveLength(1)
    expect(Object.keys(writes[0] ?? {}).sort()).toEqual(['assignmentId', 'totalKm'])
    expect(
      lockedLeadKmWrites({
        stored: [row({ totalKm: '' })],
        responders: [row({ assignmentId: 'brand-new', totalKm: '7' })],
      }),
    ).toEqual([])
  })

  it('leaves a volunteer without a car unchanged', () => {
    expect(lockedLeadKmFillable({ hasVehicle: false, totalKm: '' })).toBe(false)
    expect(
      lockedLeadKmWrites({
        stored: [row({ hasVehicle: false, totalKm: '' })],
        responders: [row({ hasVehicle: false, totalKm: '15' })],
      }),
    ).toEqual([])
  })
})
