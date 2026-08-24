export function roadNumberForGeocode(roadName: string): string | null {
  const paren = roadName.match(/\((\d+)\)/)
  if (paren?.[1]) return paren[1]
  const digits = roadName.match(/\d+/)
  return digits?.[0] ?? null
}

/** Google query: road number first, then the free-text location. */
export function eventGeocodeQuery(
  road: string | null | undefined,
  location: string | null | undefined,
): string | null {
  const roadName = road?.trim() ?? ''
  const place = location?.trim() ?? ''
  const number = roadName ? roadNumberForGeocode(roadName) : null
  const roadPart = number ? `כביש ${number}` : roadName
  if (!roadPart && !place) return null
  if (!roadPart) return place
  if (!place) return roadPart
  if (place.includes(roadPart) || place.includes(roadName)) return place
  return `${roadPart} ${place}`
}
