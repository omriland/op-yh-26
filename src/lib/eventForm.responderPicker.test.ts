import { describe, expect, it } from 'vitest'
import {
  canBeVehicleResponder,
  pickerCandidates,
  pickerNeedsVehicleResponder,
  type AssignableUser,
} from './eventForm'

function person(overrides: Partial<AssignableUser> & { id: string }): AssignableUser {
  return {
    full_name: overrides.id,
    callsign: overrides.id,
    hasVehicle: true,
    volunteerStatus: 'active_volunteer',
    ...overrides,
  }
}

const driver = person({ id: 'driver' })
const phoneTrainee = person({ id: 'phone', volunteerStatus: 'phone_training' })
const carTrainee = person({ id: 'car', volunteerStatus: 'personal_vehicle_training' })
const noCar = person({ id: 'nocar', hasVehicle: false })
const shiftsOnly = person({ id: 'shifts', volunteerStatus: 'shifts_only' })
const basic = person({ id: 'basic', volunteerStatus: 'basic_training' })
const admin = person({ id: 'admin', volunteerStatus: 'administration' })
const roster = [driver, phoneTrainee, carTrainee, noCar, shiftsOnly, basic, admin]

const ids = (people: AssignableUser[]) => people.map((row) => row.id)
const assigned = (id: string, hasVehicle = false) => ({ responder_id: id, hasVehicle })

describe('canBeVehicleResponder', () => {
  it('needs an active car and one of the three statuses that come out', () => {
    expect(canBeVehicleResponder(driver)).toBe(true)
    expect(canBeVehicleResponder(phoneTrainee)).toBe(true)
    expect(canBeVehicleResponder(carTrainee)).toBe(true)
    expect(canBeVehicleResponder(noCar)).toBe(false)
    expect(canBeVehicleResponder(shiftsOnly)).toBe(false)
    expect(canBeVehicleResponder(basic)).toBe(false)
    expect(canBeVehicleResponder(admin)).toBe(false)
  })

  it('refuses a person whose status was not loaded', () => {
    expect(canBeVehicleResponder(person({ id: 'x', volunteerStatus: undefined }))).toBe(false)
  })
})

describe('pickerCandidates', () => {
  it('offers only car-holders who come out for the first responder', () => {
    expect(pickerNeedsVehicleResponder([], roster)).toBe(true)
    expect(ids(pickerCandidates([], roster))).toEqual(['driver', 'phone', 'car'])
  })

  it('offers everyone not yet assigned once a car-holder is on the event', () => {
    const responders = [assigned('driver', true)]
    expect(pickerNeedsVehicleResponder(responders, roster)).toBe(false)
    expect(ids(pickerCandidates(responders, roster))).toEqual([
      'phone',
      'car',
      'nocar',
      'shifts',
      'basic',
      'admin',
    ])
  })

  it('goes back to car-holders when the car-holder is removed and only riders remain', () => {
    const responders = [assigned('nocar'), assigned('shifts', true)]
    expect(pickerNeedsVehicleResponder(responders, roster)).toBe(true)
    expect(ids(pickerCandidates(responders, roster))).toEqual(['driver', 'phone', 'car'])
  })

  it('stays open to everyone when a later responder is the car-holder', () => {
    const responders = [assigned('nocar'), assigned('phone', true)]
    expect(pickerNeedsVehicleResponder(responders, roster)).toBe(false)
    expect(ids(pickerCandidates(responders, roster))).toContain('basic')
  })

  it('judges a responder no longer on the roster by the vehicle flag on the draft', () => {
    expect(pickerNeedsVehicleResponder([assigned('gone', true)], roster)).toBe(false)
    expect(pickerNeedsVehicleResponder([assigned('gone', false)], roster)).toBe(true)
  })

  it('opens an old event without a car-holder on car-holders only', () => {
    const responders = [assigned('nocar'), assigned('basic', true)]
    expect(ids(pickerCandidates(responders, roster))).toEqual(['driver', 'phone', 'car'])
  })
})
