import { describe, expect, it } from 'vitest'
import { isUnitEventId, policeEventIdForInput, policeEventIdKey } from './format'
import { policeEventIdForCockpitSave, sameDayPoliceEventIdCollides } from './eventForm'

describe('isUnitEventId', () => {
  it('accepts 6 of 0-9/A-Z with at least one letter', () => {
    expect(isUnitEventId('K7Q2M9')).toBe(true)
    expect(isUnitEventId('ABCDEF')).toBe(true)
  })

  it('rejects police numbers, lowercase and wrong lengths', () => {
    expect(isUnitEventId('123456')).toBe(false)
    expect(isUnitEventId('k7q2m9')).toBe(false)
    expect(isUnitEventId('K7Q2M')).toBe(false)
    expect(isUnitEventId('K7Q2M90')).toBe(false)
    expect(isUnitEventId('')).toBe(false)
    expect(isUnitEventId(null)).toBe(false)
  })
})

describe('policeEventIdForInput with unit IDs', () => {
  it('keeps a unit ID whole so a save never strips it to digits', () => {
    expect(policeEventIdForInput('K7Q2M9')).toBe('K7Q2M9')
  })

  it('still keeps police numbers to 5 digits', () => {
    expect(policeEventIdForInput('12-345 6')).toBe('12345')
    expect(policeEventIdForInput('k7q2m9')).toBe('729')
  })
})

describe('same-day duplicate check with unit IDs', () => {
  const row = (police_event_id: string) => ({
    id: 'other',
    event_date: '2026-11-13',
    police_event_id,
    is_cancelled: false,
    shift_lead_id: null,
  })

  it('does not mistake a unit ID for the police number made of its digits', () => {
    expect(policeEventIdKey('K7Q2M9')).toBe('K7Q2M9')
    expect(
      sameDayPoliceEventIdCollides({
        eventDate: '2026-11-13',
        policeEventId: 'K7Q2M9',
        existing: [row('729')],
      }),
    ).toBe(false)
  })

  it('cockpit save keeps a unit ID that does not collide', () => {
    expect(policeEventIdForCockpitSave({ typed: 'K7Q2M9', lastSaved: '', collides: false })).toBe(
      'K7Q2M9',
    )
  })
})
