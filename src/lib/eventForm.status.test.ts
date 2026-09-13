import { describe, expect, it } from 'vitest'
import {
  deriveEventStatus,
  emptyEventDraft,
  type EventFormDraft,
  type ResponderDraft,
} from './eventForm'

function responder(overrides: Partial<ResponderDraft> = {}): ResponderDraft {
  return {
    key: 'r1',
    assignmentId: 'a1',
    responder_id: 'r1',
    full_name: 'דנה',
    callsign: '12',
    start_time: '08:00',
    end_time: '',
    total_km: '12',
    emergency_means: false,
    treated: [],
    status: 'done',
    hasOwnedData: false,
    expanded: false,
    hasVehicle: true,
    ...overrides,
  }
}

function draft(overrides: Partial<EventFormDraft> = {}): EventFormDraft {
  return {
    ...emptyEventDraft({ full_name: 'אחמ״ש', callsign: '1' }),
    end_time: '09:00',
    responders: [responder()],
    ...overrides,
  }
}

describe('deriveEventStatus', () => {
  it('stays draft with no assignments', () => {
    expect(deriveEventStatus(draft({ responders: [] }))).toBe('draft')
  })

  it('is done only when every responder is done, end time is set, and every KM is filled', () => {
    expect(
      deriveEventStatus(
        draft({
          end_time: '09:15',
          responders: [
            responder({ key: 'a', total_km: '8' }),
            responder({ key: 'b', responder_id: 'r2', total_km: '0' }),
          ],
        }),
      ),
    ).toBe('done')
  })

  it('stays partial when all responders are done but the event has no end time', () => {
    expect(deriveEventStatus(draft({ end_time: '' }))).toBe('partial')
    expect(deriveEventStatus(draft({ end_time: '  ' }))).toBe('partial')
  })

  it('stays partial when all responders are done but a lead KM is still empty', () => {
    expect(
      deriveEventStatus(
        draft({
          responders: [
            responder({ key: 'a', total_km: '10' }),
            responder({ key: 'b', responder_id: 'r2', total_km: '' }),
          ],
        }),
      ),
    ).toBe('partial')
  })

  it('reaches done when the only empty KM belongs to a responder with no vehicle', () => {
    // The lead cannot type a KM for a ללא-רכב volunteer — the input is disabled.
    // Requiring one anyway left the event permanently partial.
    expect(
      deriveEventStatus(
        draft({
          responders: [
            responder({ key: 'a', total_km: '10' }),
            responder({ key: 'b', responder_id: 'r2', total_km: '', hasVehicle: false }),
          ],
        }),
      ),
    ).toBe('done')
  })

  it('still blocks done when a responder who does have a vehicle is missing KM', () => {
    expect(
      deriveEventStatus(
        draft({
          responders: [
            responder({ key: 'a', total_km: '', hasVehicle: true }),
            responder({ key: 'b', responder_id: 'r2', total_km: '', hasVehicle: false }),
          ],
        }),
      ),
    ).toBe('partial')
  })

  it('stays in_progress when nobody has completed, even with end and KM', () => {
    expect(
      deriveEventStatus(
        draft({
          responders: [responder({ status: 'in_progress' }), responder({ key: 'b', status: 'pending' })],
        }),
      ),
    ).toBe('in_progress')
  })
})
