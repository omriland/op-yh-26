import { describe, expect, it } from 'vitest'
import { filterReportCatalog } from './librarySearch'

const kinds = [
  {
    id: 'km_summary',
    title: 'סיכום ק״מ לפי כונן',
    includes: 'קילומטרים ואירועים לכל כונן פעיל לפי תאריך דיווח',
  },
  {
    id: 'km_detail',
    title: 'פירוט ק״מ לפי השתתפות',
    includes: 'שורה לכל השתתפות עם ק״מ לפי תאריך דיווח',
  },
  {
    id: 'km_exceptions',
    title: 'חריגי ק״מ',
    includes: 'אירועים עם 60 ק״מ ומעלה',
  },
  {
    id: 'duplicate_events',
    title: 'אירועים כפולים',
    includes: 'כונן + מקום + יום בחלון ±30 דקות',
  },
]

describe('filterReportCatalog', () => {
  it('returns all reports when the query is blank', () => {
    expect(filterReportCatalog(kinds, '  ').map((kind) => kind.id)).toEqual([
      'km_summary',
      'km_detail',
      'km_exceptions',
      'duplicate_events',
    ])
  })

  it('treats gershayim as optional so קמ matches ק״מ', () => {
    expect(filterReportCatalog(kinds, 'קמ').map((kind) => kind.id)).toEqual([
      'km_summary',
      'km_detail',
      'km_exceptions',
    ])
  })

  it('matches title or description and requires every word', () => {
    expect(filterReportCatalog(kinds, 'כפולים').map((kind) => kind.id)).toEqual([
      'duplicate_events',
    ])
    expect(filterReportCatalog(kinds, 'סיכום כונן').map((kind) => kind.id)).toEqual([
      'km_summary',
    ])
  })

  it('ranks title hits above description-only hits', () => {
    expect(filterReportCatalog(kinds, 'כונן').map((kind) => kind.id)[0]).toBe('km_summary')
  })

  it('allows a one-letter typo on words of three letters or more', () => {
    expect(filterReportCatalog(kinds, 'חריגה').map((kind) => kind.id)).toEqual([
      'km_exceptions',
    ])
  })

  it('returns none for unrelated text', () => {
    expect(filterReportCatalog(kinds, 'משמרות')).toEqual([])
  })
})
