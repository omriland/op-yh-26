import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyEventDraft, type EventFormDraft } from './eventForm'
import {
  applyStashedEventDraft,
  clearEventFormStash,
  eventFormStashForRoute,
  eventFormStashId,
  readEventFormStash,
  shouldKeepLiveCreateDraft,
  stashEventFormDraft,
} from './eventFormStash'

const NOW = 1_787_000_000_000

function installStorage() {
  const map = new Map<string, string>()
  const store: Storage = {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, v),
  }
  vi.stubGlobal('window', { localStorage: store })
  return map
}

function draft(partial: Partial<EventFormDraft> = {}): EventFormDraft {
  return {
    ...emptyEventDraft({ full_name: 'עמרי', callsign: 'Admin' }),
    ...partial,
  }
}

describe('eventFormStash', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('keys a create separately from an edit, and per user', () => {
    expect(eventFormStashId('u1')).toBe('u1:new')
    expect(eventFormStashId('u1', null)).toBe('u1:new')
    expect(eventFormStashId('u1', 'evt-1')).toBe('u1:evt-1')
    expect(eventFormStashId('u1', 'evt-1')).not.toBe(eventFormStashId('u2', 'evt-1'))
  })

  it('keeps a create-time main pick and refreshes the live lead name when the id matches', () => {
    const base = draft({ shift_lead_id: 'live-lead' })
    const sameId = applyStashedEventDraft(base, {
      ...draft({
        police_event_id: '12345',
        shift_lead: { full_name: 'ישן', callsign: '0' },
        shift_lead_id: 'live-lead',
      }),
    })
    expect(sameId?.police_event_id).toBe('12345')
    expect(sameId?.shift_lead).toEqual({ full_name: 'עמרי', callsign: 'Admin' })
    expect(sameId?.shift_lead_id).toBe('live-lead')

    const transferred = applyStashedEventDraft(base, {
      ...draft({
        police_event_id: '12345',
        shift_lead: { full_name: 'דנה', callsign: 'D1' },
        shift_lead_id: 'dana',
      }),
    })
    expect(transferred?.shift_lead_id).toBe('dana')
    expect(transferred?.shift_lead).toEqual({ full_name: 'דנה', callsign: 'D1' })
  })

  it('rejects a stash that is not an event draft', () => {
    expect(applyStashedEventDraft(draft(), null)).toBeNull()
    expect(applyStashedEventDraft(draft(), { police_event_id: '1' })).toBeNull()
  })

  it('round-trips a create and does not copy a saved row onto the create key', () => {
    installStorage()
    const userId = 'u1'
    const created = draft({ police_event_id: '99', location: 'כביש 1' })
    stashEventFormDraft(userId, created, NOW)
    expect(readEventFormStash(userId, null, NOW)?.police_event_id).toBe('99')

    const withId = { ...created, id: 'evt-9' }
    stashEventFormDraft(userId, withId, NOW)
    expect(readEventFormStash(userId, null, NOW)?.id).toBeUndefined()
    expect(readEventFormStash(userId, null, NOW)?.police_event_id).toBe('99')
    expect(readEventFormStash(userId, 'evt-9', NOW)?.location).toBe('כביש 1')
  })

  it('does not let אירוע חדש hydrate into an existing event’s edit', () => {
    const saved = draft({ id: 'evt-9', police_event_id: '12345', location: 'מחלף שורק' })
    expect(eventFormStashForRoute(undefined, saved)).toBeNull()
    expect(eventFormStashForRoute(null, saved)).toBeNull()
    expect(eventFormStashForRoute('evt-9', saved)?.id).toBe('evt-9')
    const unsaved = draft({ police_event_id: '99' })
    expect(eventFormStashForRoute(undefined, unsaved)).toBeNull()
  })

  it('clears both the create key and the saved-event key', () => {
    installStorage()
    stashEventFormDraft('u1', draft({ id: 'evt-9', police_event_id: '1' }), NOW)
    clearEventFormStash('u1', 'evt-9')
    expect(readEventFormStash('u1', 'evt-9', NOW)).toBeNull()
    expect(readEventFormStash('u1', null, NOW)).toBeNull()
  })
})

describe('shouldKeepLiveCreateDraft', () => {
  it('keeps a typed create that has not been saved yet', () => {
    const live = draft({ police_event_id: '12345' })
    expect(
      shouldKeepLiveCreateDraft({
        eventId: undefined,
        loadState: 'ready',
        draft: live,
        initialEventDate: live.event_date,
      }),
    ).toBe(true)
  })

  it('does not keep an empty create, an edit route, or a loading boot', () => {
    const empty = draft()
    expect(
      shouldKeepLiveCreateDraft({
        eventId: undefined,
        loadState: 'ready',
        draft: empty,
        initialEventDate: empty.event_date,
      }),
    ).toBe(false)
    expect(
      shouldKeepLiveCreateDraft({
        eventId: 'evt-1',
        loadState: 'ready',
        draft: draft({ police_event_id: '1' }),
        initialEventDate: empty.event_date,
      }),
    ).toBe(false)
    expect(
      shouldKeepLiveCreateDraft({
        eventId: undefined,
        loadState: 'loading',
        draft: draft({ police_event_id: '1' }),
        initialEventDate: empty.event_date,
      }),
    ).toBe(false)
  })
})
