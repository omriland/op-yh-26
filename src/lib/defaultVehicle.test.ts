import { describe, expect, it } from 'vitest'
import {
  canChooseDefaultVehicle,
  pickDefaultPersonalVehicleId,
  pickDefaultVehiclePlate,
} from './defaultVehicle'

describe('pickDefaultVehiclePlate', () => {
  it('keeps an already saved plate when it is still allowed', () => {
    expect(
      pickDefaultVehiclePlate(
        [
          { plate: '1234567', isDefault: true },
          { plate: '7654321', isDefault: false },
        ],
        '7654321',
      ),
    ).toBe('7654321')
  })

  it('uses the starred default when no plate is saved yet', () => {
    expect(
      pickDefaultVehiclePlate([
        { plate: '1111111', isDefault: false },
        { plate: '2222222', isDefault: true },
      ]),
    ).toBe('2222222')
  })

  it('falls back to the only vehicle when none is starred', () => {
    expect(pickDefaultVehiclePlate([{ plate: '1234567' }])).toBe('1234567')
  })

  it('stays empty when several vehicles exist and none is starred', () => {
    expect(
      pickDefaultVehiclePlate([{ plate: '1111111' }, { plate: '2222222' }]),
    ).toBe('')
  })

  it('matches a formatted saved plate to digit plates', () => {
    expect(
      pickDefaultVehiclePlate([{ plate: '1234567', isDefault: false }], '12-345-67'),
    ).toBe('1234567')
  })
})

describe('pickDefaultPersonalVehicleId', () => {
  it('prefers the first assigned responder’s starred vehicle', () => {
    expect(
      pickDefaultPersonalVehicleId(
        [
          { id: 'v-b', userId: 'b', isDefault: true },
          { id: 'v-a', userId: 'a', isDefault: true },
        ],
        ['a', 'b'],
      ),
    ).toBe('v-a')
  })

  it('falls back to any starred vehicle, then to the only option', () => {
    expect(
      pickDefaultPersonalVehicleId([{ id: 'v1', userId: 'a', isDefault: true }], ['b']),
    ).toBe('v1')
    expect(pickDefaultPersonalVehicleId([{ id: 'v1', userId: 'a' }])).toBe('v1')
    expect(
      pickDefaultPersonalVehicleId([
        { id: 'v1', userId: 'a' },
        { id: 'v2', userId: 'b' },
      ]),
    ).toBeNull()
  })
})

describe('canChooseDefaultVehicle', () => {
  it('is true only when two or more active vehicles exist', () => {
    expect(canChooseDefaultVehicle([])).toBe(false)
    expect(canChooseDefaultVehicle([{ archived: false }])).toBe(false)
    expect(
      canChooseDefaultVehicle([{ archived: true }, { archived: false }]),
    ).toBe(false)
    expect(
      canChooseDefaultVehicle([{ archived: false }, { archived: false }]),
    ).toBe(true)
    expect(
      canChooseDefaultVehicle([
        { archived: false },
        { archived: true },
        { archived: false },
      ]),
    ).toBe(true)
  })
})
