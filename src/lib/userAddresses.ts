import { formatNumber } from './format'
import { supabase } from './supabase'
import {
  israelToday,
  mapAvailabilityHoverLabel,
  parseAvailabilityStatus,
  type AvailabilityStatus,
} from './availability'
import {
  isMapVisibleVolunteerStatus,
  parseVolunteerStatus,
  volunteerStatusLabel,
  type VolunteerStatus,
} from './volunteerStatus'

export type AddressKind = 'home' | 'work' | 'other'

export type AddressDraft = {
  key: string
  id?: string
  kind: AddressKind
  label: string
  location: string
  location_place_id: string | null
  location_lat: number | null
  location_lng: number | null
}

export type UserAddressRow = {
  id: string
  kind: AddressKind
  label: string | null
  formatted_address: string
  place_id: string
  lat: number
  lng: number
}

export type PersistableAddress = {
  id?: string
  kind: AddressKind
  label: string | null
  formatted_address: string
  place_id: string
  lat: number
  lng: number
}

export type MapPin = {
  userId: string
  fullName: string
  callsign: string
  kind: AddressKind
  name: string
  label: string
  formattedAddress: string
  lat: number
  lng: number
  volunteerStatus: VolunteerStatus
  availability: AvailabilityStatus
  availableFrom: string | null
}

export const ADDRESS_KIND_LABELS: Record<AddressKind, string> = {
  home: 'בית',
  work: 'עבודה',
  other: 'אחר',
}

export const PLACES_ONLY_ERROR = 'יש לבחור כתובת מרשימת Google.'
export const EXTRA_ADDRESS_NAME_ERROR = 'יש למלא שם לכתובת הנוספת.'

export function addressKindLabel(kind: AddressKind, customLabel?: string | null): string {
  if (kind === 'other') {
    const trimmed = customLabel?.trim() ?? ''
    return trimmed || ADDRESS_KIND_LABELS.other
  }
  return ADDRESS_KIND_LABELS[kind]
}

export function emptyAddressDrafts(): AddressDraft[] {
  return [
    emptySlot('home'),
    emptySlot('work'),
  ]
}

export function emptyExtraAddressDraft(key = `other-${Date.now()}`): AddressDraft {
  return {
    ...emptySlot('other'),
    key,
  }
}

export function draftsFromRows(rows: UserAddressRow[]): AddressDraft[] {
  const home = rows.find((row) => row.kind === 'home')
  const work = rows.find((row) => row.kind === 'work')
  const extras = rows.filter((row) => row.kind === 'other')
  return [
    home ? rowToDraft(home) : emptySlot('home'),
    work ? rowToDraft(work) : emptySlot('work'),
    ...extras.map(rowToDraft),
  ]
}

export function isGooglePlaceComplete(draft: Pick<
  AddressDraft,
  'location' | 'location_place_id' | 'location_lat' | 'location_lng'
>): boolean {
  return Boolean(
    draft.location.trim() &&
      draft.location_place_id &&
      draft.location_lat != null &&
      draft.location_lng != null,
  )
}

export function isAddressSlotEmpty(draft: AddressDraft): boolean {
  return (
    !draft.location.trim() &&
    !draft.location_place_id &&
    draft.location_lat == null &&
    draft.location_lng == null &&
    (draft.kind !== 'other' || !draft.label.trim())
  )
}

export function addressDraftError(drafts: AddressDraft[]): string | null {
  for (const draft of drafts) {
    if (isAddressSlotEmpty(draft)) continue
    if (draft.kind === 'other' && isGooglePlaceComplete(draft) && !draft.label.trim()) {
      return EXTRA_ADDRESS_NAME_ERROR
    }
    if (!isGooglePlaceComplete(draft)) {
      return PLACES_ONLY_ERROR
    }
  }
  return null
}

export function persistableAddresses(drafts: AddressDraft[]): PersistableAddress[] {
  const rows: PersistableAddress[] = []
  for (const draft of drafts) {
    if (isAddressSlotEmpty(draft) || !isGooglePlaceComplete(draft)) continue
    if (draft.kind === 'other' && !draft.label.trim()) continue
    rows.push({
      ...(draft.id ? { id: draft.id } : {}),
      kind: draft.kind,
      label: draft.kind === 'other' ? draft.label.trim() : null,
      formatted_address: draft.location.trim(),
      place_id: draft.location_place_id!,
      lat: draft.location_lat!,
      lng: draft.location_lng!,
    })
  }
  return rows
}

export function mapPinLabel(
  callsign: string,
  kind: AddressKind,
  customLabel?: string | null,
): string {
  return `${callsign} · ${addressKindLabel(kind, customLabel)}`
}

export function toMapPins(
  users: Array<{
    id: string
    full_name: string
    callsign: string
    active: boolean
    volunteer_status?: string | null
    availability?: string | null
    available_from?: string | null
    addresses: UserAddressRow[]
  }>,
): MapPin[] {
  const pins: MapPin[] = []
  for (const user of users) {
    if (!user.active) continue
    if (!isMapVisibleVolunteerStatus(user.volunteer_status)) continue
    for (const address of user.addresses) {
      const name = addressKindLabel(address.kind, address.label)
      pins.push({
        userId: user.id,
        fullName: user.full_name,
        callsign: user.callsign,
        kind: address.kind,
        name,
        label: mapPinLabel(user.callsign, address.kind, address.label),
        formattedAddress: address.formatted_address,
        lat: address.lat,
        lng: address.lng,
        volunteerStatus: parseVolunteerStatus(user.volunteer_status),
        availability: parseAvailabilityStatus(user.availability),
        availableFrom: user.available_from ?? null,
      })
    }
  }
  return pins
}

export function mapUserPinChrome(
  pin: MapPin,
  today = israelToday(),
): { unavailable: boolean; tooltip: { text: string; alert: boolean } } {
  const hover = mapAvailabilityHoverLabel(pin.availability, pin.availableFrom, today)
  if (hover) {
    return { unavailable: true, tooltip: { text: hover, alert: false } }
  }
  return {
    unavailable: false,
    tooltip: {
      text: volunteerStatusLabel(pin.volunteerStatus),
      alert: pin.volunteerStatus === 'personal_vehicle_training',
    },
  }
}

export type NearbyResponder = {
  userId: string
  fullName: string
  callsign: string
  kind: AddressKind
  name: string
  formattedAddress: string
  lat: number
  lng: number
  km: number
}

export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function formatMapDistanceKm(km: number): string {
  if (km < 1) {
    return `${formatNumber(Math.round(km * 1000))} מ׳`
  }
  return `${formatNumber(Math.round(km * 10) / 10)} ק״מ`
}

const KM_PER_DEG_LAT = 111.32

export const SEARCH_VIEW_RADIUS_KM = 30

export function mapBoundsForRadiusKm(
  origin: { lat: number; lng: number },
  radiusKm: number,
): { south: number; west: number; north: number; east: number } {
  const dLat = radiusKm / KM_PER_DEG_LAT
  const cosLat = Math.cos((origin.lat * Math.PI) / 180)
  const dLng = radiusKm / (KM_PER_DEG_LAT * Math.max(Math.abs(cosLat), 0.01))
  return {
    south: origin.lat - dLat,
    west: origin.lng - dLng,
    north: origin.lat + dLat,
    east: origin.lng + dLng,
  }
}

export function nearbyResponders(
  pins: MapPin[],
  origin: { lat: number; lng: number },
  maxKm?: number,
): NearbyResponder[] {
  const best = new Map<string, NearbyResponder>()
  for (const pin of pins) {
    const km = haversineKm(origin.lat, origin.lng, pin.lat, pin.lng)
    if (maxKm != null && km > maxKm) continue
    const current = best.get(pin.userId)
    if (current && current.km <= km) continue
    best.set(pin.userId, {
      userId: pin.userId,
      fullName: pin.fullName,
      callsign: pin.callsign,
      kind: pin.kind,
      name: pin.name,
      formattedAddress: pin.formattedAddress,
      lat: pin.lat,
      lng: pin.lng,
      km,
    })
  }
  return [...best.values()].sort((a, b) => a.km - b.km || a.callsign.localeCompare(b.callsign, 'he'))
}

function emptySlot(kind: 'home' | 'work' | 'other'): AddressDraft {
  return {
    key: kind,
    kind,
    label: '',
    location: '',
    location_place_id: null,
    location_lat: null,
    location_lng: null,
  }
}

export async function fetchActiveUserMapPins(): Promise<MapPin[]> {
  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, full_name, callsign, active, volunteer_status, availability, available_from')
    .eq('active', true)

  if (profileError) throw profileError
  const users = profiles ?? []
  const ids = users.map((row) => row.id as string)
  if (ids.length === 0) return []

  const { data: addressRows, error: addressError } = await supabase
    .from('user_addresses')
    .select('id, user_id, kind, label, formatted_address, place_id, lat, lng')
    .in('user_id', ids)

  if (addressError) throw addressError

  return toMapPins(
    users.map((profile) => ({
      id: profile.id as string,
      full_name: profile.full_name as string,
      callsign: profile.callsign as string,
      active: profile.active !== false,
      volunteer_status: (profile.volunteer_status as string | null) ?? null,
      availability: (profile.availability as string | null) ?? null,
      available_from: (profile.available_from as string | null) ?? null,
      addresses: (addressRows ?? [])
        .filter((row) => row.user_id === profile.id)
        .map((row) => ({
          id: row.id as string,
          kind: row.kind as AddressKind,
          label: (row.label as string | null) ?? null,
          formatted_address: row.formatted_address as string,
          place_id: row.place_id as string,
          lat: Number(row.lat),
          lng: Number(row.lng),
        })),
    })),
  )
}

export async function fetchOwnAddresses(userId: string): Promise<UserAddressRow[]> {
  const { data, error } = await supabase
    .from('user_addresses')
    .select('id, kind, label, formatted_address, place_id, lat, lng')
    .eq('user_id', userId)
    .order('created_at')

  if (error) throw error
  const rows = (data ?? []).map((row) => ({
    id: row.id as string,
    kind: row.kind as AddressKind,
    label: (row.label as string | null) ?? null,
    formatted_address: row.formatted_address as string,
    place_id: row.place_id as string,
    lat: Number(row.lat),
    lng: Number(row.lng),
  }))
  const rank = (kind: AddressKind) => (kind === 'home' ? 0 : kind === 'work' ? 1 : 2)
  return rows.sort((a, b) => rank(a.kind) - rank(b.kind))
}

function rowToDraft(row: UserAddressRow): AddressDraft {
  return {
    key: row.id,
    id: row.id,
    kind: row.kind,
    label: row.label ?? '',
    location: row.formatted_address,
    location_place_id: row.place_id,
    location_lat: row.lat,
    location_lng: row.lng,
  }
}
