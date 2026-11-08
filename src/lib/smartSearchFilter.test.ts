import { describe, expect, it } from 'vitest'
import {
  SMART_SEARCH_FILTER_KEYS,
  smartSearchJsonSchema,
  validateSmartSearchFilter,
} from '../../supabase/functions/_shared/smartSearchFilter'

const vocab = { eventTypes: ['חילוץ', 'גרירה'], districts: ['מרכז'], hitTypes: ['פגוש קדמי', 'דלת נהג'] }
const base = { intent: 'find', entity: 'both', source: 'both' }

describe('validateSmartSearchFilter', () => {
  it('fills defaults for an empty object', () => {
    expect(validateSmartSearchFilter({}, vocab)).toEqual(base)
  })
  it('treats non-objects as empty', () => {
    expect(validateSmartSearchFilter(null, vocab)).toEqual(base)
  })
  it('drops unknown keys', () => {
    expect(validateSmartSearchFilter({ road: '531', sql: 'drop' }, vocab)).toEqual({ ...base, road: '531' })
  })
  it('treats null as absent', () => {
    expect(validateSmartSearchFilter({ road: null, damaged: null, status: null }, vocab)).toEqual(base)
  })
  it('swaps a reversed date range', () => {
    const f = validateSmartSearchFilter({ date_from: '2026-10-31', date_to: '2026-10-25' }, vocab)
    expect([f.date_from, f.date_to]).toEqual(['2026-10-25', '2026-10-31'])
  })
  it('drops an impossible date and keeps the rest', () => {
    const f = validateSmartSearchFilter({ date_from: '2026-02-30', road: '6' }, vocab)
    expect(f.date_from).toBeUndefined()
    expect(f.road).toBe('6')
  })
  it('keeps vocab values and drops event_type, district and damage_location outside the vocab', () => {
    expect(validateSmartSearchFilter({ event_type: 'חילוץ', damage_location: 'דלת נהג' }, vocab))
      .toEqual({ ...base, event_type: 'חילוץ', damage_location: 'דלת נהג' })
    expect(validateSmartSearchFilter({ event_type: 'שריפה', district: 'צפון', damage_location: 'גג' }, vocab)).toEqual(base)
  })
  it('keeps only digits in plate and drops it when fewer than 3 remain', () => {
    expect(validateSmartSearchFilter({ plate: '12-345-67' }, vocab).plate).toBe('1234567')
    expect(validateSmartSearchFilter({ plate: 'א1' }, vocab).plate).toBeUndefined()
  })
  it('trims strings, drops empty strings and caps each at 100 chars', () => {
    const f = validateSmartSearchFilter({ person: '  דני ', text: '   ', location_text: 'א'.repeat(150) }, vocab)
    expect(f.person).toBe('דני')
    expect(f.text).toBeUndefined()
    expect(f.location_text).toHaveLength(100)
  })
  it('drops enum values outside their set and keeps valid ones', () => {
    expect(validateSmartSearchFilter({ intent: 'delete', status: 'closed' }, vocab)).toEqual(base)
    expect(validateSmartSearchFilter({ intent: 'export', status: 'done', person_role: 'lead' }, vocab))
      .toEqual({ ...base, intent: 'export', status: 'done', person_role: 'lead' })
  })
  it('keeps booleans and drops non-booleans', () => {
    expect(validateSmartSearchFilter({ damaged: true, include_cancelled: 'yes' }, vocab)).toEqual({ ...base, damaged: true })
    expect(validateSmartSearchFilter({ damaged: false }, vocab)).toEqual(base)
  })
})

describe('new keys', () => {
  it('keeps volunteer_status in its closed list', () => {
    expect(validateSmartSearchFilter({ volunteer_status: 'phone_training' }, vocab).volunteer_status).toBe('phone_training')
    expect(validateSmartSearchFilter({ volunteer_status: 'boss' }, vocab).volunteer_status).toBeUndefined()
  })
  it('makes one shift-coverage day from a single end and orders a reversed range', () => {
    expect(validateSmartSearchFilter({ no_shift_from: '2026-11-08' }, vocab)).toMatchObject({
      no_shift_from: '2026-11-08',
      no_shift_to: '2026-11-08',
    })
    expect(validateSmartSearchFilter({ no_shift_from: '2026-11-14', no_shift_to: '2026-11-08' }, vocab)).toMatchObject({
      no_shift_from: '2026-11-08',
      no_shift_to: '2026-11-14',
    })
  })
  it('keeps only uuids in person_ids, without duplicates', () => {
    const id = '11111111-1111-4111-8111-111111111111'
    expect(validateSmartSearchFilter({ person_ids: [id, id, 'x', 3, "1' or 1=1"] }, vocab).person_ids).toEqual([id])
    expect(validateSmartSearchFilter({ person_ids: 'x' }, vocab).person_ids).toBeUndefined()
  })
  it('trims call signs and drops empty ones', () => {
    expect(validateSmartSearchFilter({ person_callsigns: [' 411 ', '', 7] }, vocab).person_callsigns).toEqual(['411'])
  })
})

/** Parameters Claude counts as union-typed: anyOf/oneOf, or a type array. */
function unionParams(schema: any): number {
  let n = 0
  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node.anyOf) || Array.isArray(node.oneOf) || Array.isArray(node.type)) n++
    for (const value of Object.values(node.properties ?? {})) walk(value)
    if (node.items) walk(node.items)
    for (const branch of [...(node.anyOf ?? []), ...(node.oneOf ?? [])]) walk(branch)
  }
  walk(schema)
  return n
}

describe('smartSearchJsonSchema', () => {
  const big = {
    eventTypes: Array.from({ length: 30 }, (_, i) => `סוג ${i}`),
    districts: ['צפון', 'מרכז', 'דרום'],
    hitTypes: ['גג'],
  }

  it('stays within the structured-output limit of 16 union-typed parameters', () => {
    expect(unionParams(smartSearchJsonSchema(vocab))).toBeLessThanOrEqual(16)
    expect(unionParams(smartSearchJsonSchema(big))).toBeLessThanOrEqual(16)
  })
  it('uses no unions at all: an unused key is "" or false, never null', () => {
    expect(unionParams(smartSearchJsonSchema(big))).toBe(0)
    expect(JSON.stringify(smartSearchJsonSchema(big))).not.toContain('"null"')
  })
  it('requires every parser key, so no key is optional (optional keys made the schema "too complex")', () => {
    const s = smartSearchJsonSchema(vocab) as any
    expect(s.type).toBe('object')
    expect(s.additionalProperties).toBe(false)
    expect(Object.keys(s.properties).sort()).toEqual([...SMART_SEARCH_FILTER_KEYS].sort())
    expect([...s.required].sort()).toEqual([...SMART_SEARCH_FILTER_KEYS].sort())
    expect(JSON.stringify(s)).toContain('פגוש קדמי')
    expect(s.properties).not.toHaveProperty('person_ids')
  })
  it('gives every closed list "" as its empty value, so an empty list is still a valid enum', () => {
    const s = smartSearchJsonSchema({ ...vocab, districts: [] }) as any
    expect(s.properties.district).toEqual({ type: 'string', enum: [''] })
    expect(s.properties.event_type.enum[0]).toBe('')
  })
  it('has no numeric or length constraints structured outputs would reject', () => {
    expect(JSON.stringify(smartSearchJsonSchema(vocab))).not.toMatch(/minLength|maxLength|minimum|maximum|pattern/)
  })
  it('reads the empty values "" and false as absent', () => {
    const empty = Object.fromEntries(SMART_SEARCH_FILTER_KEYS.map((k) => [k, '']))
    const reply = { ...empty, intent: 'find', entity: 'events', source: 'both', road: '6', damaged: false, include_cancelled: false }
    expect(validateSmartSearchFilter(reply, vocab)).toEqual({ intent: 'find', entity: 'events', source: 'both', road: '6' })
  })
})
