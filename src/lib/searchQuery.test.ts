import { describe, expect, it } from 'vitest'
import {
  filterSelectOptions,
  mapEnKeysToHe,
  searchQueryVariants,
  sortByCallsignForNumericQuery,
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

describe('sortByCallsignForNumericQuery', () => {
  const people = (...callsigns: Array<string | null>) =>
    callsigns.map((callsign, index) => ({ id: `p${index}`, callsign }))
  const callsigns = (rows: { callsign: string | null }[]) => rows.map((row) => row.callsign)

  it('orders the screenshot search by callsign', () => {
    const rows = people('815', '874', '528', '598', '823', '418', '873', '228')
    expect(callsigns(sortByCallsignForNumericQuery(rows, '8'))).toEqual([
      '228', '418', '528', '598', '815', '823', '873', '874',
    ])
  })

  it('compares as numbers, not strings', () => {
    expect(callsigns(sortByCallsignForNumericQuery(people('815', '98'), ' 8 '))).toEqual(['98', '815'])
  })

  it('puts non-numeric and missing callsigns last, in their given order', () => {
    const rows = people('אביב', '815', null, '98', 'ב8')
    expect(callsigns(sortByCallsignForNumericQuery(rows, '8'))).toEqual(['98', '815', 'אביב', null, 'ב8'])
  })

  it('keeps the given order for equal callsigns', () => {
    const rows = people('8', '8', '08')
    expect(sortByCallsignForNumericQuery(rows, '8').map((row) => row.id)).toEqual(['p0', 'p1', 'p2'])
  })

  it('leaves name and empty searches in their given order', () => {
    const rows = people('815', '98')
    expect(callsigns(sortByCallsignForNumericQuery(rows, 'יוסי'))).toEqual(['815', '98'])
    expect(callsigns(sortByCallsignForNumericQuery(rows, 'a8'))).toEqual(['815', '98'])
    expect(callsigns(sortByCallsignForNumericQuery(rows, '  '))).toEqual(['815', '98'])
  })
})
