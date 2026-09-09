import { beforeEach, describe, expect, it, vi } from 'vitest'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('./supabase', () => ({
  supabase: { rpc },
}))

import {
  firstJunctionRoadNumber,
  junctionIdFromPlaceId,
  junctionPlaceId,
  matchingRoadIdForJunction,
  roadIdAfterJunctionSelection,
  roadNumberFromLookupName,
  searchHighwayJunctions,
} from './highwayJunctions'

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

describe('junction road matching', () => {
  const roads = [
    { id: 'r4', name: 'כביש 4' },
    { id: 'r40', name: '40' },
    { id: 'r44', name: 'כביש 44' },
    { id: 'r6', name: '6' },
    { id: 'urban', name: 'עירוני (101)' },
  ]

  it('parses only the numeric leading junction-road token', () => {
    expect(firstJunctionRoadNumber('4/721 (דרומי)')).toBe('4')
    expect(firstJunctionRoadNumber(' 5 /אל כרים קאסם (כפר קאסם)')).toBe('5')
    expect(firstJunctionRoadNumber('כביש 4/721')).toBeNull()
    expect(firstJunctionRoadNumber('אל כרים קאסם/5')).toBeNull()
    expect(firstJunctionRoadNumber(null)).toBeNull()
  })

  it('extracts exact road numbers from supported lookup labels', () => {
    expect(roadNumberFromLookupName('6')).toBe('6')
    expect(roadNumberFromLookupName(' כביש 6 ')).toBe('6')
    expect(roadNumberFromLookupName('כביש 6 (צפון)')).toBe('6')
    expect(roadNumberFromLookupName('עירוני (101)')).toBeNull()
  })

  it('matches the first road exactly without confusing 4 with 40 or 44', () => {
    expect(matchingRoadIdForJunction('4/721 (דרומי)', roads)).toBe('r4')
    expect(matchingRoadIdForJunction('40/406', roads)).toBe('r40')
  })

  it('returns no match for a non-numeric, missing, or ambiguous road', () => {
    expect(matchingRoadIdForJunction('אל כרים קאסם/5', roads)).toBeNull()
    expect(matchingRoadIdForJunction('90/57', roads)).toBeNull()
    expect(
      matchingRoadIdForJunction('6/40', [
        ...roads,
        { id: 'r6-duplicate', name: 'כביש 6' },
      ]),
    ).toBeNull()
  })

  it('auto-fills only an empty road and preserves an explicit selection', () => {
    expect(roadIdAfterJunctionSelection('', '4/721', roads)).toBe('r4')
    expect(roadIdAfterJunctionSelection('', '90/57', roads)).toBe('')
    expect(roadIdAfterJunctionSelection('r44', '4/721', roads)).toBe('r44')
  })
})
