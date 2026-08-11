export type PlacePrediction = {
  placeId: string
  primaryText: string
  secondaryText: string
}

export type PlaceDetails = {
  placeId: string
  label: string
  lat: number
  lng: number
}

const AUTOCOMPLETE_URL = 'https://places.googleapis.com/v1/places:autocomplete'

function apiKey(): string | null {
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  return typeof key === 'string' && key.trim() ? key.trim() : null
}

export function hasGoogleMapsApiKey(): boolean {
  return apiKey() != null
}

type AutocompleteResponse = {
  suggestions?: Array<{
    placePrediction?: {
      placeId?: string
      text?: { text?: string }
      structuredFormat?: {
        mainText?: { text?: string }
        secondaryText?: { text?: string }
      }
    }
  }>
}

export async function fetchPlacePredictions(
  input: string,
  sessionToken?: string,
): Promise<{ ok: true; predictions: PlacePrediction[] } | { ok: false; error: string }> {
  const key = apiKey()
  if (!key) return { ok: false, error: 'missing_key' }
  const trimmed = input.trim()
  if (!trimmed) return { ok: true, predictions: [] }

  try {
    const response = await fetch(AUTOCOMPLETE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask':
          'suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat',
      },
      body: JSON.stringify({
        input: trimmed,
        languageCode: 'he',
        regionCode: 'IL',
        includedRegionCodes: ['il'],
        ...(sessionToken ? { sessionToken } : {}),
      }),
    })

    if (!response.ok) {
      return { ok: false, error: `http_${response.status}` }
    }

    const data = (await response.json()) as AutocompleteResponse
    const predictions: PlacePrediction[] = []
    for (const suggestion of data.suggestions ?? []) {
      const place = suggestion.placePrediction
      if (!place?.placeId) continue
      const primary =
        place.structuredFormat?.mainText?.text?.trim() ||
        place.text?.text?.trim() ||
        place.placeId
      const secondary = place.structuredFormat?.secondaryText?.text?.trim() ?? ''
      predictions.push({
        placeId: place.placeId,
        primaryText: primary,
        secondaryText: secondary,
      })
    }
    return { ok: true, predictions }
  } catch {
    return { ok: false, error: 'network' }
  }
}

type PlaceDetailsResponse = {
  id?: string
  displayName?: { text?: string }
  formattedAddress?: string
  location?: { latitude?: number; longitude?: number }
}

/** Prefer formatted address; avoid "street, street, city" when displayName repeats the address start. */
export function formatPlaceLabel(
  displayName: string | null | undefined,
  formattedAddress: string | null | undefined,
  fallback = '',
): string {
  const name = displayName?.trim() ?? ''
  const address = formattedAddress?.trim() ?? ''
  if (address && name) {
    if (address === name || address.startsWith(`${name},`) || address.includes(`, ${name},`)) {
      return address
    }
    // Named place + distinct address (e.g. "קניון איילון, רמת גן")
    if (!address.includes(name)) {
      return `${name}, ${address}`
    }
    return address
  }
  return address || name || fallback
}

export async function fetchPlaceDetails(
  placeId: string,
  sessionToken?: string,
): Promise<{ ok: true; place: PlaceDetails } | { ok: false; error: string }> {
  const key = apiKey()
  if (!key) return { ok: false, error: 'missing_key' }

  const id = placeId.startsWith('places/') ? placeId.slice('places/'.length) : placeId
  const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`)
  if (sessionToken) url.searchParams.set('sessionToken', sessionToken)
  url.searchParams.set('languageCode', 'he')
  url.searchParams.set('regionCode', 'IL')

  try {
    const response = await fetch(url.toString(), {
      headers: {
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'id,displayName,formattedAddress,location',
      },
    })
    if (!response.ok) return { ok: false, error: `http_${response.status}` }

    const data = (await response.json()) as PlaceDetailsResponse
    const lat = data.location?.latitude
    const lng = data.location?.longitude
    if (lat == null || lng == null) return { ok: false, error: 'no_location' }

    const label = formatPlaceLabel(data.displayName?.text, data.formattedAddress, id)

    return {
      ok: true,
      place: {
        placeId: data.id?.startsWith('places/') ? data.id.slice('places/'.length) : (data.id ?? id),
        label,
        lat,
        lng,
      },
    }
  } catch {
    return { ok: false, error: 'network' }
  }
}

export function newPlacesSessionToken(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2)}`
}
