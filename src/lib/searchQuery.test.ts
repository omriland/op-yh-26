import { describe, expect, it } from 'vitest'
import {
  filterSelectOptions,
  isExactNumberQuery,
  listSearchMatches,
  mapEnKeysToHe,
  searchQueryVariants,
  textIncludesQuery,
} from './searchQuery'
import { filterReportCatalog, queryMatchesText } from './reports/librarySearch'

describe('mapEnKeysToHe', () => {
  it('maps QWERTY keys to the standard Israeli Hebrew layout', () => {
    expect(mapEnKeysToHe('akuo')).toBe('שלום')
    expect(mapEnKeysToHe('fpukho')).toBe('כפולים')
    expect(mapEnKeysToHe('sbt')).toBe('דנא')
  })

  it('leaves Hebrew, digits, and spaces unchanged', () => {
    expect(mapEnKeysToHe('דנה 12')).toBe('דנה 12')
  })
})

describe('searchQueryVariants', () => {
  it('returns both the typed query and the Hebrew-mapped query', () => {
    expect(searchQueryVariants('  fpukho  ')).toEqual(['fpukho', 'כפולים'])
  })

  it('does not duplicate when mapping changes nothing', () => {
    expect(searchQueryVariants('דנה')).toEqual(['דנה'])
  })
})

describe('listSearchMatches', () => {
  const fields = {
    policeEventId: '1126',
    roadName: 'כביש 6',
    location: 'מחלף ראש העין',
    patrolNumber: '330',
    names: ['שמוליק שנול'],
    callsigns: ['363', '480'],
  }

  it('treats a digits-only query as an exact id or callsign', () => {
    expect(isExactNumberQuery('363')).toBe(true)
    expect(isExactNumberQuery(' 1126 ')).toBe(true)
    expect(isExactNumberQuery('כביש')).toBe(false)
    expect(isExactNumberQuery('D1')).toBe(false)
    expect(listSearchMatches(fields, '363')).toBe(true)
    expect(listSearchMatches(fields, '1126')).toBe(true)
    expect(listSearchMatches(fields, '330')).toBe(true)
    expect(listSearchMatches(fields, '36')).toBe(false)
    expect(listSearchMatches(fields, '112')).toBe(false)
    expect(listSearchMatches(fields, '6')).toBe(false)
  })

  it('still matches a word inside a road, a place or a name', () => {
    expect(listSearchMatches(fields, 'אייל')).toBe(false)
    expect(listSearchMatches(fields, 'העין')).toBe(true)
    expect(listSearchMatches(fields, 'שמוליק')).toBe(true)
    expect(listSearchMatches(fields, 'כביש')).toBe(true)
  })
})

describe('textIncludesQuery', () => {
  it('matches Hebrew haystack when the query was typed on an English keyboard', () => {
    expect(textIncludesQuery('דנה כהן', 'sbv')).toBe(true)
    expect(textIncludesQuery('דנה כהן', 'דנה')).toBe(true)
    expect(textIncludesQuery('דנה כהן', 'xyz')).toBe(false)
  })
})

describe('queryMatchesText EN layout', () => {
  it('fuzzy-matches a Hebrew title typed with English keys', () => {
    expect(queryMatchesText('אירועים כפולים', 'fpukho')).toBe(true)
    expect(queryMatchesText('חריגי ק״מ', 'jrhdh')).toBe(true)
  })
})

describe('filterReportCatalog EN layout', () => {
  const kinds = [
    { id: 'duplicate_events', title: 'אירועים כפולים', includes: 'מתנדב ומקום' },
    { id: 'km_exceptions', title: 'חריגי ק״מ', includes: '80 ק״מ' },
  ]

  it('finds a Hebrew report title typed on an English keyboard', () => {
    expect(filterReportCatalog(kinds, 'fpukho').map((kind) => kind.id)).toEqual(['duplicate_events'])
  })
})

describe('filterSelectOptions', () => {
  const roads = [
    { value: '1', label: 'כביש 1' },
    { value: '4', label: 'כביש 4' },
    { value: 'h', label: 'כביש החוף' },
  ]

  it('returns all options when the query is blank', () => {
    expect(filterSelectOptions(roads, '  ')).toEqual(roads)
  })

  it('filters by label and accepts English-keyboard Hebrew', () => {
    expect(filterSelectOptions(roads, '4').map((row) => row.value)).toEqual(['4'])
    expect(filterSelectOptions(roads, 'החוף').map((row) => row.label)).toEqual(['כביש החוף'])
    expect(filterSelectOptions(roads, 'fcha 1').map((row) => row.label)).toEqual(['כביש 1'])
  })
})
