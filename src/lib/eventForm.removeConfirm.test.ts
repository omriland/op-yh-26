import { describe, expect, it } from 'vitest'
import {
  eventResponderHasFilledFields,
  eventResponderRemoveConfirm,
  NEW_RESPONDER_EMERGENCY_MEANS,
  type ResponderDraft,
} from './eventForm'

function row(overrides: Partial<ResponderDraft> = {}): ResponderDraft {
  return {
    key: 'r1',
    assignmentId: 'a1',
    responder_id: 'r1',
    full_name: 'דנה',
    callsign: '12',
    start_time: '',
    end_time: '',
    total_km: '',
    emergency_means: false,
    treated: [],
    status: 'pending',
    hasOwnedData: false,
    expanded: false,
    hasVehicle: true,
    ...overrides,
  }
}

describe('eventResponderHasFilledFields', () => {
  it('is false for an empty assignment', () => {
    expect(eventResponderHasFilledFields(row())).toBe(false)
  })

  it('is true after any single lead field', () => {
    expect(eventResponderHasFilledFields(row({ start_time: '08:00' }))).toBe(true)
    expect(eventResponderHasFilledFields(row({ end_time: '09:00' }))).toBe(true)
    expect(eventResponderHasFilledFields(row({ total_km: '12' }))).toBe(true)
    expect(eventResponderHasFilledFields(row({ emergency_means: true }))).toBe(true)
    expect(
      eventResponderHasFilledFields(row({ treated: [{ vehicle_kind_id: 'car', quantity: 1 }] })),
    ).toBe(true)
    expect(eventResponderHasFilledFields(row({ hasOwnedData: true }))).toBe(true)
  })

  it('ignores km when the responder has no vehicle', () => {
    expect(eventResponderHasFilledFields(row({ total_km: '12', hasVehicle: false }))).toBe(false)
  })

  it('ignores the default אמצעים on a freshly added assignment', () => {
    expect(
      eventResponderHasFilledFields(
        row({ assignmentId: undefined, emergency_means: NEW_RESPONDER_EMERGENCY_MEANS }),
      ),
    ).toBe(false)
    expect(
      eventResponderHasFilledFields(row({ assignmentId: undefined, start_time: '08:00' })),
    ).toBe(true)
  })
})

describe('eventResponderRemoveConfirm', () => {
  it('names the responder', () => {
    expect(eventResponderRemoveConfirm('דנה')).toBe('האם אתה בטוח שברצונך להסיר את דנה?')
    expect(eventResponderRemoveConfirm('  ')).toBe('האם אתה בטוח שברצונך להסיר את מתנדב?')
  })
})
