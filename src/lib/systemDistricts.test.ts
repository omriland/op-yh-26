import { describe, expect, it } from 'vitest'
import {
  applyDistrictChangeLocation,
  applyDistrictChangeRoad,
  defaultRoadIdForSystemDistrict,
  districtNeedsPlacesLocation,
  emptyLocationPlaceFields,
  isSystemClosedListItem,
  isSystemDistrictCode,
  shouldClearLocationOnDistrictChange,
} from './systemDistricts'

describe('isSystemDistrictCode', () => {
  it('accepts the combined system code', () => {
    expect(isSystemDistrictCode('station_other_duplicated')).toBe(true)
  })

  it('rejects legacy split codes and normal codes', () => {
    expect(isSystemDistrictCode('station')).toBe(false)
    expect(isSystemDistrictCode('other')).toBe(false)
    expect(isSystemDistrictCode('duplicated')).toBe(false)
    expect(isSystemDistrictCode(null)).toBe(false)
    expect(isSystemDistrictCode('north')).toBe(false)
  })
})

describe('districtNeedsPlacesLocation', () => {
  const districts = [
    { id: 'd1', code: 'station_other_duplicated' },
    { id: 'd2', code: null },
  ]

  it('is true only for the combined system district', () => {
    expect(districtNeedsPlacesLocation(districts, 'd1')).toBe(true)
    expect(districtNeedsPlacesLocation(districts, 'd2')).toBe(false)
    expect(districtNeedsPlacesLocation(districts, '')).toBe(false)
  })
})

describe('shouldClearLocationOnDistrictChange', () => {
  it('clears when entering the system district', () => {
    expect(shouldClearLocationOnDistrictChange(null, 'station_other_duplicated')).toBe(true)
    expect(shouldClearLocationOnDistrictChange('north', 'station_other_duplicated')).toBe(true)
  })

  it('clears when leaving the system district', () => {
    expect(shouldClearLocationOnDistrictChange('station_other_duplicated', null)).toBe(true)
    expect(shouldClearLocationOnDistrictChange('station_other_duplicated', 'north')).toBe(true)
  })

  it('does not clear between normal districts', () => {
    expect(shouldClearLocationOnDistrictChange('north', 'south')).toBe(false)
    expect(shouldClearLocationOnDistrictChange(null, 'north')).toBe(false)
  })

  it('does not clear when code unchanged', () => {
    expect(
      shouldClearLocationOnDistrictChange('station_other_duplicated', 'station_other_duplicated'),
    ).toBe(false)
  })
})

describe('applyDistrictChangeLocation', () => {
  const filled = {
    location: 'צומת גלילות',
    location_place_id: 'ChIJx',
    location_lat: 32.1,
    location_lng: 34.8,
  }

  it('clears all place fields when switch involves system', () => {
    expect(applyDistrictChangeLocation('station_other_duplicated', 'north', filled)).toEqual(
      emptyLocationPlaceFields(),
    )
  })

  it('keeps fields when staying on normal districts', () => {
    expect(applyDistrictChangeLocation('north', 'south', filled)).toEqual(filled)
  })
})

describe('isSystemClosedListItem', () => {
  it('detects the system closed-list row', () => {
    expect(isSystemClosedListItem({ code: 'station_other_duplicated' })).toBe(true)
    expect(isSystemClosedListItem({ code: null })).toBe(false)
  })
})

describe('defaultRoadIdForSystemDistrict', () => {
  const roads = [
    { id: 'r1', name: 'כביש 1' },
    { id: 'r101', name: 'עירוני (101)' },
    { id: 'r2', name: 'כביש 2' },
  ]

  it('finds the road whose name contains 101', () => {
    expect(defaultRoadIdForSystemDistrict(roads)).toBe('r101')
  })

  it('returns null when none match', () => {
    expect(defaultRoadIdForSystemDistrict([{ id: 'r1', name: 'כביש 1' }])).toBeNull()
  })
})

describe('applyDistrictChangeRoad', () => {
  const roads = [
    { id: 'r1', name: 'כביש 1' },
    { id: 'r101', name: 'עירוני (101)' },
  ]

  it('defaults to 101 road when entering system שלוחה', () => {
    expect(applyDistrictChangeRoad(null, 'station_other_duplicated', 'r1', roads)).toBe('r101')
    expect(applyDistrictChangeRoad('north', 'station_other_duplicated', '', roads)).toBe('r101')
  })

  it('does not change road when leaving system or staying normal', () => {
    expect(applyDistrictChangeRoad('station_other_duplicated', 'north', 'r1', roads)).toBe('r1')
    expect(applyDistrictChangeRoad('north', 'south', 'r1', roads)).toBe('r1')
  })
})
