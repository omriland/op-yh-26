import { describe, expect, it } from 'vitest'
import { mapEnKeysToHe, searchQueryVariants, textIncludesQuery } from './searchQuery'
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
    { id: 'duplicate_events', title: 'אירועים כפולים', includes: 'כונן ומקום' },
    { id: 'km_exceptions', title: 'חריגי ק״מ', includes: '60 ק״מ' },
  ]

  it('finds a Hebrew report title typed on an English keyboard', () => {
    expect(filterReportCatalog(kinds, 'fpukho').map((kind) => kind.id)).toEqual(['duplicate_events'])
  })
})
