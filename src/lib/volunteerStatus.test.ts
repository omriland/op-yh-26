import { describe, expect, it } from 'vitest'
import {
  DEFAULT_VOLUNTEER_STATUS,
  VOLUNTEER_STATUS_LABELS,
  VOLUNTEER_STATUS_OPTIONS,
  isMapVisibleVolunteerStatus,
  isVolunteerStatus,
  parseVolunteerStatus,
  volunteerStatusLabel,
} from './volunteerStatus'

describe('volunteerStatus', () => {
  it('exposes the six unit statuses in the agreed Hebrew order', () => {
    expect(VOLUNTEER_STATUS_OPTIONS.map((option) => option.label)).toEqual([
      'מנהלה',
      'חניכה בסיסית',
      'חניכה טלפונית',
      'חניכה ברכב פרטי',
      'משמרות בלבד',
      'מתנדב פעיל',
    ])
  })

  it('labels each stored value in Hebrew', () => {
    expect(VOLUNTEER_STATUS_LABELS.administration).toBe('מנהלה')
    expect(VOLUNTEER_STATUS_LABELS.basic_training).toBe('חניכה בסיסית')
    expect(VOLUNTEER_STATUS_LABELS.phone_training).toBe('חניכה טלפונית')
    expect(VOLUNTEER_STATUS_LABELS.personal_vehicle_training).toBe('חניכה ברכב פרטי')
    expect(VOLUNTEER_STATUS_LABELS.shifts_only).toBe('משמרות בלבד')
    expect(VOLUNTEER_STATUS_LABELS.active_volunteer).toBe('מתנדב פעיל')
  })

  it('accepts only known stored values', () => {
    expect(isVolunteerStatus('active_volunteer')).toBe(true)
    expect(isVolunteerStatus('administration')).toBe(true)
    expect(isVolunteerStatus('מתנדב פעיל')).toBe(false)
    expect(isVolunteerStatus('')).toBe(false)
    expect(isVolunteerStatus(null)).toBe(false)
  })

  it('defaults unknown or missing values to מתנדב פעיל', () => {
    expect(DEFAULT_VOLUNTEER_STATUS).toBe('active_volunteer')
    expect(parseVolunteerStatus(null)).toBe('active_volunteer')
    expect(parseVolunteerStatus('nope')).toBe('active_volunteer')
    expect(parseVolunteerStatus('shifts_only')).toBe('shifts_only')
    expect(volunteerStatusLabel('phone_training')).toBe('חניכה טלפונית')
    expect(volunteerStatusLabel(null)).toBe('מתנדב פעיל')
  })

  it('hides מנהלה, חניכה בסיסית, and משמרות בלבד from maps', () => {
    expect(isMapVisibleVolunteerStatus('administration')).toBe(false)
    expect(isMapVisibleVolunteerStatus('basic_training')).toBe(false)
    expect(isMapVisibleVolunteerStatus('shifts_only')).toBe(false)
    expect(isMapVisibleVolunteerStatus('active_volunteer')).toBe(true)
    expect(isMapVisibleVolunteerStatus('phone_training')).toBe(true)
    expect(isMapVisibleVolunteerStatus('personal_vehicle_training')).toBe(true)
  })
})
