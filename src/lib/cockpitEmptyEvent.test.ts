import { describe, expect, it, vi } from 'vitest'
import {
  abandonedEmptyEventIdToDiscard,
  cockpitPageHideDiscardId,
  emptyEventDraft,
  eventDraftBaselineSnapshot,
  eventServerBaselineSnapshot,
  stripStoredTimeBaseline,
  type EventFormDraft,
} from './eventForm'
import {
  forgetDiscardedEventId,
  rememberDiscardedEventId,
  withoutDiscardedEvents,
} from './discardedEvents'
import { deleteEventOnUnload } from './events'

const LEAD = 'lead-1'
const OTHER_LEAD = 'lead-2'

/** The row אירוע חדש inserts: an id, today's date, this lead, nothing else. */
function insertedEmpty(partial: Partial<EventFormDraft> = {}): EventFormDraft {
  return {
    ...emptyEventDraft({ id: LEAD, full_name: 'א', callsign: '1' }),
    id: 'ev-1',
    ...partial,
  }
}

function storage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    data,
  }
}

describe('abandonedEmptyEventIdToDiscard', () => {
  const today = insertedEmpty().event_date

  it('returns the id of this lead’s untouched empty insert', () => {
    expect(abandonedEmptyEventIdToDiscard(insertedEmpty(), today, LEAD)).toBe('ev-1')
  })

  it.each<[string, Partial<EventFormDraft>]>([
    ['notes', { notes: 'הערה' }],
    ['police id', { police_event_id: '123' }],
    ['location', { location: 'כביש 1' }],
    ['map pin', { location_lat: 32.1, location_lng: 34.8 }],
    ['event type', { event_type_id: 'type-1' }],
    ['road', { road_id: 'road-1' }],
    ['district', { district_id: 'district-1' }],
    ['end time', { end_time: '10:00' }],
    ['cancelled', { is_cancelled: true }],
    ['bus lane', { bus_lane: true }],
    ['a changed date', { event_date: '2020-01-01' }],
    [
      'a secondary lead',
      { secondary_leads: [{ user_id: 'u', full_name: 'ב', callsign: '2', locked: false }] },
    ],
  ])('keeps an event with %s', (_label, partial) => {
    expect(abandonedEmptyEventIdToDiscard(insertedEmpty(partial), today, LEAD)).toBeNull()
  })

  it('keeps an event with an assigned volunteer', () => {
    const withResponder = insertedEmpty({
      responders: [{ responder_id: 'r1' } as EventFormDraft['responders'][number]],
    })
    expect(abandonedEmptyEventIdToDiscard(withResponder, today, LEAD)).toBeNull()
  })

  it('never drops another lead’s event, a row that was never saved, or with no viewer', () => {
    expect(
      abandonedEmptyEventIdToDiscard(insertedEmpty({ shift_lead_id: OTHER_LEAD }), today, LEAD),
    ).toBeNull()
    expect(abandonedEmptyEventIdToDiscard(insertedEmpty({ id: undefined }), today, LEAD)).toBeNull()
    expect(abandonedEmptyEventIdToDiscard(insertedEmpty(), today, undefined)).toBeNull()
    expect(abandonedEmptyEventIdToDiscard(null, today, LEAD)).toBeNull()
  })
})

describe('cockpitPageHideDiscardId (reload / tab close)', () => {
  const today = insertedEmpty().event_date
  const base = {
    variant: 'cockpit' as const,
    persisted: false,
    previewing: false,
    draft: insertedEmpty(),
    initialEventDate: today,
    viewerId: LEAD,
  }

  it('drops the untouched empty event being edited in the cockpit', () => {
    expect(cockpitPageHideDiscardId(base)).toBe('ev-1')
  })

  it('keeps it when anything was typed', () => {
    expect(cockpitPageHideDiscardId({ ...base, draft: insertedEmpty({ notes: 'x' }) })).toBeNull()
  })

  it('keeps it when the page may come back from the back/forward cache', () => {
    expect(cockpitPageHideDiscardId({ ...base, persisted: true })).toBeNull()
  })

  it('keeps it when the event was only previewed, not opened for editing', () => {
    expect(cockpitPageHideDiscardId({ ...base, previewing: true })).toBeNull()
  })

  it('leaves the full event form alone', () => {
    expect(cockpitPageHideDiscardId({ ...base, variant: 'page' })).toBeNull()
  })
})

describe('exit unchanged is not a write (dirty check)', () => {
  it('an existing event opened and left unchanged matches its saved baseline', () => {
    const loaded = insertedEmpty({
      id: 'ev-9',
      police_event_id: '555',
      location: 'כביש 6',
      notes: 'קיים',
      start_time: '09:15',
    })
    const shown = stripStoredTimeBaseline(loaded)
    expect(eventDraftBaselineSnapshot(shown)).toBe(eventServerBaselineSnapshot(loaded))
  })

  it('a real edit differs from the baseline, so it is saved', () => {
    const loaded = insertedEmpty({ id: 'ev-9', notes: 'קיים' })
    const edited = { ...stripStoredTimeBaseline(loaded), notes: 'קיים + עדכון' }
    expect(eventDraftBaselineSnapshot(edited)).not.toBe(eventServerBaselineSnapshot(loaded))
  })
})

describe('discarded event ids (this tab only)', () => {
  const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

  it('hides a discarded row from a list fetched before the delete lands', () => {
    const store = storage()
    rememberDiscardedEventId('b', store)
    expect(withoutDiscardedEvents(rows, store).map((row) => row.id)).toEqual(['a', 'c'])
  })

  it('shows the row again when the delete failed', () => {
    const store = storage()
    rememberDiscardedEventId('b', store)
    forgetDiscardedEventId('b', store)
    expect(withoutDiscardedEvents(rows, store)).toEqual(rows)
  })

  it('survives missing or broken storage', () => {
    expect(withoutDiscardedEvents(rows, null)).toEqual(rows)
    expect(() => rememberDiscardedEventId('b', null)).not.toThrow()
    const broken = storage({ 'yahpaz:discarded_event_ids': '{not json' })
    expect(withoutDiscardedEvents(rows, broken)).toEqual(rows)
    rememberDiscardedEventId('b', broken)
    expect(withoutDiscardedEvents(rows, broken).map((row) => row.id)).toEqual(['a', 'c'])
  })

  it('keeps only the most recent ids', () => {
    const store = storage()
    for (let i = 0; i < 60; i++) rememberDiscardedEventId(`id-${i}`, store)
    const kept = JSON.parse(store.data.get('yahpaz:discarded_event_ids') ?? '[]') as string[]
    expect(kept).toHaveLength(50)
    expect(kept[0]).toBe('id-10')
  })
})

describe('deleteEventOnUnload', () => {
  const options = { url: 'https://fake.supabase.test/', anonKey: 'anon-key' }

  it('sends the delete_event RPC with keepalive so it outlives the page', () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }))
    expect(deleteEventOnUnload('ev-1', 'user-jwt', { ...options, fetchImpl })).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://fake.supabase.test/rest/v1/rpc/delete_event')
    expect(init.method).toBe('POST')
    expect(init.keepalive).toBe(true)
    expect(init.headers).toMatchObject({
      apikey: 'anon-key',
      Authorization: 'Bearer user-jwt',
      'Content-Type': 'application/json',
    })
    expect(JSON.parse(String(init.body))).toEqual({ p_event_id: 'ev-1' })
  })

  it('does nothing without a signed-in token', () => {
    const fetchImpl = vi.fn()
    expect(deleteEventOnUnload('ev-1', null, { ...options, fetchImpl })).toBe(false)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('swallows a network failure', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('offline')
    })
    expect(deleteEventOnUnload('ev-1', 'user-jwt', { ...options, fetchImpl })).toBe(true)
    await Promise.resolve()
  })
})
