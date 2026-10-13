import { describe, expect, it } from 'vitest'
import {
  changedPersistColumns,
  emptyEventDraft,
  eventPersistColumns,
  responderLeadPatch,
  secondaryLeadsUnchanged,
  shouldRewriteTreatedVehicles,
  type EventFormDraft,
  type ResponderDraft,
} from './eventForm'

function filledEvent(): EventFormDraft {
  const base = emptyEventDraft({ id: 'lead-1', full_name: 'א', callsign: '1' })
  return {
    ...base,
    id: 'event-1',
    event_date: '2026-10-12',
    start_time: '14:05',
    end_time: '',
    police_event_id: '3207',
    event_type_id: 'type-1',
    road_id: 'road-1',
    district_id: 'district-1',
    location: 'מחלף גלילות',
    notes: 'רכב תקוע בנתיב',
    station: 'איילון',
    responders: [responder()],
  }
}

function responder(partial: Partial<ResponderDraft> = {}): ResponderDraft {
  return {
    key: 'k1',
    assignmentId: 'assign-1',
    responder_id: 'user-1',
    full_name: 'יוסי',
    callsign: '12',
    start_time: '',
    end_time: '',
    total_km: '',
    emergency_means: true,
    treated: [{ vehicle_kind_id: 'car', quantity: 2 }],
    status: 'pending',
    hasOwnedData: false,
    expanded: false,
    hasVehicle: true,
    ...partial,
  }
}

const saveContext = {
  shiftLeadId: 'lead-1',
  districts: [{ id: 'district-1', name: 'מרכז' }],
  roads: [{ id: 'road-1', name: 'כביש 20' }],
  eventTypes: [{ id: 'type-1', name: 'חילוץ' }],
  allowPartial: false,
}

describe('event save patch', () => {
  it('does not rewrite event details when only a volunteer km changes', () => {
    const previous = filledEvent()
    const next: EventFormDraft = {
      ...previous,
      responders: [responder({ total_km: '42' })],
    }
    const patch = changedPersistColumns(
      eventPersistColumns({ draft: previous, ...saveContext }),
      eventPersistColumns({ draft: next, ...saveContext }),
    )
    expect(patch).toEqual({})
  })

  it('omits columns the form never loaded, so a later save cannot null them', () => {
    const previous = filledEvent()
    const next: EventFormDraft = {
      ...previous,
      location: '',
      notes: '',
      police_event_id: '',
      station: '',
    }
    const blank = eventPersistColumns({ draft: next, ...saveContext })
    const alsoBlank = eventPersistColumns({
      draft: { ...next, responders: [responder({ total_km: '7' })] },
      ...saveContext,
    })
    expect(changedPersistColumns(blank, alsoBlank)).not.toHaveProperty('location')
    expect(changedPersistColumns(blank, alsoBlank)).not.toHaveProperty('notes')
    expect(changedPersistColumns(blank, alsoBlank)).not.toHaveProperty('police_event_id')
  })

  it('still clears a detail the lead actually erased', () => {
    const previous = filledEvent()
    const next: EventFormDraft = { ...previous, location: '', notes: '' }
    const patch = changedPersistColumns(
      eventPersistColumns({ draft: previous, ...saveContext }),
      eventPersistColumns({ draft: next, ...saveContext }),
    )
    expect(patch.location).toBeNull()
    expect(patch.notes).toBeNull()
    expect(patch).not.toHaveProperty('police_event_id')
    expect(patch).not.toHaveProperty('road_id')
  })

  it('writes only the km that changed and leaves treated vehicles alone', () => {
    const previous = responder()
    const next = responder({ total_km: '42' })
    expect(
      responderLeadPatch({
        previous,
        next,
        startedAt: '2026-10-12T14:05:00',
        endedAt: null,
        previousStartedAt: '2026-10-12T14:05:00',
        previousEndedAt: null,
      }),
    ).toEqual({ total_km: 42 })
    expect(shouldRewriteTreatedVehicles(previous.treated, next.treated)).toBe(false)
  })

  it('rewrites treated vehicles only when a count changed', () => {
    const previous = responder()
    const next = responder({
      treated: [{ vehicle_kind_id: 'car', quantity: 3 }],
    })
    expect(shouldRewriteTreatedVehicles(previous.treated, next.treated)).toBe(true)
    expect(shouldRewriteTreatedVehicles(null, [])).toBe(false)
  })

  it('skips the secondary-lead sync when the form did not change them', () => {
    const leads = [
      { user_id: 'b', full_name: 'ב', callsign: '2', locked: false },
    ]
    expect(secondaryLeadsUnchanged(leads, leads)).toBe(true)
    expect(secondaryLeadsUnchanged([], [])).toBe(true)
    expect(secondaryLeadsUnchanged(null, [])).toBe(true)
    expect(
      secondaryLeadsUnchanged(leads, [
        ...leads,
        { user_id: 'c', full_name: 'ג', callsign: '3', locked: false },
      ]),
    ).toBe(false)
  })
})
