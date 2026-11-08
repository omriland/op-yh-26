import { describe, expect, it } from 'vitest'
import {
  SMART_SEARCH_MODEL,
  claudeRequestBody,
  parseClaudeFilter,
} from '../../supabase/functions/_shared/smartSearchClaude'

const vocab = { eventTypes: ['תאונה'], districts: ['מרכז'], hitTypes: ['גג'] }
const text = (t: string, stop_reason = 'end_turn') => ({ stop_reason, content: [{ type: 'text', text: t }] })

describe('claudeRequestBody', () => {
  const body = claudeRequestBody({ system: 'S', user: 'U' }, { type: 'object' })

  it('asks Haiku 5.5 for schema-bound JSON with thinking off and low effort', () => {
    expect(SMART_SEARCH_MODEL).toBe('claude-haiku-5-5')
    expect(body).toEqual({
      model: 'claude-haiku-5-5',
      max_tokens: 400,
      thinking: { type: 'disabled' },
      output_config: { effort: 'low', format: { type: 'json_schema', schema: { type: 'object' } } },
      system: 'S',
      messages: [{ role: 'user', content: 'U' }],
    })
  })
  it('sends no sampling parameters, which Haiku 5.5 rejects', () => {
    for (const key of ['temperature', 'top_p', 'top_k']) expect(body).not.toHaveProperty(key)
  })
})

describe('parseClaudeFilter', () => {
  it('returns a validated filter from the text block', () => {
    const r = parseClaudeFilter(text(JSON.stringify({ road: '4', district: 'מרכז', event_type: 'שריפה' })), vocab)
    expect(r).toEqual({ filter: { intent: 'find', entity: 'both', source: 'both', road: '4', district: 'מרכז' } })
  })
  it('reads text after a thinking block', () => {
    const r = parseClaudeFilter(
      { stop_reason: 'end_turn', content: [{ type: 'thinking' }, { type: 'text', text: '{"road":"6"}' }] },
      vocab,
    )
    expect('filter' in r && r.filter.road).toBe('6')
  })
  it('reports a refusal before reading content', () => {
    expect(parseClaudeFilter(text('{"road":"6"}', 'refusal'), vocab)).toEqual({ error: 'refusal' })
  })
  it('treats a cut-off answer, no text and broken JSON as invalid output', () => {
    expect(parseClaudeFilter(text('{"road":', 'max_tokens'), vocab)).toEqual({ error: 'invalid_output' })
    expect(parseClaudeFilter({ stop_reason: 'end_turn', content: [] }, vocab)).toEqual({ error: 'invalid_output' })
    expect(parseClaudeFilter(text('{nope'), vocab)).toEqual({ error: 'invalid_output' })
    expect(parseClaudeFilter(null, vocab)).toEqual({ error: 'invalid_output' })
  })
  it('never lets the model set person_ids or person_callsigns', () => {
    const r = parseClaudeFilter(
      text(JSON.stringify({ person_ids: ['11111111-1111-4111-8111-111111111111'], person_callsigns: ['1'] })),
      vocab,
    )
    expect('filter' in r && r.filter).toEqual({ intent: 'find', entity: 'both', source: 'both' })
  })
})
