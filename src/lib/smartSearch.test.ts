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
  it('keeps plates and police IDs direct', () => {
    expect(isDirectQuery('1234567')).toBe(true)
    expect(isDirectQuery(' 12-345-67 ')).toBe(true)
    expect(isDirectQuery('123-45-678')).toBe(true)
  })
  it('sends numeric dates to the AI lane', () => {
    for (const q of ['14.1', '14/1', '14/1/26', '14.1.26', '14.01.2026', ' 1/12/2026 ']) {
      expect(isDirectQuery(q), q).toBe(false)
    }
  })
  it('builds a both/both text filter', () => {
    expect(directFilter(' 4471 ')).toEqual({ ...base, text: '4471' })
  })
})

describe('chipsForFilter people keys', () => {
  it('renders volunteer status, shift coverage and people-only', () => {
    expect(
      chipsForFilter({
        ...base,
        entity: 'people',
        volunteer_status: 'active_volunteer',
        no_shift_from: '2026-11-08',
        no_shift_to: '2026-11-14',
      }).map((c) => [c.key, c.label]),
    ).toEqual([
      ['volunteer_status', 'מעמד: מתנדב פעיל'],
      ['no_shift', 'בלי משמרת: 08.11.2026–14.11.2026'],
      ['entity', 'אנשים בלבד'],
    ])
  })
  it('removing the person chip drops the resolved people too', () => {
    expect(removeChip({ ...base, person: 'יוסי', person_ids: ['x'], person_callsigns: ['1'] }, 'person')).toEqual(base)
    expect(removeChip({ ...base, no_shift_from: 'a', no_shift_to: 'b' }, 'no_shift')).toEqual(base)
  })
})

describe('chipsForFilter', () => {
  it('renders road and a date range', () => {
    expect(chipsForFilter({ ...base, road: '531', date_from: '2026-10-25', date_to: '2026-10-31' })).toEqual([
      { key: 'road', label: 'כביש 531', numeric: true },
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
    expect(chipsForFilter({ ...base, person: 'דני', person_role: 'any' })[0].label).toBe('אדם: דני')
    expect(chipsForFilter({ ...base, plate: '76543' })[0].label).toBe('לוחית 76-543')
    expect(chipsForFilter({ ...base, status: 'draft' })[0].label).toBe('סטטוס: טיוטה')
    expect(chipsForFilter({ ...base, status: 'in_progress' })[0].label).toBe('סטטוס: ממתין למתנדב')
    expect(chipsForFilter({ ...base, status: 'draft' }, 'responder')).toEqual([])
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
