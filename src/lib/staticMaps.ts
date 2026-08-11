export type StaticMapParams = {
  lat: number
  lng: number
  width: number
  height: number
  zoom?: number
  scale?: 1 | 2
}

function apiKey(): string | null {
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  return typeof key === 'string' && key.trim() ? key.trim() : null
}

export function hasStaticMapsApiKey(): boolean {
  return apiKey() != null
}

export function hasEventMapCoords(
  lat: number | null | undefined,
  lng: number | null | undefined,
): lat is number {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
  )
}

/** Narrow both coords for call sites that need a typed pair. */
export function eventMapCoords(
  lat: number | null | undefined,
  lng: number | null | undefined,
): { lat: number; lng: number } | null {
  if (!hasEventMapCoords(lat, lng)) return null
  return { lat, lng: lng as number }
}

/** Google Static Maps URL for a faded letterhead pin. Returns null if key/coords missing. */
export function buildStaticMapUrl(params: StaticMapParams): string | null {
  const key = apiKey()
  if (!key) return null
  if (!hasEventMapCoords(params.lat, params.lng)) return null

  const width = Math.min(640, Math.max(1, Math.round(params.width)))
  const height = Math.min(640, Math.max(1, Math.round(params.height)))
  const zoom = params.zoom ?? 14
  const scale = params.scale ?? 2

  const url = new URL('https://maps.googleapis.com/maps/api/staticmap')
  url.searchParams.set('center', `${params.lat},${params.lng}`)
  url.searchParams.set('zoom', String(zoom))
  url.searchParams.set('size', `${width}x${height}`)
  url.searchParams.set('scale', String(scale))
  url.searchParams.set('language', 'he')
  url.searchParams.set('region', 'IL')
  url.searchParams.set('maptype', 'roadmap')
  // Keep map colors natural; fade/darken in CSS. Hide busy POI/transit chrome only.
  url.searchParams.append('style', 'feature:poi|visibility:off')
  url.searchParams.append('style', 'feature:transit|visibility:off')
  url.searchParams.set(
    'markers',
    `size:tiny|color:0xC4A574|${params.lat},${params.lng}`,
  )
  url.searchParams.set('key', key)
  return url.toString()
}
