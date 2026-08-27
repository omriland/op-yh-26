import { describe, expect, it } from 'vitest'
import { OPS_MAP_BASE_STYLES } from './googleMaps'

describe('OPS_MAP_BASE_STYLES', () => {
  it('hides Google POI and transit so shops and attractions are not on the ops map', () => {
    expect(OPS_MAP_BASE_STYLES.map((row) => row.featureType)).toEqual([
      'poi',
      'poi.business',
      'poi.attraction',
      'transit',
    ])
    expect(OPS_MAP_BASE_STYLES.every((row) => row.stylers[0]?.visibility === 'off')).toBe(true)
  })
})
