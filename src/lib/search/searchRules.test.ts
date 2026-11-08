import { describe, expect, it } from 'vitest'
import { parseRules } from './searchRules'

const vocab = { eventTypes: ['תאונה', 'תקוע', 'גרירה כבדה'], districts: ['צפון', 'מרכז', 'דרום'] }
// Sunday 8 Nov 2026.
const today = '2026-11-08'
const rules = (q: string, role: 'admin' | 'lead' | 'responder' = 'admin') => parseRules(q, today, vocab, role)

describe('parseRules dates', () => {
  it.each([
    ['אתמול', '2026-11-07', '2026-11-07'],
    ['שלשום', '2026-11-06', '2026-11-06'],
    ['היום', '2026-11-08', '2026-11-08'],
    ['השבוע', '2026-11-08', '2026-11-14'],
    ['בשבוע שעבר', '2026-11-01', '2026-11-07'],
    ['החודש', '2026-11-01', '2026-11-30'],
    ['בחודש שעבר', '2026-10-01', '2026-10-31'],
    ['בינואר', '2026-01-01', '2026-01-31'],
    ['בדצמבר', '2025-12-01', '2025-12-31'],
    ['בנובמבר', '2026-11-01', '2026-11-30'],
    ['במרץ 2024', '2024-03-01', '2024-03-31'],
    ['14.1', '2026-01-14', '2026-01-14'],
    ['14/12', '2025-12-14', '2025-12-14'],
    ['14.1.25', '2025-01-14', '2025-01-14'],
    ['ב-3.11', '2026-11-03', '2026-11-03'],
  ])('%s', (q, from, to) => {
    expect(rules(q)).toMatchObject({ covered: true, filter: { date_from: from, date_to: to } })
  })
  it('weeks run Sunday to Saturday on a mid-week day', () => {
    // Wednesday 11 Nov 2026.
    expect(parseRules('השבוע', '2026-11-11', vocab, 'admin').filter).toMatchObject({
      date_from: '2026-11-08',
      date_to: '2026-11-14',
    })
  })
  it('rejects an impossible date instead of rolling it over', () => {
    expect(rules('31.2').covered).toBe(false)
  })
})

describe('parseRules keys', () => {
  it('reads a road, a district and a closed-list event type, with glued prefixes', () => {
    expect(rules('תאונה בכביש 6 בצפון')).toMatchObject({
      covered: true,
      filter: { event_type: 'תאונה', road: '6', district: 'צפון', entity: 'events' },
    })
  })
  it('matches a multi-word event type whole', () => {
    expect(rules('גרירה כבדה אתמול').filter.event_type).toBe('גרירה כבדה')
  })
  it('reads a dashed plate as digits', () => {
    expect(rules('12-345-67')).toMatchObject({ covered: true, filter: { plate: '1234567' } })
  })
  it('lets filler words through without leaving leftovers', () => {
    expect(rules('כל האירועים בכביש 90 השבוע').covered).toBe(true)
  })
  it('reads the archive only for admins; for others the words are left for the model', () => {
    expect(rules('מהאתר הישן בינואר')).toMatchObject({ covered: true, filter: { source: 'archive' } })
    const lead = rules('מהאתר הישן בינואר', 'lead')
    expect(lead.covered).toBe(false)
    expect(lead.filter.source).toBe('both')
  })
})

describe('parseRules coverage', () => {
  it('leaves names and free words for the model', () => {
    expect(rules('האירועים של יוסי בצפון בחודש שעבר')).toMatchObject({
      covered: false,
      leftovers: ['של', 'יוסי'],
      filter: { district: 'צפון', date_from: '2026-10-01' },
    })
  })
  it('is not covered when nothing matched', () => {
    expect(rules('סוזוקי')).toMatchObject({ covered: false, leftovers: ['סוזוקי'] })
    expect(rules('אירועים').covered).toBe(false)
  })
})
