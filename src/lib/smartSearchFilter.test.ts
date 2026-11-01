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
  })
})

describe('smartSearchJsonSchema', () => {
  it('builds a strict json schema listing every key and the vocab enums', () => {
    const s = smartSearchJsonSchema(vocab) as any
    expect(s.name).toBe('smart_search_filter')
    expect(s.strict).toBe(true)
    expect(s.schema.additionalProperties).toBe(false)
    expect(Object.keys(s.schema.properties).sort()).toEqual([...SMART_SEARCH_FILTER_KEYS].sort())
    expect([...s.schema.required].sort()).toEqual([...SMART_SEARCH_FILTER_KEYS].sort())
    expect(JSON.stringify(s)).toContain('פגוש קדמי')
  })
})
