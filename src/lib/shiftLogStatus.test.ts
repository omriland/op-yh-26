import { describe, expect, it } from 'vitest'
import type { ShiftBornEventSnapshot } from './shiftBornEvents'
import { deriveShiftLogStatus } from './shiftLogStatus'

function event(over: Partial<ShiftBornEventSnapshot> = {}): ShiftBornEventSnapshot {
  return {
    status: 'in_progress',
    police_event_id: null,
    treatment_detail: null,
    treatment_notes: null,
    road_id: null,
    location: null,
    treated_count: 0,
    ...over,
  }
}

describe('deriveShiftLogStatus', () => {
  it('is open (in_progress) when nothing has been logged, even if empty events exist', () => {
    expect(
      deriveShiftLogStatus({
        odometer_start: null,
        odometer_end: null,
        events: [],
      }),
    ).toBe('in_progress')
    expect(
      deriveShiftLogStatus({
        odometer_start: null,
        odometer_end: null,
        events: [event(), event()],
      }),
    ).toBe('in_progress')
  })

  it('becomes טיוטה when a responder starts the odometer or an event', () => {
    expect(
      deriveShiftLogStatus({
        odometer_start: 100,
        odometer_end: null,
        events: [],
      }),
    ).toBe('draft')
    expect(
      deriveShiftLogStatus({
        odometer_start: null,
        odometer_end: null,
        events: [event({ treatment_detail: 'חילוץ' })],
      }),
    ).toBe('draft')
    expect(
      deriveShiftLogStatus({
        odometer_start: 100,
        odometer_end: 140,
        events: [event()],
      }),
    ).toBe('draft')
  })

  it('closes only when both odometers and every event are done', () => {
    expect(
      deriveShiftLogStatus({
        odometer_start: 100,
        odometer_end: 140,
        events: [],
      }),
    ).toBe('closed')
    expect(
      deriveShiftLogStatus({
        odometer_start: 100,
        odometer_end: 100,
        events: [event({ status: 'done', location: 'איילון' })],
      }),
    ).toBe('closed')
    expect(
      deriveShiftLogStatus({
        odometer_start: 100,
        odometer_end: 140,
        events: [
          event({ status: 'done', location: 'א' }),
          event({ status: 'in_progress', location: 'ב' }),
        ],
      }),
    ).toBe('draft')
  })
})
