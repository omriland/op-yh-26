import { beforeEach, describe, expect, it, vi } from 'vitest'

const sb = vi.hoisted(() => ({ invoke: vi.fn(), rpc: vi.fn(), inFn: vi.fn(), select: vi.fn() }))
vi.mock('./supabase', () => ({
  supabase: {
    functions: { invoke: sb.invoke },
    rpc: sb.rpc,
    from: () => ({ select: (s: string) => { sb.select(s); return { in: sb.inFn } } }),
  },
}))
vi.mock('./responderFreezeSchema', async (orig) => {
  const actual = await orig<typeof import('./responderFreezeSchema')>()
  return { ...actual, withResponderFreeze: async (s: string) => s.split(actual.RESPONDER_FREEZE_FIELDS).join('frozen_over_60km,') }
})

import { interpretQuery as interpretWith, reportChipRemoved, reportCounts, runSearch as runWith } from './smartSearchApi'
import type { SmartSearchFilter } from '../../supabase/functions/_shared/smartSearchFilter'
import { directFilter } from './smartSearch'

const vocab = { eventTypes: ['תאונה'], districts: ['צפון'] }
const interpretQuery = (q: string, role: 'admin' | 'lead' | 'responder' = 'admin') =>
  interpretWith(q, { role, vocab, today: '2026-11-08' })
const runSearch = (f: SmartSearchFilter, limit: number, role: 'admin' | 'lead' | 'responder' = 'admin') =>
  runWith(f, limit, { role })

const httpError = (status: number, body: unknown) => ({
  data: null,
  error: { context: { status, json: async () => body } },
})

beforeEach(() => {
  sb.invoke.mockReset()
  sb.rpc.mockReset()
  sb.inFn.mockReset()
  sb.select.mockReset()
  sb.rpc.mockResolvedValue({ data: 'log-1', error: null })
})

describe('interpretQuery', () => {
  it('handles a plate-like query locally and logs the direct lane', async () => {
    const r = await interpretQuery('12-345-67')
    expect(sb.invoke).not.toHaveBeenCalled()
    expect(r).toMatchObject({ filter: directFilter('12-345-67'), lane: 'direct' })
    expect(await r.logId).toBe('log-1')
    expect(sb.rpc).toHaveBeenCalledWith('app_search_log', expect.objectContaining({ p_lane: 'direct', p_query: '12-345-67' }))
  })

  it('a log failure gives logId null, not an error', async () => {
    sb.rpc.mockRejectedValue(new Error('boom'))
    const r = await interpretQuery('123')
    expect(await r.logId).toBeNull()
    expect(r.lane).toBe('direct')
  })

  it('blank query invokes nothing', async () => {
    const r = await interpretQuery('  ״. ')
    expect(sb.invoke).not.toHaveBeenCalled()
    expect(sb.rpc).not.toHaveBeenCalled()
    expect(r.lane).toBe('direct')
    expect(await r.logId).toBeNull()
  })

  it('returns the direct lane without waiting for the log write', async () => {
    let finishLog: (v: { data: string; error: null }) => void = () => {}
    sb.rpc.mockReturnValue(new Promise((resolve) => { finishLog = resolve }))
    const r = await interpretQuery('4471')
    expect(r.lane).toBe('direct')
    expect(sb.rpc).toHaveBeenCalledWith('app_search_log', expect.objectContaining({ p_lane: 'direct' }))
    finishLog({ data: 'late-log', error: null })
    expect(await r.logId).toBe('late-log')
  })

  it('returns the fallback lane without waiting for the log write', async () => {
    sb.invoke.mockResolvedValue(httpError(503, { error: 'not_configured' }))
    let finishLog: (v: { data: string; error: null }) => void = () => {}
    sb.rpc.mockReturnValue(new Promise((resolve) => { finishLog = resolve }))
    const r = await interpretQuery('סוזוקי')
    expect(r.lane).toBe('fallback')
    finishLog({ data: 'late-log', error: null })
    expect(await r.logId).toBe('late-log')
  })

  it('uses the AI lane and its logId', async () => {
    const filter = { intent: 'find', entity: 'events', source: 'new', road: '90' }
    sb.invoke.mockResolvedValue({ data: { filter, logId: 'ai-1' }, error: null })
    const r = await interpretQuery('תקלות בכביש 90')
    expect(sb.invoke).toHaveBeenCalledWith('smart-search', { body: { q: 'תקלות בכביש 90' }, timeout: 6500 })
    expect(r).toMatchObject({ filter, lane: 'ai' })
    expect(await r.logId).toBe('ai-1')
  })

  it('a client deadline abort falls back like any other failure', async () => {
    const abort = Object.assign(new Error('Failed to send a request to the Edge Function'), {
      name: 'FunctionsFetchError',
      context: new DOMException('The operation was aborted.', 'AbortError'),
    })
    sb.invoke.mockResolvedValue({ data: null, error: abort })
    const r = await interpretQuery('סוזוקי')
    expect(r).toMatchObject({ filter: directFilter('סוזוקי'), lane: 'fallback' })
    expect(await r.logId).toBe('log-1')
  })

  it('503 falls back to the direct filter and logs the fallback lane', async () => {
    sb.invoke.mockResolvedValue(httpError(503, { error: 'not_configured' }))
    const r = await interpretQuery('סוזוקי')
    expect(r).toMatchObject({ filter: directFilter('סוזוקי'), lane: 'fallback' })
    expect(await r.logId).toBe('log-1')
    expect(sb.rpc).toHaveBeenCalledWith('app_search_log', expect.objectContaining({ p_lane: 'fallback' }))
  })

  it('reuses the logId the function wrote for its own failure, with the reason', async () => {
    sb.invoke.mockResolvedValue(httpError(502, { error: 'refusal', logId: 'fn-log' }))
    const r = await interpretQuery('סוזוקי')
    expect(r).toMatchObject({ lane: 'fallback', reason: 'refusal' })
    expect(await r.logId).toBe('fn-log')
    expect(sb.rpc).not.toHaveBeenCalled()
  })

  it('logs a fallback the function never saw with reason network', async () => {
    sb.invoke.mockResolvedValue({ data: null, error: new Error('offline') })
    const r = await interpretQuery('סוזוקי')
    expect(r.reason).toBe('network')
    await r.logId
    expect(sb.rpc).toHaveBeenCalledWith('app_search_log', expect.objectContaining({ p_lane: 'fallback', p_reason: 'network' }))
  })

  it('answers from the rules lane without the model when every word is known', async () => {
    const r = await interpretQuery('תאונה בצפון אתמול')
    expect(sb.invoke).not.toHaveBeenCalled()
    expect(r).toMatchObject({
      lane: 'rules',
      filter: { event_type: 'תאונה', district: 'צפון', date_from: '2026-11-07', date_to: '2026-11-07' },
    })
    await r.logId
    expect(sb.rpc).toHaveBeenCalledWith('app_search_log', expect.objectContaining({ p_lane: 'rules' }))
  })

  it('asks the model for every role when words are left over', async () => {
    sb.invoke.mockResolvedValue({ data: { filter: { intent: 'find', entity: 'both', source: 'both' }, logId: 'x' }, error: null })
    await interpretQuery('האירועים של יוסי בצפון', 'responder')
    expect(sb.invoke).toHaveBeenCalledTimes(1)
  })

  it('network error falls back', async () => {
    sb.invoke.mockResolvedValue({ data: null, error: new Error('network') })
    expect((await interpretQuery('סוזוקי')).lane).toBe('fallback')
  })

  it('400 query_too_long maps to error', async () => {
    sb.invoke.mockResolvedValue(httpError(400, { error: 'query_too_long' }))
    const r = await interpretQuery('א')
    expect(r.error).toBe('query_too_long')
  })

  it('rejects an over-long query without calling the function', async () => {
    const r = await interpretQuery('א'.repeat(301))
    expect(sb.invoke).not.toHaveBeenCalled()
    expect(r.error).toBe('query_too_long')
  })
})

describe('runSearch', () => {
  it('runs once per variant on a text-only filter and merges without duplicates', async () => {
    sb.rpc.mockImplementation(async (name: string, args: { p_filter: { text: string } }) => {
      if (name === 'app_search') {
        return args.p_filter.text === 'xuzuei'
          ? { data: { events: [{ id: 'a', found_by: 'א' }, { id: 'b', found_by: 'ב' }], people: [] }, error: null }
          : { data: { events: [{ id: 'b', found_by: 'ב2' }, { id: 'c', found_by: 'ג' }], people: [] }, error: null }
      }
      return { data: { rows: [] }, error: null }
    })
    sb.inFn.mockImplementation(async (_c: string, ids: string[]) => ({
      data: [...ids].reverse().map((id) => ({ id })),
      error: null,
    }))
    const r = await runSearch(directFilter('xuzuei'), 200)
    const calls = sb.rpc.mock.calls.filter((c) => c[0] === 'app_search')
    expect(calls).toHaveLength(2)
    expect(sb.rpc.mock.calls.filter((c) => c[0] === 'app_search_archive')).toHaveLength(2)
    expect(r.events.map((e) => e.id)).toEqual(['a', 'b', 'c'])
    expect(r.events[1].found_by).toBe('ב')
  })

  it('one call for digits-only text', async () => {
    sb.rpc.mockResolvedValue({ data: { events: [], people: [], rows: [] }, error: null })
    await runSearch(directFilter('12345'), 50)
    expect(sb.rpc.mock.calls.filter((c) => c[0] === 'app_search')).toHaveLength(1)
  })

  it('throws when an RPC errors', async () => {
    sb.rpc.mockImplementation(async (name: string) =>
      name === 'app_search_archive'
        ? { data: null, error: { message: 'x', code: '42501' } }
        : { data: { events: [], people: [] }, error: null },
    )
    await expect(runSearch(directFilter('12345'), 50)).rejects.toThrow()
  })
})

describe('runSearch by role', () => {
  beforeEach(() => {
    sb.rpc.mockResolvedValue({ data: { events: [], people: [], rows: [] }, error: null })
  })
  it('never calls the archive for a shift lead or a responder, even when the filter asks', async () => {
    for (const role of ['lead', 'responder'] as const) {
      sb.rpc.mockClear()
      const r = await runSearch({ ...directFilter('גשר'), source: 'archive' }, 50, role)
      expect(sb.rpc.mock.calls.filter((c) => c[0] === 'app_search_archive')).toHaveLength(0)
      expect(sb.rpc.mock.calls[0][1].p_filter.source).toBe('new')
      expect(r.archive).toEqual([])
    }
  })
  it('passes the typing session to the archive so it audits once', async () => {
    await runWith(directFilter('גשר'), 5, { role: 'admin', session: 's-1' })
    expect(sb.rpc).toHaveBeenCalledWith('app_search_archive', expect.objectContaining({ p_session: 's-1' }))
  })
  it('reports the keys a responder cannot use', async () => {
    const r = await runSearch({ ...directFilter(''), entity: 'people', volunteer_status: 'active_volunteer' }, 50, 'responder')
    expect(r.dropped.map((d) => d.key)).toEqual(['volunteer_status'])
    expect(sb.rpc.mock.calls[0][1].p_filter).not.toHaveProperty('volunteer_status')
  })
})

describe('runSearch errors and hydration', () => {
  it('resolves the responder-freeze token in the hydration select', async () => {
    sb.rpc.mockImplementation(async (name: string) =>
      name === 'app_search'
        ? { data: { events: [{ id: 'a', found_by: 'x' }], people: [] }, error: null }
        : { data: { rows: [] }, error: null },
    )
    sb.inFn.mockResolvedValue({ data: [{ id: 'a' }], error: null })
    await runSearch(directFilter('12345'), 50)
    expect(sb.select).toHaveBeenCalledTimes(1)
    expect(sb.select.mock.calls[0][0]).not.toContain('__responder_freeze_fields__')
    expect(sb.select.mock.calls[0][0]).toContain('frozen_over_60km')
  })

  it('embeds event-owned and responder-owned treated plates', async () => {
    sb.rpc.mockImplementation(async (name: string) =>
      name === 'app_search'
        ? { data: { events: [{ id: 'a', found_by: 'x' }], people: [] }, error: null }
        : { data: { rows: [] }, error: null },
    )
    sb.inFn.mockResolvedValue({ data: [{ id: 'a' }], error: null })
    await runSearch(directFilter('12345'), 50)
    const select: string = sb.select.mock.calls[0][0]
    expect(select).toContain('shared_plates:event_treated_plates!event_treated_plates_event_id_fkey(')
    const responders = select.indexOf('responders:event_responders(')
    const owned = select.indexOf('treated_plates:event_treated_plates!event_treated_plates_event_responder_id_fkey(')
    expect(responders).toBeGreaterThan(-1)
    expect(owned).toBeGreaterThan(responders)
    // The responder plates sit inside the responders embed, not after it.
    let depth = 0
    for (const ch of select.slice(responders, owned)) depth += ch === '(' ? 1 : ch === ')' ? -1 : 0
    expect(depth).toBe(1)
    expect(select.split('(').length).toBe(select.split(')').length)
  })

  it('throws when app_search errors', async () => {
    sb.rpc.mockImplementation(async (name: string) =>
      name === 'app_search'
        ? { data: null, error: { message: 'x' } }
        : { data: { rows: [] }, error: null },
    )
    await expect(runSearch(directFilter('12345'), 50)).rejects.toThrow('x')
  })

  it('throws when hydration errors', async () => {
    sb.rpc.mockImplementation(async (name: string) =>
      name === 'app_search'
        ? { data: { events: [{ id: 'a', found_by: 'x' }], people: [] }, error: null }
        : { data: { rows: [] }, error: null },
    )
    sb.inFn.mockResolvedValue({ data: null, error: { message: 'hydrate failed' } })
    await expect(runSearch(directFilter('12345'), 50)).rejects.toThrow('hydrate failed')
  })
})

describe('reports', () => {
  it('reportCounts and reportChipRemoved call the RPCs', async () => {
    await reportCounts('l', { events: 1, archive: 2, people: 3 })
    expect(sb.rpc).toHaveBeenCalledWith('set_smart_search_log_counts', { p_id: 'l', p_events: 1, p_archive: 2, p_people: 3 })
    await reportChipRemoved('l')
    expect(sb.rpc).toHaveBeenCalledWith('mark_smart_search_chip_removed', { p_id: 'l' })
  })
})
