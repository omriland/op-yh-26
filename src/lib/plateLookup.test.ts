import { describe, expect, it } from 'vitest'
import { parsePlateLookupBody, plateLookupMispar, plateLookupUrl } from './plateLookup'

describe('plateLookupMispar', () => {
  it('strips dashes and leading zeros via Number', () => {
    expect(plateLookupMispar('713-86-301')).toBe(71386301)
    expect(plateLookupMispar('01234567')).toBe(1234567)
  })
})

describe('parsePlateLookupBody', () => {
  it('reads model and color from a hit', () => {
    expect(
      parsePlateLookupBody(
        JSON.stringify({
          success: true,
          result: {
            records: [{ tzeva_rechev: 'שחור', kinuy_mishari: 'REXTON' }],
          },
        }),
      ),
    ).toEqual({ model: 'REXTON', color: 'שחור' })
  })

  it('returns null on empty records', () => {
    expect(
      parsePlateLookupBody(JSON.stringify({ success: true, result: { records: [] } })),
    ).toBeNull()
  })

  it('returns null on WAF HTML', () => {
    expect(parsePlateLookupBody('<html>blocked</html>')).toBeNull()
  })
})

describe('plateLookupUrl', () => {
  it('encodes the resource and numeric filter', () => {
    const url = plateLookupUrl('713-86-301')
    expect(url).toContain('resource_id=053cea08-09bc-40ec-8f7a-156f0677aff3')
    expect(url).toContain(encodeURIComponent('{"mispar_rechev":71386301}'))
  })
})
