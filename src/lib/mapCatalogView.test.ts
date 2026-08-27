import { describe, expect, it } from 'vitest'
import {
  CATALOG_CLUSTER_MAX_ZOOM,
  catalogViewForViewport,
  padBbox,
  pointInBbox,
  shouldClusterCatalog,
  zoomAfterCatalogClusterClick,
  type LatLngBbox,
} from './mapCatalogView'
import type { MapPin } from './userAddresses'

const box: LatLngBbox = { south: 32, west: 34.7, north: 32.2, east: 35 }

function pin(id: string, lat: number, lng: number): MapPin {
  return {
    userId: id,
    fullName: id,
    callsign: id,
    kind: 'home',
    name: 'בית',
    label: `${id} · בית`,
    formattedAddress: 'x',
    lat,
    lng,
    volunteerStatus: 'active_volunteer',
    availability: 'available',
    availableFrom: null,
  }
}

describe('padBbox', () => {
  it('grows each side by 25% of the span', () => {
    expect(padBbox(box, 0.25)).toEqual({
      south: 31.95,
      west: 34.625,
      north: 32.25,
      east: 35.075,
    })
  })
})

describe('pointInBbox', () => {
  it('includes the edges', () => {
    expect(pointInBbox(32, 34.7, box)).toBe(true)
    expect(pointInBbox(32.2, 35, box)).toBe(true)
    expect(pointInBbox(31.9, 34.7, box)).toBe(false)
  })
})

describe('shouldClusterCatalog', () => {
  it('clusters at zoom 10 and below, not at 11', () => {
    expect(CATALOG_CLUSTER_MAX_ZOOM).toBe(10)
    expect(shouldClusterCatalog(8)).toBe(true)
    expect(shouldClusterCatalog(10)).toBe(true)
    expect(shouldClusterCatalog(11)).toBe(false)
  })
})

describe('zoomAfterCatalogClusterClick', () => {
  it('lands at least at 11 so addresses uncluster', () => {
    expect(zoomAfterCatalogClusterClick(8)).toBe(11)
    expect(zoomAfterCatalogClusterClick(10)).toBe(12)
    expect(zoomAfterCatalogClusterClick(11)).toBe(13)
  })
})

describe('catalogViewForViewport', () => {
  it('returns in-view points when zoomed in', () => {
    const view = catalogViewForViewport(
      [pin('a', 32.1, 34.8), pin('b', 33, 35.5)],
      box,
      14,
    )
    expect(view.clusters).toEqual([])
    expect(view.points.map((row) => row.userId)).toEqual(['a'])
  })

  it('clusters nearby pins when zoomed out and keeps a lone pin as a point', () => {
    const view = catalogViewForViewport(
      [
        pin('a', 32.10, 34.80),
        pin('b', 32.101, 34.801),
        pin('c', 32.18, 34.95),
      ],
      box,
      8,
    )
    expect(view.points.length + view.clusters.reduce((n, c) => n + c.count, 0)).toBe(3)
    expect(view.clusters.some((c) => c.count >= 2) || view.points.length === 1).toBe(true)
  })
})
