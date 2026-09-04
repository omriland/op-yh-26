import { describe, expect, it } from 'vitest'
import {
  STATION_MAX_LENGTH,
  emptyEventDraft,
  isAbandonedEmptyEventDraft,
  isMissingStationColumn,
  stationForSave,
} from './eventForm'
import { districtNeedsStation } from './systemDistricts'

const districts = [
  { id: 'sys', name: 'תחנה / אחר / משוכפל', code: 'station_other_duplicated' },
  { id: 'tlv', name: 'תל אביב', code: 'tel_aviv' },
]

describe('optional תחנה on the system שלוחה', () => {
  it('shows only for the system שלוחה, not a geographic district', () => {
    expect(districtNeedsStation(districts, 'sys')).toBe(true)
    expect(districtNeedsStation(districts, 'tlv')).toBe(false)
    expect(districtNeedsStation(districts, '')).toBe(false)
  })

  it('saves trimmed text only on the system שלוחה, and allows empty', () => {
    expect(
      stationForSave({ districtId: 'sys', districts, station: '  איילון  ' }),
    ).toBe('איילון')
    expect(stationForSave({ districtId: 'sys', districts, station: '   ' })).toBeNull()
    expect(stationForSave({ districtId: 'tlv', districts, station: 'איילון' })).toBeNull()
  })

  it('caps the stored value at the short-field length', () => {
    const long = 'א'.repeat(STATION_MAX_LENGTH + 10)
    expect(
      stationForSave({ districtId: 'sys', districts, station: long })?.length,
    ).toBe(STATION_MAX_LENGTH)
  })

  it('keeps a create draft that only has תחנה typed', () => {
    const empty = emptyEventDraft({ full_name: 'א', callsign: '1' })
    expect(
      isAbandonedEmptyEventDraft({ ...empty, station: 'איילון' }, empty.event_date),
    ).toBe(false)
  })

  it('detects a missing station column', () => {
    expect(
      isMissingStationColumn({
        code: 'PGRST204',
        message: "Could not find the 'station' column of 'events'",
      }),
    ).toBe(true)
    expect(isMissingStationColumn({ code: '42501', message: 'permission denied' })).toBe(false)
  })
})
