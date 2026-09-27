import { describe, expect, it } from 'vitest'
import {
  LEAD_KM_MAX_DIGITS,
  NO_VEHICLE_KM_PLACEHOLDER,
  PATROL_CALLSIGN_MAX_LENGTH,
  applyLiveResponderProfiles,
  baselineAfterProfileRefresh,
  emptyEventDraft,
  hasActiveVehicle,
  keepLiveResponderIdentity,
  leadKmApplies,
  leadKmForInput,
  leadKmForSave,
  patrolCallsignForInput,
  type EventFormDraft,
  type ResponderDraft,
} from './eventForm'

function responder(overrides: Partial<ResponderDraft> = {}): ResponderDraft {
  return {
    key: 'r1',
    assignmentId: 'a1',
    responder_id: 'dana',
    full_name: 'דנה',
    callsign: '12',
    start_time: '08:00',
    end_time: '',
    total_km: '',
    emergency_means: true,
    treated: [{ vehicle_kind_id: 'k1', quantity: 2 }],
    status: 'pending',
    hasOwnedData: false,
    expanded: true,
    hasVehicle: false,
    ...overrides,
  }
}

describe('hasActiveVehicle', () => {
  it('is false when the profile has no vehicles', () => {
    expect(hasActiveVehicle([])).toBe(false)
    expect(hasActiveVehicle(null)).toBe(false)
    expect(hasActiveVehicle(undefined)).toBe(false)
  })

  it('is false when every vehicle is archived', () => {
    expect(hasActiveVehicle([{ archived: true }, { archived: true }])).toBe(false)
  })

  it('is true when at least one vehicle is active', () => {
    expect(hasActiveVehicle([{ archived: true }, { archived: false }])).toBe(true)
    expect(hasActiveVehicle([{ archived: null }])).toBe(true)
  })
})

describe('leadKmForSave', () => {
  it('stores null for a responder without a vehicle, even if km was typed', () => {
    expect(leadKmForSave(false, '42')).toBeNull()
    expect(leadKmForSave(false, '')).toBeNull()
  })

  it('parses km for a responder with a vehicle', () => {
    expect(leadKmForSave(true, '')).toBeNull()
    expect(leadKmForSave(true, '12')).toBe(12)
    expect(leadKmForSave(true, ' 8.5 ')).toBe(8.5)
  })

  it('keeps NaN so the save path can reject invalid km', () => {
    expect(Number.isNaN(leadKmForSave(true, 'אבג'))).toBe(true)
  })

  it('stores a typed 0 as 0, not as an empty field', () => {
    expect(leadKmForSave(true, '0')).toBe(0)
    expect(leadKmForSave(true, ' 0 ')).toBe(0)
  })
})

describe('leadKmApplies', () => {
  it('is true whenever the responder has an active vehicle', () => {
    expect(leadKmApplies(true, null)).toBe(true)
    expect(leadKmApplies(true, 42)).toBe(true)
  })

  it('is false for a volunteer with no vehicle and nothing stored', () => {
    expect(leadKmApplies(false, null)).toBe(false)
  })

  it('stays true when KM is already stored but the car was archived later', () => {
    // Otherwise the next save by the lead silently wipes a real refund value.
    expect(leadKmApplies(false, 42)).toBe(true)
    expect(leadKmApplies(false, 0)).toBe(true)
  })
})

describe('NO_VEHICLE_KM_PLACEHOLDER', () => {
  it('is the locked field copy', () => {
    expect(NO_VEHICLE_KM_PLACEHOLDER).toBe('מתנדב ללא רכב')
  })
})

describe('applyLiveResponderProfiles', () => {
  it('unlocks km when a vehicle is added after assignment', () => {
    const row = responder()
    const [next] = applyLiveResponderProfiles(
      [row],
      [{ id: 'dana', full_name: 'דנה לוי', callsign: 'D1', hasVehicle: true }],
    )
    expect(next?.hasVehicle).toBe(true)
    expect(next?.full_name).toBe('דנה לוי')
    expect(next?.callsign).toBe('D1')
    expect(next?.total_km).toBe('')
    expect(next?.treated).toEqual(row.treated)
    expect(next?.start_time).toBe('08:00')
  })

  it('keeps a typed km editable after the car is archived', () => {
    const [next] = applyLiveResponderProfiles(
      [responder({ hasVehicle: true, total_km: '18' })],
      [{ id: 'dana', full_name: 'דנה', callsign: '12', hasVehicle: false }],
    )
    expect(next?.hasVehicle).toBe(true)
    expect(next?.total_km).toBe('18')
  })

  it('leaves the row untouched when the profile did not change', () => {
    const rows = [responder()]
    expect(
      applyLiveResponderProfiles(rows, [
        { id: 'dana', full_name: 'דנה', callsign: '12', hasVehicle: false },
      ]),
    ).toBe(rows)
  })
})

describe('keepLiveResponderIdentity', () => {
  it('keeps typed fields and takes the vehicle flag from the loaded event', () => {
    const stashed = responder({ hasVehicle: false, total_km: '4', full_name: 'ישן' })
    const live = responder({ hasVehicle: true, total_km: '', full_name: 'דנה', callsign: 'D1' })
    const [next] = keepLiveResponderIdentity([stashed], [live])
    expect(next?.hasVehicle).toBe(true)
    expect(next?.full_name).toBe('דנה')
    expect(next?.callsign).toBe('D1')
    expect(next?.total_km).toBe('4')
    expect(next?.emergency_means).toBe(true)
  })
})

describe('baselineAfterProfileRefresh', () => {
  it('adopts the refreshed draft when nothing else was dirty', () => {
    const before: EventFormDraft = {
      ...emptyEventDraft({ full_name: 'א', callsign: '1' }),
      responders: [responder()],
    }
    const after: EventFormDraft = {
      ...before,
      responders: [responder({ hasVehicle: true, full_name: 'דנה לוי' })],
    }
    expect(baselineAfterProfileRefresh(JSON.stringify(before), before, after)).toBe(
      JSON.stringify(after),
    )
  })

  it('does not mark a dirty form as saved, and saves when typed km just became applicable', () => {
    const before: EventFormDraft = {
      ...emptyEventDraft({ full_name: 'א', callsign: '1' }),
      responders: [responder({ total_km: '9' })],
    }
    const after: EventFormDraft = {
      ...before,
      responders: [responder({ hasVehicle: true, total_km: '9' })],
    }
    expect(baselineAfterProfileRefresh(JSON.stringify(before), before, after)).toBeNull()
    const dirty = { ...before, police_event_id: '123' }
    expect(
      baselineAfterProfileRefresh(JSON.stringify(before), dirty, {
        ...dirty,
        responders: after.responders,
      }),
    ).toBeNull()
  })
})

describe('leadKmForInput', () => {
  it('keeps digits only and caps at 3', () => {
    expect(LEAD_KM_MAX_DIGITS).toBe(3)
    expect(leadKmForInput('12a3.5')).toBe('123')
    expect(leadKmForInput('1405')).toBe('140')
    expect(leadKmForInput('')).toBe('')
  })

  it('lets a lone 0 through', () => {
    expect(leadKmForInput('0')).toBe('0')
  })
})

describe('patrolCallsignForInput', () => {
  it('caps או״ק at 16 characters', () => {
    expect(PATROL_CALLSIGN_MAX_LENGTH).toBe(16)
    expect(patrolCallsignForInput('12345678901234567')).toBe('1234567890123456')
    expect(patrolCallsignForInput('ניידת 12')).toBe('ניידת 12')
  })
})
