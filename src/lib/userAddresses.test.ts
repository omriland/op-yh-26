import { describe, expect, it } from 'vitest'
import {
  addressDraftError,
  addressKindLabel,
  draftsFromRows,
  emptyAddressDrafts,
  formatMapDistanceKm,
  haversineKm,
  mapBoundsForRadiusKm,
  mapPinLabel,
  nearbyResponders,
  persistableAddresses,
  toMapPins,
  type AddressDraft,
  type MapPin,
  type UserAddressRow,
} from './userAddresses'

const homePlace = {
  location: 'הרצל 1, תל אביב-יפו',
  location_place_id: 'place-home',
  location_lat: 32.08,
  location_lng: 34.78,
}

const workPlace = {
  location: 'דרך השלום 5, גבעתיים',
  location_place_id: 'place-work',
  location_lat: 32.07,
  location_lng: 34.81,
}

function draft(partial: Partial<AddressDraft> & Pick<AddressDraft, 'kind'>): AddressDraft {
  return {
    key: partial.key ?? partial.kind,
    label: '',
    location: '',
    location_place_id: null,
    location_lat: null,
    location_lng: null,
    ...partial,
  }
}

describe('addressKindLabel', () => {
  it('uses fixed Hebrew names for home and work', () => {
    expect(addressKindLabel('home')).toBe('בית')
    expect(addressKindLabel('work')).toBe('עבודה')
  })

  it('uses the custom label for extras, and אחר when empty', () => {
    expect(addressKindLabel('other', 'הורים')).toBe('הורים')
    expect(addressKindLabel('other', '  ')).toBe('אחר')
    expect(addressKindLabel('other')).toBe('אחר')
  })
})

describe('emptyAddressDrafts', () => {
  it('starts every user with empty home and work slots', () => {
    const drafts = emptyAddressDrafts()
    expect(drafts.map((row) => row.kind)).toEqual(['home', 'work'])
    expect(drafts.every((row) => !row.location && !row.location_place_id)).toBe(true)
  })
})

describe('draftsFromRows', () => {
  it('keeps home and work slots and appends extras after them', () => {
    const rows: UserAddressRow[] = [
      {
        id: 'w1',
        kind: 'work',
        label: null,
        formatted_address: workPlace.location,
        place_id: workPlace.location_place_id,
        lat: workPlace.location_lat,
        lng: workPlace.location_lng,
      },
      {
        id: 'o1',
        kind: 'other',
        label: 'הורים',
        formatted_address: 'ויצמן 10, כפר סבא',
        place_id: 'place-other',
        lat: 32.17,
        lng: 34.9,
      },
    ]

    const drafts = draftsFromRows(rows)
    expect(drafts.map((row) => row.kind)).toEqual(['home', 'work', 'other'])
    expect(drafts[0]?.location_place_id).toBeNull()
    expect(drafts[1]?.id).toBe('w1')
    expect(drafts[1]?.location).toBe(workPlace.location)
    expect(drafts[2]?.label).toBe('הורים')
  })
})

describe('addressDraftError', () => {
  it('is silent when slots are empty or fully picked from Google', () => {
    expect(addressDraftError(emptyAddressDrafts())).toBeNull()
    expect(
      addressDraftError([
        draft({ kind: 'home', ...homePlace }),
        draft({ kind: 'work' }),
        draft({ kind: 'other', key: 'o1', label: 'הורים', ...workPlace }),
      ]),
    ).toBeNull()
  })

  it('rejects typed text that is not a Google place', () => {
    expect(
      addressDraftError([
        draft({ kind: 'home', location: 'הרצל 1' }),
        draft({ kind: 'work' }),
      ]),
    ).toBe('יש לבחור כתובת מרשימת Google.')
  })

  it('rejects an extra row that has a place but no name', () => {
    expect(
      addressDraftError([
        ...emptyAddressDrafts(),
        draft({ kind: 'other', key: 'o1', ...homePlace }),
      ]),
    ).toBe('יש למלא שם לכתובת הנוספת.')
  })

  it('rejects an extra row that has a name but no Google place', () => {
    expect(
      addressDraftError([
        ...emptyAddressDrafts(),
        draft({ kind: 'other', key: 'o1', label: 'הורים' }),
      ]),
    ).toBe('יש לבחור כתובת מרשימת Google.')
  })
})

describe('persistableAddresses', () => {
  it('omits empty slots and keeps only Google-picked rows', () => {
    expect(persistableAddresses(emptyAddressDrafts())).toEqual([])
    expect(
      persistableAddresses([
        draft({ kind: 'home', id: 'h1', ...homePlace }),
        draft({ kind: 'work' }),
        draft({ kind: 'other', key: 'o1', label: '  הורים  ', ...workPlace }),
      ]),
    ).toEqual([
      {
        id: 'h1',
        kind: 'home',
        label: null,
        formatted_address: homePlace.location,
        place_id: homePlace.location_place_id,
        lat: homePlace.location_lat,
        lng: homePlace.location_lng,
      },
      {
        kind: 'other',
        label: 'הורים',
        formatted_address: workPlace.location,
        place_id: workPlace.location_place_id,
        lat: workPlace.location_lat,
        lng: workPlace.location_lng,
      },
    ])
  })
})

describe('mapPinLabel', () => {
  it('joins callsign and the address name', () => {
    expect(mapPinLabel('12', 'home')).toBe('12 · בית')
    expect(mapPinLabel('12', 'work')).toBe('12 · עבודה')
    expect(mapPinLabel('12', 'other', 'הורים')).toBe('12 · הורים')
  })
})

describe('toMapPins', () => {
  it('emits one pin per filled address of active users only', () => {
    const pins = toMapPins([
      {
        id: 'u1',
        full_name: 'דנה כהן',
        callsign: '12',
        active: true,
        addresses: [
          {
            id: 'h1',
            kind: 'home',
            label: null,
            formatted_address: homePlace.location,
            place_id: homePlace.location_place_id,
            lat: homePlace.location_lat,
            lng: homePlace.location_lng,
          },
          {
            id: 'o1',
            kind: 'other',
            label: 'הורים',
            formatted_address: workPlace.location,
            place_id: workPlace.location_place_id,
            lat: workPlace.location_lat,
            lng: workPlace.location_lng,
          },
        ],
      },
      {
        id: 'u2',
        full_name: 'יוסי',
        callsign: '9',
        active: false,
        addresses: [
          {
            id: 'h2',
            kind: 'home',
            label: null,
            formatted_address: homePlace.location,
            place_id: homePlace.location_place_id,
            lat: homePlace.location_lat,
            lng: homePlace.location_lng,
          },
        ],
      },
    ])

    expect(pins).toEqual([
      {
        userId: 'u1',
        fullName: 'דנה כהן',
        callsign: '12',
        kind: 'home',
        name: 'בית',
        label: '12 · בית',
        formattedAddress: homePlace.location,
        lat: homePlace.location_lat,
        lng: homePlace.location_lng,
        volunteerStatus: 'active_volunteer',
      },
      {
        userId: 'u1',
        fullName: 'דנה כהן',
        callsign: '12',
        kind: 'other',
        name: 'הורים',
        label: '12 · הורים',
        formattedAddress: workPlace.location,
        lat: workPlace.location_lat,
        lng: workPlace.location_lng,
        volunteerStatus: 'active_volunteer',
      },
    ])
  })

  it('hides מנהלה, חניכה בסיסית, and משמרות בלבד', () => {
    const address = {
      id: 'h1',
      kind: 'home' as const,
      label: null,
      formatted_address: homePlace.location,
      place_id: homePlace.location_place_id,
      lat: homePlace.location_lat,
      lng: homePlace.location_lng,
    }
    const pins = toMapPins([
      {
        id: 'admin',
        full_name: 'מנהלה',
        callsign: '1',
        active: true,
        volunteer_status: 'administration',
        addresses: [address],
      },
      {
        id: 'train',
        full_name: 'חניך',
        callsign: '2',
        active: true,
        volunteer_status: 'basic_training',
        addresses: [address],
      },
      {
        id: 'shifts',
        full_name: 'משמרות',
        callsign: '3',
        active: true,
        volunteer_status: 'shifts_only',
        addresses: [address],
      },
      {
        id: 'active',
        full_name: 'דנה',
        callsign: '4',
        active: true,
        volunteer_status: 'active_volunteer',
        addresses: [address],
      },
    ])

    expect(pins.map((pin) => pin.userId)).toEqual(['active'])
  })
})

describe('haversineKm', () => {
  it('is ~0 for the same point and a few km for nearby Tel Aviv points', () => {
    expect(haversineKm(32.08, 34.78, 32.08, 34.78)).toBeCloseTo(0, 5)
    expect(haversineKm(32.08, 34.78, 32.07, 34.81)).toBeGreaterThan(2)
    expect(haversineKm(32.08, 34.78, 32.07, 34.81)).toBeLessThan(5)
  })
})

describe('formatMapDistanceKm', () => {
  it('uses meters under 1 km and kilometers otherwise', () => {
    expect(formatMapDistanceKm(0.08)).toBe('80 מ׳')
    expect(formatMapDistanceKm(1.24)).toBe('1.2 ק״מ')
    expect(formatMapDistanceKm(12)).toBe('12 ק״מ')
  })
})

describe('mapBoundsForRadiusKm', () => {
  it('centers the origin and reaches the radius on each axis', () => {
    const origin = { lat: 32.08, lng: 34.78 }
    const box = mapBoundsForRadiusKm(origin, 30)

    expect((box.north + box.south) / 2).toBeCloseTo(origin.lat, 5)
    expect((box.east + box.west) / 2).toBeCloseTo(origin.lng, 5)
    expect(haversineKm(origin.lat, origin.lng, box.north, origin.lng)).toBeCloseTo(30, 0)
    expect(haversineKm(origin.lat, origin.lng, origin.lat, box.east)).toBeCloseTo(30, 0)
  })
})

describe('nearbyResponders', () => {
  it('keeps one row per user using their nearest address, nearest first', () => {
    const pins: MapPin[] = [
      {
        userId: 'far',
        fullName: 'רחוק',
        callsign: '9',
        kind: 'home',
        name: 'בית',
        label: '9 · בית',
        formattedAddress: 'חיפה',
        lat: 32.8,
        lng: 35.0,
        volunteerStatus: 'active_volunteer',
      },
      {
        userId: 'near',
        fullName: 'דנה כהן',
        callsign: '12',
        kind: 'work',
        name: 'עבודה',
        label: '12 · עבודה',
        formattedAddress: workPlace.location,
        lat: workPlace.location_lat,
        lng: workPlace.location_lng,
        volunteerStatus: 'active_volunteer',
      },
      {
        userId: 'near',
        fullName: 'דנה כהן',
        callsign: '12',
        kind: 'home',
        name: 'בית',
        label: '12 · בית',
        formattedAddress: homePlace.location,
        lat: 31.0,
        lng: 34.8,
        volunteerStatus: 'active_volunteer',
      },
    ]

    const rows = nearbyResponders(pins, {
      lat: workPlace.location_lat,
      lng: workPlace.location_lng,
    })

    expect(rows.map((row) => row.userId)).toEqual(['near', 'far'])
    expect(rows[0]?.name).toBe('עבודה')
    expect(rows[0]?.km).toBeCloseTo(0, 5)
    expect(rows[1]?.km).toBeGreaterThan(rows[0]!.km)
  })

  it('drops users whose nearest address is outside maxKm', () => {
    const pins: MapPin[] = [
      {
        userId: 'far',
        fullName: 'רחוק',
        callsign: '9',
        kind: 'home',
        name: 'בית',
        label: '9 · בית',
        formattedAddress: 'חיפה',
        lat: 32.8,
        lng: 35.0,
        volunteerStatus: 'active_volunteer',
      },
      {
        userId: 'near',
        fullName: 'דנה כהן',
        callsign: '12',
        kind: 'work',
        name: 'עבודה',
        label: '12 · עבודה',
        formattedAddress: workPlace.location,
        lat: workPlace.location_lat,
        lng: workPlace.location_lng,
        volunteerStatus: 'active_volunteer',
      },
    ]

    const rows = nearbyResponders(
      pins,
      { lat: workPlace.location_lat, lng: workPlace.location_lng },
      30,
    )

    expect(rows.map((row) => row.userId)).toEqual(['near'])
  })
})
