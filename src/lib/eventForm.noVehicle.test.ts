import { describe, expect, it } from 'vitest'
import {
  NO_VEHICLE_KM_PLACEHOLDER,
  hasActiveVehicle,
  leadKmForSave,
} from './eventForm'

describe('hasActiveVehicle', () => {
  it('is false when the profile has no vehicles', () => {
    expect(hasActiveVehicle([])).toBe(false)
    expect(hasActiveVehicle(null)).toBe(false)
    expect(hasActiveVehicle(undefined)).toBe(false)
  })

  it('is false when every vehicle is archived', () => {
    expect(hasActiveVehicle([{ archived: true }, { archived: true }])).toBe(false)
  })

  it('is true when at least one vehicle is active', () => {
    expect(hasActiveVehicle([{ archived: true }, { archived: false }])).toBe(true)
    expect(hasActiveVehicle([{ archived: null }])).toBe(true)
  })
})

describe('leadKmForSave', () => {
  it('stores null for a responder without a vehicle, even if km was typed', () => {
    expect(leadKmForSave(false, '42')).toBeNull()
    expect(leadKmForSave(false, '')).toBeNull()
  })

  it('parses km for a responder with a vehicle', () => {
    expect(leadKmForSave(true, '')).toBeNull()
    expect(leadKmForSave(true, '12')).toBe(12)
    expect(leadKmForSave(true, ' 8.5 ')).toBe(8.5)
  })

  it('keeps NaN so the save path can reject invalid km', () => {
    expect(Number.isNaN(leadKmForSave(true, 'אבג'))).toBe(true)
  })
})

describe('NO_VEHICLE_KM_PLACEHOLDER', () => {
  it('is the locked field copy', () => {
    expect(NO_VEHICLE_KM_PLACEHOLDER).toBe('מתנדב ללא רכב')
  })
})
