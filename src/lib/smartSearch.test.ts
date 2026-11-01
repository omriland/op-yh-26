import { describe, expect, it } from 'vitest'
import type { SmartSearchFilter } from '../../supabase/functions/_shared/smartSearchFilter.ts'
import {
  chipsForFilter,
  directFilter,
  isBlankQuery,
  isDirectQuery,
  removeChip,
  sectionOrder,
} from './smartSearch.ts'

const base: SmartSearchFilter = { intent: 'find', entity: 'both', source: 'both' }

describe('isBlankQuery', () => {
  it('treats whitespace and punctuation only as blank', () => {
    expect(isBlankQuery('  ״׳. ')).toBe(true)
    expect(isBlankQuery('')).toBe(true)
    expect(isBlankQuery('"\'.')).toBe(true)
    expect(isBlankQuery('־ “” ‘’ …')).toBe(true)
    expect(isBlankQuery('*+#@&%=|~<>$^')).toBe(true)
    expect(isBlankQuery('\u200F\u200E\u200B')).toBe(true)
    expect(isBlankQuery('כביש 6.')).toBe(false)
    expect(isBlankQuery('כביש')).toBe(false)
    expect(isBlankQuery(' 5 ')).toBe(false)
  })
})

describe('isDirectQuery / directFilter', () => {
  it('detects digit-only queries', () => {
    expect(isDirectQuery('12-345-67')).toBe(true)
    expect(isDirectQuery('4471')).toBe(true)
    expect(isDirectQuery('כביש 531')).toBe(false)
  })
  it('builds a both/both text filter', () => {
    expect(directFilter(' 4471 ')).toEqual({ ...base, text: '4471' })
  })
})

describe('chipsForFilter', () => {
  it('renders road and a date range', () => {
    expect(chipsForFilter({ ...base, road: '531', date_from: '2026-10-25', date_to: '2026-10-31' })).toEqual([
      { key: 'road', label: 'כביש 531', numeric: false },
      { key: 'dates', label: '25.10.2026–31.10.2026', numeric: true },
    ])
  })
  it('renders single and equal dates', () => {
    expect(chipsForFilter({ ...base, date_from: '2026-10-25' })[0].label).toBe('מ־25.10.2026')
    expect(chipsForFilter({ ...base, date_to: '2026-10-25' })[0].label).toBe('עד 25.10.2026')
    expect(chipsForFilter({ ...base, date_from: '2026-10-25', date_to: '2026-10-25' })[0].label).toBe('25.10.2026')
  })
  it('renders flags and source', () => {
    expect(chipsForFilter({ ...base, damaged: true }).map((c) => c.label)).toEqual(['עם נזק'])
    expect(chipsForFilter({ ...base, source: 'archive' }).map((c) => c.label)).toEqual(['ארכיון בלבד'])
    expect(chipsForFilter({ ...base, source: 'new' }).map((c) => c.label)).toEqual(['אירועים חדשים בלבד'])
    expect(chipsForFilter({ ...base, include_cancelled: true }).map((c) => c.label)).toEqual(['כולל מבוטלים'])
  })
  it('renders text, person, plate, status, damage location', () => {
    expect(chipsForFilter({ ...base, text: 'שפך' })[0].label).toBe('״שפך״')
    expect(chipsForFilter({ ...base, person: 'דני', person_role: 'lead' })[0].label).toBe('אחמ״ש: דני')
    expect(chipsForFilter({ ...base, person: 'דני', person_role: 'responder' })[0].label).toBe('כונן: דני')
    expect(chipsForFilter({ ...base, person: 'דני', person_role: 'any' })[0].label).toBe('דני')
    expect(chipsForFilter({ ...base, plate: '76543' })[0].label).toBe('לוחית 76-543')
    expect(chipsForFilter({ ...base, status: 'draft' })[0].label).toBe('אירוע בהזנה')
    expect(chipsForFilter({ ...base, damage_location: 'פגוש' })[0].label).toBe('נזק: פגוש')
    expect(chipsForFilter({ ...base, police_event_id: '99' })[0].label).toBe('אירוע 99')
  })
  it('has no chips for a bare filter', () => {
    expect(chipsForFilter(base)).toEqual([])
  })
})

describe('removeChip', () => {
  it('removes both dates for the dates chip', () => {
    expect(removeChip({ ...base, date_from: 'a', date_to: 'b', road: '6' }, 'dates')).toEqual({ ...base, road: '6' })
  })
  it('resets source to both', () => {
    expect(removeChip({ ...base, source: 'archive' }, 'source')).toEqual(base)
  })
  it('removes person together with its role', () => {
    expect(removeChip({ ...base, person: 'x', person_role: 'lead' }, 'person')).toEqual(base)
  })
})

describe('sectionOrder', () => {
  it('puts events first by default', () => {
    expect(sectionOrder(base, '2026-08-09')).toEqual(['events', 'archive', 'people'])
  })
  it('puts archive first when date_to precedes the first new event', () => {
    expect(sectionOrder({ ...base, date_to: '2026-01-31' }, '2026-08-09')).toEqual(['archive', 'events', 'people'])
  })
  it('keeps events first when date_to is not earlier or unknown', () => {
    expect(sectionOrder({ ...base, date_to: '2026-09-01' }, '2026-08-09')[0]).toBe('events')
    expect(sectionOrder({ ...base, date_to: '2026-01-31' }, null)[0]).toBe('events')
  })
  it('narrows by entity and source', () => {
    expect(sectionOrder({ ...base, entity: 'people' }, null)).toEqual(['people'])
    expect(sectionOrder({ ...base, entity: 'events', source: 'archive' }, null)).toEqual(['archive'])
    expect(sectionOrder({ ...base, entity: 'events', source: 'new' }, null)).toEqual(['events'])
  })
})
