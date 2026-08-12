import { describe, expect, it } from 'vitest'
import {
  buildShiftUpdatePayload,
  shiftEventAlreadyLinkedMessage,
  type ShiftFormDraft,
} from './shiftForm'

const baseDraft: ShiftFormDraft = {
  id: 's1',
  shift_date: '2026-08-11',
  shift_kind: 'morning',
  vehicle_type: 'personal',
  personal_vehicle_id: 'v1',
  responder_ids: [],
  event_ids: [],
  odometer_start: 100,
  odometer_end: 150,
  total_km: 50,
  notes: '  hi  ',
  event_type_counts: [],
  treated_vehicle_counts: [],
  cancelled_count: 0,
}

describe('shiftEventAlreadyLinkedMessage', () => {
  it('includes the police event number when present', () => {
    expect(shiftEventAlreadyLinkedMessage('12345')).toBe(
      'אירוע 12345 כבר מקושר למשמרת אחרת',
    )
  })

  it('falls back when the event number is missing', () => {
    expect(shiftEventAlreadyLinkedMessage(null)).toBe(
      'האירוע כבר מקושר למשמרת אחרת',
    )
    expect(shiftEventAlreadyLinkedMessage('   ')).toBe(
      'האירוע כבר מקושר למשמרת אחרת',
    )
  })
})

describe('buildShiftUpdatePayload', () => {
  it('includes identity fields when canEditIdentity', () => {
    const payload = buildShiftUpdatePayload(baseDraft, { canEditIdentity: true })
    expect(payload).toMatchObject({
      shift_date: '2026-08-11',
      shift_kind: 'morning',
      vehicle_type: 'personal',
      personal_vehicle_id: 'v1',
      odometer_start: 100,
      odometer_end: 150,
      total_km: 50,
      notes: 'hi',
    })
    expect(payload).toHaveProperty('updated_at')
  })

  it('omits identity fields when !canEditIdentity', () => {
    const payload = buildShiftUpdatePayload(baseDraft, { canEditIdentity: false })
    expect(payload).not.toHaveProperty('shift_date')
    expect(payload).not.toHaveProperty('shift_kind')
    expect(payload).not.toHaveProperty('vehicle_type')
    expect(payload).not.toHaveProperty('personal_vehicle_id')
    expect(payload).toMatchObject({
      odometer_start: 100,
      odometer_end: 150,
      total_km: 50,
      notes: 'hi',
    })
  })

  it('nulls personal_vehicle_id when vehicle is not personal (lead path)', () => {
    const payload = buildShiftUpdatePayload(
      { ...baseDraft, vehicle_type: 'patrol_north', personal_vehicle_id: 'v1' },
      { canEditIdentity: true },
    )
    expect(payload.personal_vehicle_id).toBeNull()
  })
})
