import { beforeEach, describe, expect, it, vi } from 'vitest'

const { rpc, from, select, limit } = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  limit: vi.fn(),
}))
vi.mock('./supabase', () => ({
  supabase: { rpc, from },
}))

import {
  firstJunctionRoadNumber,
  junctionEditDistance,
  junctionIdFromPlaceId,
  junctionLocationLabel,
  junctionPlaceId,
  matchingRoadIdForJunction,
  rankHighwayJunctions,
  roadIdAfterJunctionSelection,
  roadNumberFromLookupName,
  searchHighwayJunctions,
  splitJunctionDirection,
} from './highwayJunctions'

const catalog = [
  {
    id: '1',
    name_he: 'צומת אהרונסון',
    name_en: 'Aharonson',
    aliases_he: [],
    aliases_en: [],
    roads: '4/721 (דרומי)',
    lat: 32.71,
    lng: 34.97,
  },
  {
    id: '2',
    name_he: 'צומת מסובים',
    name_en: 'Mesubim',
    aliases_he: ['מסובים'],
    aliases_en: [],
    roads: '4/461',
    lat: 32.03,
    lng: 34.84,
  },
  {
    id: '3',
    name_he: 'מחלף גלילות',
    name_en: 'Glilot',
    aliases_he: [],
    aliases_en: [],
    roads: '2/5',
    lat: 32.15,
    lng: 34.81,
  },
]

from.mockReturnValue({ select })
select.mockReturnValue({ limit })
limit.mockResolvedValue({ data: catalog, error: null })

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
    rpc.mockClear()
    from.mockClear()
    select.mockClear()
    limit.mockClear()
  })

  it('short-circuits an empty or whitespace query without calling the RPC', async () => {
    expect(await searchHighwayJunctions('')).toEqual([])
    expect(await searchHighwayJunctions('   ')).toEqual([])
    expect(rpc).not.toHaveBeenCalled()
  })

  it('searches the cached catalog without requiring a new RPC per query', async () => {
    const result = await searchHighwayJunctions('  מסובים  ')

    expect(result.map((junction) => junction.name_he)).toEqual(['צומת מסובים'])
    expect(rpc).not.toHaveBeenCalled()
  })

  it('tolerates a missing letter and an adjacent transposition', async () => {
    expect((await searchHighwayJunctions('אהרונסן')).map((row) => row.name_he)).toContain(
      'צומת אהרונסון',
    )
    expect((await searchHighwayJunctions('מסבוים')).map((row) => row.name_he)).toContain(
      'צומת מסובים',
    )
  })

  it('ignores a trailing direction while searching', async () => {
    expect((await searchHighwayJunctions('אהרונסון למערב')).map((row) => row.name_he)).toContain(
      'צומת אהרונסון',
    )
    expect((await searchHighwayJunctions('מחלף גלילות לכיוון צפון')).map((row) => row.name_he)).toContain(
      'מחלף גלילות',
    )
  })
})

describe('junction fuzzy and directional helpers', () => {
  it('ranks exact and prefix matches ahead of fuzzy matches', () => {
    const ranked = rankHighwayJunctions(catalog, 'מסובים')
    expect(ranked[0]?.name_he).toBe('צומת מסובים')
  })

  it('supports one adjacent transposition at distance one', () => {
    expect(junctionEditDistance('מסובים', 'מסבוים')).toBe(1)
  })

  it('splits common trailing direction variants', () => {
    expect(splitJunctionDirection('צומת אהרונסון למערב')).toEqual({
      baseQuery: 'צומת אהרונסון',
      directionSuffix: 'למערב',
    })
    expect(splitJunctionDirection('גלילות לכיוון צפון')).toEqual({
      baseQuery: 'גלילות',
      directionSuffix: 'לכיוון צפון',
    })
  })

  it('keeps the typed direction after selecting the canonical junction', () => {
    expect(junctionLocationLabel('צומת אהרונסון', 'אהרונסון למערב')).toBe(
      'צומת אהרונסון למערב',
    )
    expect(junctionLocationLabel('צומת רמלה צפון', 'צומת רמלה צפון')).toBe(
      'צומת רמלה צפון',
    )
  })
})

describe('junction road matching', () => {
  const roads = [
    { id: 'r4', name: 'כביש 4' },
    { id: 'r40', name: '40' },
    { id: 'r44', name: 'כביש 44' },
    { id: 'r5', name: 'כביש5' },
    { id: 'r6', name: '6' },
    { id: 'urban', name: 'עירוני (101)' },
  ]

  it('finds the first usable numeric junction-road token', () => {
    expect(firstJunctionRoadNumber('4/721 (דרומי)')).toBe('4')
    expect(firstJunctionRoadNumber(' 5 /אל כרים קאסם (כפר קאסם)')).toBe('5')
    expect(firstJunctionRoadNumber('כביש 4/721')).toBe('4')
    expect(firstJunctionRoadNumber('כביש4/721')).toBe('4')
    expect(firstJunctionRoadNumber('אל כרים קאסם/5')).toBe('5')
    expect(firstJunctionRoadNumber(null)).toBeNull()
  })

  it('extracts exact road numbers from supported lookup labels', () => {
    expect(roadNumberFromLookupName('6')).toBe('6')
    expect(roadNumberFromLookupName(' כביש 6 ')).toBe('6')
    expect(roadNumberFromLookupName('כביש6')).toBe('6')
    expect(roadNumberFromLookupName('כביש 6 (צפון)')).toBe('6')
    expect(roadNumberFromLookupName('עירוני (101)')).toBeNull()
  })

  it('matches the first road exactly without confusing 4 with 40 or 44', () => {
    expect(matchingRoadIdForJunction('4/721 (דרומי)', roads)).toBe('r4')
    expect(matchingRoadIdForJunction('40/406', roads)).toBe('r40')
  })

  it('tries later numeric tokens and returns no match when none resolve', () => {
    expect(matchingRoadIdForJunction('אל כרים קאסם/5', roads)).toBe('r5')
    expect(matchingRoadIdForJunction('90/57', roads)).toBeNull()
    expect(
      matchingRoadIdForJunction('6/40', [
        ...roads,
        { id: 'r6-duplicate', name: 'כביש 6' },
      ]),
    ).toBe('r40')
  })

  it('overwrites an existing road when the selected junction resolves', () => {
    expect(roadIdAfterJunctionSelection('', '4/721', roads)).toBe('r4')
    expect(roadIdAfterJunctionSelection('', '90/57', roads)).toBe('')
    expect(roadIdAfterJunctionSelection('r44', '4/721', roads)).toBe('r4')
    expect(roadIdAfterJunctionSelection('r44', '90/57', roads)).toBe('r44')
  })
})
