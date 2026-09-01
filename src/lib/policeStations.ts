export const POLICE_STATIONS_GEOJSON_URL = '/data/police-station-boundaries.geojson'

export const DEFAULT_OPS_MAP_LAYERS = {
  policeStations: false,
  milePosts: true,
} as const

export type OpsMapLayers = {
  policeStations: boolean
  milePosts: boolean
}

export type PoliceStationProps = {
  TahanaName: string
  TahanaShortName: string
  MerhavName: string
  MahozName: string
}

export type GeoJsonFeatureCollection = {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    properties: Record<string, unknown>
    geometry: { type: string; coordinates: unknown }
  }>
}

export function defaultOpsMapLayers(): OpsMapLayers {
  return { ...DEFAULT_OPS_MAP_LAYERS }
}

export function isPoliceStationProps(value: unknown): value is PoliceStationProps {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return (
    typeof row.TahanaName === 'string' &&
    typeof row.TahanaShortName === 'string' &&
    typeof row.MerhavName === 'string' &&
    typeof row.MahozName === 'string'
  )
}

export function policeStationCaption(props: PoliceStationProps): string {
  return `${props.TahanaName} · מרחב ${props.MerhavName} · מחוז ${props.MahozName}`
}

export function policeStationHoverLabel(props: PoliceStationProps): string {
  const name = props.TahanaName.trim()
  if (name.startsWith('תחנת ')) return name
  const short = props.TahanaShortName.trim()
  if (short.startsWith('תחנת ')) return short
  return `תחנת ${short || name}`
}

export function collectGeoJsonLngLat(
  coordinates: unknown,
  acc: { west: number; south: number; east: number; north: number } = {
    west: Infinity,
    south: Infinity,
    east: -Infinity,
    north: -Infinity,
  },
): { west: number; south: number; east: number; north: number } {
  if (!Array.isArray(coordinates)) return acc
  if (typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number') {
    const lng = coordinates[0]
    const lat = coordinates[1]
    acc.west = Math.min(acc.west, lng)
    acc.east = Math.max(acc.east, lng)
    acc.south = Math.min(acc.south, lat)
    acc.north = Math.max(acc.north, lat)
    return acc
  }
  for (const child of coordinates) collectGeoJsonLngLat(child, acc)
  return acc
}

/** Israel + administered territories, WGS84. */
export function coversIsraelPoliceStations(input: {
  featureCount: number
  bbox: { west: number; south: number; east: number; north: number }
  districts: string[]
}): boolean {
  const expected = ['חוף', 'דרום', 'ש"י', 'צפון', 'ירושלים', 'ת"א', 'מרכז']
  const hasDistricts = expected.every((name) => input.districts.includes(name))
  return (
    input.featureCount >= 80 &&
    hasDistricts &&
    input.bbox.west > 34 &&
    input.bbox.east < 36.2 &&
    input.bbox.south > 29.3 &&
    input.bbox.north < 33.6
  )
}

export function summarizePoliceStationGeoJson(geo: GeoJsonFeatureCollection): {
  featureCount: number
  bbox: { west: number; south: number; east: number; north: number }
  districts: string[]
  names: string[]
} {
  const bbox = { west: Infinity, south: Infinity, east: -Infinity, north: -Infinity }
  const districts = new Set<string>()
  const names: string[] = []
  for (const feature of geo.features) {
    collectGeoJsonLngLat(feature.geometry.coordinates, bbox)
    const props = feature.properties
    if (isPoliceStationProps(props)) {
      districts.add(props.MahozName)
      names.push(props.TahanaName)
    }
  }
  return {
    featureCount: geo.features.length,
    bbox,
    districts: [...districts],
    names,
  }
}
