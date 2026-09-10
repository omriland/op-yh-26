import { describe, expect, it } from 'vitest'
import {
  coveredPlateDigits,
  vehiclesMissingPhotos,
} from './eventVehiclePhotos'
import { emptyTreatedPlateFields, type TreatedPlate } from './treatedPlates'

function plate(number: string): TreatedPlate {
  return { plate_number: number, ...emptyTreatedPlateFields() }
}

describe('coveredPlateDigits', () => {
  const plates = [
    { id: 'a', plate_digits: '12345' },
    { id: 'b', plate_digits: '67890' },
    { id: 'c', plate_digits: '11111' },
  ]

  it('counts a photo attached to several plates for each of them', () => {
    const covered = coveredPlateDigits(
      [{ treated_plate_ids: ['a', 'b'] }],
      plates,
    )
    expect([...covered].sort()).toEqual(['12345', '67890'])
  })

  it('counts another responder photo on the same plate number', () => {
    const covered = coveredPlateDigits([{ treated_plate_ids: ['a'] }], [
      { id: 'a', plate_digits: '12345' },
      { id: 'mine', plate_digits: '12345' },
    ])
    expect(covered.has('12345')).toBe(true)
  })
})

describe('vehiclesMissingPhotos', () => {
  it('lists only plates on this log that have no photo', () => {
    const missing = vehiclesMissingPhotos(
      [plate('12-345'), plate('67-890'), plate('11-111')],
      new Set(['12345']),
    )
    expect(missing.map((row) => row.plate_number)).toEqual(['67-890', '11-111'])
  })

  it('is empty when every treated plate is covered', () => {
    expect(
      vehiclesMissingPhotos([plate('12-345')], new Set(['12345'])),
    ).toEqual([])
  })
})
