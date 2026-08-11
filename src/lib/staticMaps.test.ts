import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildStaticMapUrl, hasEventMapCoords } from './staticMaps'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('hasEventMapCoords', () => {
  it('accepts finite lat/lng', () => {
    expect(hasEventMapCoords(32.1, 34.8)).toBe(true)
  })

  it('rejects nulls and non-finite', () => {
    expect(hasEventMapCoords(null, 34.8)).toBe(false)
    expect(hasEventMapCoords(32.1, null)).toBe(false)
    expect(hasEventMapCoords(Number.NaN, 34.8)).toBe(false)
  })
})

describe('buildStaticMapUrl', () => {
  it('returns null without API key', () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '')
    expect(buildStaticMapUrl({ lat: 32.1, lng: 34.8, width: 800, height: 240 })).toBeNull()
  })

  it('builds a Static Maps URL with pin and Hebrew region', () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key')
    const url = buildStaticMapUrl({ lat: 32.175, lng: 34.907, width: 1200, height: 240 })
    expect(url).toBeTruthy()
    const parsed = new URL(url!)
    expect(parsed.origin + parsed.pathname).toBe('https://maps.googleapis.com/maps/api/staticmap')
    expect(parsed.searchParams.get('center')).toBe('32.175,34.907')
    expect(parsed.searchParams.get('size')).toBe('640x240')
    expect(parsed.searchParams.get('language')).toBe('he')
    expect(parsed.searchParams.get('region')).toBe('IL')
    expect(parsed.searchParams.get('markers')).toBe('size:tiny|color:0xC4A574|32.175,34.907')
    expect(parsed.searchParams.get('key')).toBe('test-key')
  })
})
