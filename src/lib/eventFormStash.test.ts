import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyEventDraft, type EventFormDraft } from './eventForm'
import {
  applyStashedEventDraft,
  clearEventFormStash,
  eventFormStashId,
  isMobileWebViewport,
  readEventFormStash,
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

  it('treats the mobile shell breakpoint as mobile web', () => {
    expect(isMobileWebViewport(() => ({ matches: true }))).toBe(true)
    expect(isMobileWebViewport(() => ({ matches: false }))).toBe(false)
  })

  it('overlays a stashed create onto a fresh form without stealing the live lead', () => {
    const base = draft()
    const next = applyStashedEventDraft(base, {
      ...draft({
        police_event_id: '12345',
        location: 'מחלף שורק',
        shift_lead: { full_name: 'ישן', callsign: '0' },
      }),
    })
    expect(next?.police_event_id).toBe('12345')
    expect(next?.location).toBe('מחלף שורק')
    expect(next?.shift_lead).toEqual({ full_name: 'עמרי', callsign: 'Admin' })
  })

  it('rejects a stash that is not an event draft', () => {
    expect(applyStashedEventDraft(draft(), null)).toBeNull()
    expect(applyStashedEventDraft(draft(), { police_event_id: '1' })).toBeNull()
  })

  it('round-trips a create and keeps the create key after the row exists', () => {
    installStorage()
    const userId = 'u1'
    const created = draft({ police_event_id: '99', location: 'כביש 1' })
    stashEventFormDraft(userId, created, NOW)
    expect(readEventFormStash(userId, null, NOW)?.police_event_id).toBe('99')

    const withId = { ...created, id: 'evt-9' }
    stashEventFormDraft(userId, withId, NOW)
    expect(readEventFormStash(userId, null, NOW)?.id).toBe('evt-9')
    expect(readEventFormStash(userId, 'evt-9', NOW)?.location).toBe('כביש 1')
  })

  it('clears both the create key and the saved-event key', () => {
    installStorage()
    stashEventFormDraft('u1', draft({ id: 'evt-9', police_event_id: '1' }), NOW)
    clearEventFormStash('u1', 'evt-9')
    expect(readEventFormStash('u1', 'evt-9', NOW)).toBeNull()
    expect(readEventFormStash('u1', null, NOW)).toBeNull()
  })
})
