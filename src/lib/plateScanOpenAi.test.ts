import { describe, expect, it } from 'vitest'
import {
  PLATE_SCAN_MAX_PLATES,
  bytesToBase64,
  cleanScannedPlates,
  parsePlateScanResponse,
  plateScanJsonSchema,
  plateScanRequestBody,
} from '../../supabase/functions/_shared/plateScan'

const reply = (content: unknown) => ({ choices: [{ message: { content } }] })

describe('plateScanRequestBody', () => {
  it('sends the photo as a high-detail image with strict JSON output', () => {
    const body = plateScanRequestBody('m1', 'data:image/jpeg;base64,AAA') as {
      model: string
      temperature: number
      response_format: unknown
      messages: { role: string; content: { type: string; image_url?: unknown }[] }[]
    }
    expect(body.model).toBe('m1')
    expect(body.temperature).toBe(0)
    expect(body.response_format).toEqual({ type: 'json_schema', json_schema: plateScanJsonSchema })
    const image = body.messages[0].content.find((part) => part.type === 'image_url')
    expect(image?.image_url).toEqual({ url: 'data:image/jpeg;base64,AAA', detail: 'high' })
  })
})

describe('cleanScannedPlates', () => {
  it('strips dashes, drops bad lengths and duplicates', () => {
    expect(cleanScannedPlates(['12-345-67', '1234', '123456789', '1234567', 'abc', 7, '987-65-432']))
      .toEqual(['1234567', '98765432'])
  })
  it('caps the list', () => {
    const many = Array.from({ length: 10 }, (_, index) => `1234${500 + index}`)
    expect(cleanScannedPlates(many)).toHaveLength(PLATE_SCAN_MAX_PLATES)
  })
  it('returns [] for a non-array', () => {
    expect(cleanScannedPlates('1234567')).toEqual([])
  })
})

describe('parsePlateScanResponse', () => {
  it('reads plates from choices[0].message.content', () => {
    expect(parsePlateScanResponse(reply(JSON.stringify({ plates: ['12-345-67'] })))).toEqual([
      '1234567',
    ])
  })
  it('returns [] on refusal, empty or broken JSON', () => {
    expect(parsePlateScanResponse(reply(null))).toEqual([])
    expect(parsePlateScanResponse(reply(''))).toEqual([])
    expect(parsePlateScanResponse(reply('{not json'))).toEqual([])
    expect(parsePlateScanResponse(null)).toEqual([])
  })
})

describe('bytesToBase64', () => {
  it('matches Buffer base64, including past one chunk', () => {
    const bytes = new Uint8Array(70000).map((_, index) => index % 256)
    expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'))
  })
})
