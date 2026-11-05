import { describe, expect, it } from 'vitest'
import {
  USER_GAP_BOTH,
  USER_GAP_NO_MAP_ADDRESS,
  USER_GAP_NO_VEHICLE,
  userListDataGap,
} from './userListDataGap'

const pin = { place_id: 'ChIJx', lat: 32.07, lng: 34.78 }
const car = { archived: false }

describe('userListDataGap', () => {
  it('flags a מתנדב פעיל with neither a vehicle nor a map pin', () => {
    expect(
      userListDataGap({
        volunteer_status: 'active_volunteer',
        vehicles: [],
        addresses: [],
      }),
    ).toEqual({
      missingVehicle: true,
      missingMapAddress: true,
      tip: USER_GAP_BOTH,
    })
  })

  it('flags חניכה ברכב פרטי the same way', () => {
    expect(
      userListDataGap({
        volunteer_status: 'personal_vehicle_training',
        vehicles: [],
        addresses: [pin],
      })?.tip,
    ).toBe(USER_GAP_NO_VEHICLE)
  })

  it('flags a missing map pin when a vehicle is attached', () => {
    expect(
      userListDataGap({
        volunteer_status: 'active_volunteer',
        vehicles: [car],
        addresses: [],
      })?.tip,
    ).toBe(USER_GAP_NO_MAP_ADDRESS)
  })

  it('ignores an archived vehicle and an address that was never pinned', () => {
    expect(
      userListDataGap({
        volunteer_status: 'active_volunteer',
        vehicles: [{ archived: true }],
        addresses: [
          { place_id: '', lat: null, lng: null },
          { place_id: 'ChIJx', lat: Number.NaN, lng: 34.78 },
        ],
      })?.tip,
    ).toBe(USER_GAP_BOTH)
  })

  it('stays quiet when both a vehicle and a Google pin exist', () => {
    expect(
      userListDataGap({
        volunteer_status: 'personal_vehicle_training',
        vehicles: [{ archived: true }, car],
        addresses: [pin],
      }),
    ).toBeNull()
  })

  it.each([
    'administration',
    'basic_training',
    'phone_training',
    'shifts_only',
  ] as const)('never flags %s, even with both gaps', (volunteer_status) => {
    expect(
      userListDataGap({
        volunteer_status,
        vehicles: [],
        addresses: [],
      }),
    ).toBeNull()
  })
})
