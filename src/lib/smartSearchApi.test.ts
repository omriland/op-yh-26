import { beforeEach, describe, expect, it, vi } from 'vitest'

const sb = vi.hoisted(() => ({ invoke: vi.fn(), rpc: vi.fn(), inFn: vi.fn() }))
vi.mock('./supabase', () => ({
  supabase: {
    functions: { invoke: sb.invoke },
    rpc: sb.rpc,
    from: () => ({ select: () => ({ in: sb.inFn }) }),
  },
}))

import { interpretQuery, reportChipRemoved, reportCounts, runSearch } from './smartSearchApi'
import { directFilter } from './smartSearch'

const httpError = (status: number, body: unknown) => ({
  data: null,
  error: { context: { status, json: async () => body } },
})

beforeEach(() => {
  sb.invoke.mockReset()
  sb.rpc.mockReset()
  sb.inFn.mockReset()
  sb.rpc.mockResolvedValue({ data: 'log-1', error: null })
})

describe('interpretQuery', () => {
  it('handles a plate-like query locally and logs the direct lane', async () => {
    const r = await interpretQuery('12-345-67')
    expect(sb.invoke).not.toHaveBeenCalled()
    expect(r).toEqual({ filter: directFilter('12-345-67'), lane: 'direct', logId: 'log-1' })
    expect(sb.rpc).toHaveBeenCalledWith('log_smart_search', expect.objectContaining({ p_lane: 'direct', p_query: '12-345-67' }))
  })

  it('a log failure gives logId null, not an error', async () => {
    sb.rpc.mockRejectedValue(new Error('boom'))
    const r = await interpretQuery('123')
    expect(r.logId).toBeNull()
    expect(r.lane).toBe('direct')
  })

  it('blank query invokes nothing', async () => {
    const r = await interpretQuery('  ״. ')
    expect(sb.invoke).not.toHaveBeenCalled()
    expect(sb.rpc).not.toHaveBeenCalled()
    expect(r).toMatchObject({ lane: 'direct', logId: null })
  })

  it('uses the AI lane and its logId', async () => {
    const filter = { intent: 'find', entity: 'events', source: 'new', road: '90' }
    sb.invoke.mockResolvedValue({ data: { filter, logId: 'ai-1' }, error: null })
    const r = await interpretQuery('תקלות בכביש 90')
    expect(sb.invoke).toHaveBeenCalledWith('smart-search', { body: { q: 'תקלות בכביש 90' } })
    expect(r).toEqual({ filter, lane: 'ai', logId: 'ai-1' })
  })

  it('503 falls back to the direct filter and logs the fallback lane', async () => {
    sb.invoke.mockResolvedValue(httpError(503, { error: 'not_configured' }))
    const r = await interpretQuery('סוזוקי')
    expect(r).toMatchObject({ filter: directFilter('סוזוקי'), lane: 'fallback', logId: 'log-1' })
    expect(sb.rpc).toHaveBeenCalledWith('log_smart_search', expect.objectContaining({ p_lane: 'fallback' }))
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
      if (name === 'admin_search') {
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
    const calls = sb.rpc.mock.calls.filter((c) => c[0] === 'admin_search')
    expect(calls).toHaveLength(2)
    expect(sb.rpc.mock.calls.filter((c) => c[0] === 'admin_search_archive')).toHaveLength(2)
    expect(r.events.map((e) => e.id)).toEqual(['a', 'b', 'c'])
    expect(r.events[1].found_by).toBe('ב')
  })

  it('one call for digits-only text', async () => {
    sb.rpc.mockResolvedValue({ data: { events: [], people: [], rows: [] }, error: null })
    await runSearch(directFilter('12345'), 50)
    expect(sb.rpc.mock.calls.filter((c) => c[0] === 'admin_search')).toHaveLength(1)
  })

  it('throws when an RPC errors', async () => {
    sb.rpc.mockImplementation(async (name: string) =>
      name === 'admin_search_archive'
        ? { data: null, error: { message: 'x', code: '42501' } }
        : { data: { events: [], people: [] }, error: null },
    )
    await expect(runSearch(directFilter('12345'), 50)).rejects.toThrow()
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
