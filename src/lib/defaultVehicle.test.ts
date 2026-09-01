import { describe, expect, it } from 'vitest'
import {
  canChooseDefaultVehicle,
  isMissingDefaultVehicleColumn,
  pickDefaultPersonalVehicleId,
  pickDefaultVehiclePlate,
  queryVehiclesWithDefaultFallback,
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

describe('isMissingDefaultVehicleColumn', () => {
  it('matches the PostgREST missing-column error from production', () => {
    expect(
      isMissingDefaultVehicleColumn({
        code: '42703',
        message: 'column vehicles.is_default does not exist',
      }),
    ).toBe(true)
  })

  it('is false for other failures', () => {
    expect(isMissingDefaultVehicleColumn(null)).toBe(false)
    expect(
      isMissingDefaultVehicleColumn({ code: '42501', message: 'permission denied' }),
    ).toBe(false)
    expect(
      isMissingDefaultVehicleColumn({
        code: '42703',
        message: 'column vehicles.archived does not exist',
      }),
    ).toBe(false)
  })
})

describe('queryVehiclesWithDefaultFallback', () => {
  it('retries without is_default when that column is missing', async () => {
    const calls: string[] = []
    const rows = await queryVehiclesWithDefaultFallback(
      'id, plate_number, model, archived, is_default',
      async (select) => {
        calls.push(select)
        if (select.includes('is_default')) {
          return {
            data: null,
            error: {
              code: '42703',
              message: 'column vehicles.is_default does not exist',
            },
          }
        }
        return {
          data: [{ id: 'v1', plate_number: '12-345-67', model: 'קורולה', archived: false }],
          error: null,
        }
      },
    )
    expect(calls).toEqual([
      'id, plate_number, model, archived, is_default',
      'id, plate_number, model, archived',
    ])
    expect(rows).toEqual([
      {
        id: 'v1',
        plate_number: '12-345-67',
        model: 'קורולה',
        archived: false,
        is_default: false,
      },
    ])
  })
})
