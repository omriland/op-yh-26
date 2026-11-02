import { describe, expect, it } from 'vitest'
import type { SmartSearchFilter } from '../../supabase/functions/_shared/smartSearchFilter.ts'
import type { Interpretation } from './smartSearchApi.ts'
import { searchViewState } from './searchPageState.ts'

const find: SmartSearchFilter = { intent: 'find', entity: 'both', source: 'both', road: '531' }
const ai: Interpretation = { filter: find, lane: 'ai', logId: Promise.resolve('log-1') }
const zero = { events: 0, archive: 0, people: 0 }
const base = { query: 'אירוע בכביש 531', loading: false, error: false, interpretation: ai, counts: zero }

describe('searchViewState', () => {
  it('is idle for a blank, whitespace or punctuation-only query, whatever else is set', () => {
    expect(searchViewState({ ...base, query: '' })).toBe('idle')
    expect(searchViewState({ ...base, query: '   ' })).toBe('idle')
    expect(searchViewState({ ...base, query: '״׳.', loading: true, error: true })).toBe('idle')
  })

  it('is idle before the first search', () => {
    expect(searchViewState({ ...base, interpretation: null, counts: null })).toBe('idle')
  })

  it('is loading while a search runs', () => {
    expect(searchViewState({ ...base, loading: true, interpretation: null, counts: null })).toBe('loading')
    expect(searchViewState({ ...base, loading: true })).toBe('loading')
  })

  it('is error when the search failed', () => {
    expect(searchViewState({ ...base, error: true, counts: null })).toBe('error')
  })

  it('is too_long when the query was rejected for length', () => {
    const tooLong: Interpretation = { filter: find, lane: 'direct', logId: Promise.resolve(null), error: 'query_too_long' }
    expect(searchViewState({ ...base, query: 'א'.repeat(301), interpretation: tooLong, counts: null })).toBe(
      'too_long',
    )
  })

  it('is unsupported for an unsupported question with no counts or zero counts', () => {
    const unsupported: Interpretation = {
      filter: { ...find, intent: 'unsupported_question' },
      lane: 'ai',
      logId: Promise.resolve('log-2'),
    }
    expect(searchViewState({ ...base, interpretation: unsupported, counts: null })).toBe('unsupported')
    expect(searchViewState({ ...base, interpretation: unsupported, counts: zero })).toBe('unsupported')
  })

  it('is empty when every section returned zero rows', () => {
    expect(searchViewState(base)).toBe('empty')
  })

  it('is results when any section has rows', () => {
    expect(searchViewState({ ...base, counts: { events: 3, archive: 0, people: 0 } })).toBe('results')
    expect(searchViewState({ ...base, counts: { events: 0, archive: 7, people: 0 } })).toBe('results')
    expect(searchViewState({ ...base, counts: { events: 0, archive: 0, people: 1 } })).toBe('results')
  })

  it('shows results for the direct and fallback lanes like any other', () => {
    const counts = { events: 1, archive: 0, people: 0 }
    expect(searchViewState({ ...base, interpretation: { ...ai, lane: 'direct' }, counts })).toBe('results')
    expect(searchViewState({ ...base, interpretation: { ...ai, lane: 'fallback' }, counts })).toBe('results')
  })
})
