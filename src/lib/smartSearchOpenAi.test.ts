import { describe, expect, it } from 'vitest'
import {
  openAiRequestBody,
  parseOpenAiFilter,
} from '../../supabase/functions/_shared/smartSearchOpenAi'

const vocab = { eventTypes: ['תאונה'], districts: ['מרכז'], hitTypes: ['גג'] }
const reply = (message: unknown) => ({ choices: [{ message }] })

describe('openAiRequestBody', () => {
  it('asks for strict JSON schema output at temperature 0 with a token cap', () => {
    const schema = { name: 'smart_search_filter', strict: true, schema: {} }
    const messages = [{ role: 'user', content: 'x' }]
    expect(openAiRequestBody('m1', messages, schema)).toEqual({
      model: 'm1',
      messages,
      temperature: 0,
      max_completion_tokens: 300,
      response_format: { type: 'json_schema', json_schema: schema },
    })
  })
})

describe('parseOpenAiFilter', () => {
  it('returns a validated filter from choices[0].message.content', () => {
    const f = parseOpenAiFilter(reply({ content: JSON.stringify({ road: '4', district: 'מרכז' }) }), vocab)
    expect(f?.road).toBe('4')
    expect(f?.district).toBe('מרכז')
  })
  it('returns null on a refusal', () => {
    expect(parseOpenAiFilter(reply({ content: null, refusal: 'no' }), vocab)).toBeNull()
  })
  it('returns null on missing content or malformed response', () => {
    expect(parseOpenAiFilter(reply({}), vocab)).toBeNull()
    expect(parseOpenAiFilter({}, vocab)).toBeNull()
    expect(parseOpenAiFilter(null, vocab)).toBeNull()
  })
  it('returns null on invalid JSON', () => {
    expect(parseOpenAiFilter(reply({ content: '{nope' }), vocab)).toBeNull()
  })
})
