/** Single system שלוחה that unlocks Places-assisted מיקום. */
export const SYSTEM_DISTRICT_CODES = ['station_other_duplicated'] as const

export type SystemDistrictCode = (typeof SYSTEM_DISTRICT_CODES)[number]

export const SYSTEM_DISTRICT_NAMES: Record<SystemDistrictCode, string> = {
  station_other_duplicated: 'תחנה / אחר / משוכפל',
}

export type LocationPlaceFields = {
  location: string
  location_place_id: string | null
  location_lat: number | null
  location_lng: number | null
}

export function isSystemDistrictCode(code: string | null | undefined): code is SystemDistrictCode {
  return code != null && (SYSTEM_DISTRICT_CODES as readonly string[]).includes(code)
}

export function emptyLocationPlaceFields(): LocationPlaceFields {
  return {
    location: '',
    location_place_id: null,
    location_lat: null,
    location_lng: null,
  }
}

/** Clear when entering or leaving the system שלוחה. */
export function shouldClearLocationOnDistrictChange(
  previousCode: string | null | undefined,
  nextCode: string | null | undefined,
): boolean {
  if (previousCode === nextCode) return false
  return isSystemDistrictCode(previousCode) || isSystemDistrictCode(nextCode)
}

export function districtCodeById(
  districts: { id: string; code?: string | null }[],
  districtId: string,
): string | null {
  if (!districtId) return null
  return districts.find((row) => row.id === districtId)?.code ?? null
}

export function districtNeedsPlacesLocation(
  districts: { id: string; code?: string | null }[],
  districtId: string,
): boolean {
  return isSystemDistrictCode(districtCodeById(districts, districtId))
}

/** Optional תחנה name — same system שלוחה as Places מיקום (תחנה / אחר / משוכפל). */
export function districtNeedsStation(
  districts: { id: string; code?: string | null }[],
  districtId: string,
): boolean {
  return districtNeedsPlacesLocation(districts, districtId)
}

/** Urban street-address road — live name is `עירוני`; legacy was `עירוני (101)`. */
export function isUrbanRoadName(name: string | null | undefined): boolean {
  return Boolean(name?.includes('עירוני'))
}

export function roadNeedsPlacesLocation(
  roads: { id: string; name: string }[],
  roadId: string,
): boolean {
  if (!roadId) return false
  return isUrbanRoadName(roads.find((row) => row.id === roadId)?.name)
}

export function needsPlacesLocation(
  districts: { id: string; code?: string | null }[],
  districtId: string,
  roads: { id: string; name: string }[] = [],
  roadId = '',
): boolean {
  return (
    districtNeedsPlacesLocation(districts, districtId) || roadNeedsPlacesLocation(roads, roadId)
  )
}

export function applyDistrictChangeLocation(
  previousCode: string | null | undefined,
  nextCode: string | null | undefined,
  current: LocationPlaceFields,
): LocationPlaceFields {
  if (shouldClearLocationOnDistrictChange(previousCode, nextCode)) {
    return emptyLocationPlaceFields()
  }
  return current
}

/** Urban road: `עירוני`, or the legacy `עירוני (101)` name. */
export function defaultRoadIdForSystemDistrict(
  roads: { id: string; name: string }[],
): string | null {
  return (
    roads.find((road) => isUrbanRoadName(road.name))?.id ??
    roads.find((road) => road.name.includes('101'))?.id ??
    null
  )
}

/** When entering the system שלוחה, default כביש to the urban road (still editable). */
export function applyDistrictChangeRoad(
  previousCode: string | null | undefined,
  nextCode: string | null | undefined,
  currentRoadId: string,
  roads: { id: string; name: string }[],
): string {
  const enteringSystem =
    !isSystemDistrictCode(previousCode) && isSystemDistrictCode(nextCode)
  if (!enteringSystem) return currentRoadId
  return defaultRoadIdForSystemDistrict(roads) ?? currentRoadId
}

export const LOCATION_REQUIRED_ERROR = 'יש לבחור או להזין מיקום.'

export function isSystemClosedListItem(item: { code?: string | null } | null | undefined): boolean {
  return isSystemDistrictCode(item?.code)
}

export const SYSTEM_DISTRICT_LOCKED_ERROR = 'פריט מערכת — לא ניתן לערוך או למחוק.'
