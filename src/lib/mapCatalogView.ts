import type { MapPin } from './userAddresses'

export const CATALOG_CLUSTER_MAX_ZOOM = 10
export const VIEWPORT_PAD = 0.25

export type LatLngBbox = {
  south: number
  west: number
  north: number
  east: number
}

export type CatalogCluster = {
  key: string
  lat: number
  lng: number
  count: number
}

export function padBbox(bbox: LatLngBbox, pad = VIEWPORT_PAD): LatLngBbox {
  const latSpan = bbox.north - bbox.south
  const lngSpan = bbox.east - bbox.west
  return {
    south: bbox.south - latSpan * pad,
    west: bbox.west - lngSpan * pad,
    north: bbox.north + latSpan * pad,
    east: bbox.east + lngSpan * pad,
  }
}

export function pointInBbox(lat: number, lng: number, bbox: LatLngBbox): boolean {
  return lat >= bbox.south && lat <= bbox.north && lng >= bbox.west && lng <= bbox.east
}

export function shouldClusterCatalog(zoom: number): boolean {
  return zoom <= CATALOG_CLUSTER_MAX_ZOOM
}

/** Cluster tap must leave the clustered zoom band. */
export function zoomAfterCatalogClusterClick(currentZoom: number): number {
  return Math.max(CATALOG_CLUSTER_MAX_ZOOM + 1, currentZoom + 2)
}

export function catalogCellDegrees(zoom: number): number {
  return (360 / 256 / 2 ** zoom) * 64
}

export function catalogViewForViewport(
  pins: readonly MapPin[],
  bbox: LatLngBbox,
  zoom: number,
): { clusters: CatalogCluster[]; points: MapPin[] } {
  const padded = padBbox(bbox)
  const inView = pins.filter((pin) => pointInBbox(pin.lat, pin.lng, padded))
  if (!shouldClusterCatalog(zoom)) {
    return { clusters: [], points: [...inView] }
  }
  const cell = catalogCellDegrees(zoom)
  const buckets = new Map<string, MapPin[]>()
  for (const pin of inView) {
    const key = `${Math.floor(pin.lat / cell)}:${Math.floor(pin.lng / cell)}`
    const group = buckets.get(key)
    if (group) group.push(pin)
    else buckets.set(key, [pin])
  }
  const clusters: CatalogCluster[] = []
  const points: MapPin[] = []
  for (const [key, group] of buckets) {
    if (group.length === 1) {
      points.push(group[0]!)
      continue
    }
    clusters.push({
      key,
      count: group.length,
      lat: group.reduce((sum, row) => sum + row.lat, 0) / group.length,
      lng: group.reduce((sum, row) => sum + row.lng, 0) / group.length,
    })
  }
  return { clusters, points }
}

export const ISRAEL_VIEW_BBOX: LatLngBbox = {
  south: 29.4,
  west: 34.2,
  north: 33.4,
  east: 35.9,
}

function roundCoord(value: number): number {
  return Math.round(value * 10_000) / 10_000
}

export function roundBbox(bbox: LatLngBbox): LatLngBbox {
  return {
    south: roundCoord(bbox.south),
    west: roundCoord(bbox.west),
    north: roundCoord(bbox.north),
    east: roundCoord(bbox.east),
  }
}

export function bboxFromGoogleMap(map: {
  getBounds?: () => {
    getSouthWest: () => { lat: () => number; lng: () => number }
    getNorthEast: () => { lat: () => number; lng: () => number }
  } | undefined
  getZoom?: () => number
}): { bbox: LatLngBbox; zoom: number } | null {
  const bounds = map.getBounds?.()
  const zoom = map.getZoom?.()
  if (!bounds || zoom == null || !Number.isFinite(zoom)) return null
  const sw = bounds.getSouthWest()
  const ne = bounds.getNorthEast()
  return {
    bbox: roundBbox({
      south: sw.lat(),
      west: sw.lng(),
      north: ne.lat(),
      east: ne.lng(),
    }),
    zoom,
  }
}

export function sameViewport(
  a: { bbox: LatLngBbox; zoom: number },
  b: { bbox: LatLngBbox; zoom: number },
): boolean {
  return (
    a.zoom === b.zoom &&
    a.bbox.south === b.bbox.south &&
    a.bbox.west === b.bbox.west &&
    a.bbox.north === b.bbox.north &&
    a.bbox.east === b.bbox.east
  )
}
