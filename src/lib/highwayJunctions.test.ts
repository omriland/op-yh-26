import { beforeEach, describe, expect, it, vi } from 'vitest'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('./supabase', () => ({
  supabase: { rpc },
}))

import { junctionIdFromPlaceId, junctionPlaceId, searchHighwayJunctions } from './highwayJunctions'

describe('junctionPlaceId / junctionIdFromPlaceId', () => {
  it('round-trips a junction id through the synthetic place id', () => {
    const id = '11111111-1111-1111-1111-111111111111'
    expect(junctionIdFromPlaceId(junctionPlaceId(id))).toBe(id)
  })

  it('returns null for a real Google place id', () => {
    expect(junctionIdFromPlaceId('ChIJx')).toBeNull()
  })

  it('returns null for null/undefined', () => {
    expect(junctionIdFromPlaceId(null)).toBeNull()
    expect(junctionIdFromPlaceId(undefined)).toBeNull()
  })
})

describe('searchHighwayJunctions', () => {
  beforeEach(() => {
    rpc.mockReset()
  })

  it('short-circuits an empty or whitespace query without calling the RPC', async () => {
    expect(await searchHighwayJunctions('')).toEqual([])
    expect(await searchHighwayJunctions('   ')).toEqual([])
    expect(rpc).not.toHaveBeenCalled()
  })

  it('calls search_highway_junctions with the trimmed query and returns its data', async () => {
    const junctions = [
      { id: '1', name_he: 'צומת מסובים', name_en: null, roads: '1 / 4', lat: 31.6, lng: 34.7 },
    ]
    rpc.mockResolvedValue({ data: junctions, error: null })

    const result = await searchHighwayJunctions('  מסובים  ')

    expect(rpc).toHaveBeenCalledWith('search_highway_junctions', { q: 'מסובים' })
    expect(result).toEqual(junctions)
  })
})
