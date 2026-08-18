import { describe, expect, it } from 'vitest'
import {
  TREATED_PLATE_DUPLICATE_ERROR,
  TREATED_PLATE_LEFTOVER_ERROR,
  TREATED_PLATE_LENGTH_ERROR,
  commitTreatedPlate,
  leftoverTreatedPlateError,
  removeTreatedPlate,
  treatedPlateCaption,
} from './treatedPlates'

describe('commitTreatedPlate', () => {
  it('formats 7 digits with hyphens and appends', () => {
    const result = commitTreatedPlate('1234567', [])
    expect(result).toEqual({
      ok: true,
      plate: { plate_number: '12-345-67', model: null, color: null },
      plates: [{ plate_number: '12-345-67', model: null, color: null }],
    })
  })

  it('formats 8 digits with hyphens', () => {
    const result = commitTreatedPlate('71386301', [])
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.plate.plate_number).toBe('713-86-301')
  })

  it('rejects 6 digits', () => {
    expect(commitTreatedPlate('123456', [])).toEqual({
      ok: false,
      error: TREATED_PLATE_LENGTH_ERROR,
    })
  })

  it('rejects duplicate by digits', () => {
    const existing = [{ plate_number: '12-345-67', model: null, color: null }]
    expect(commitTreatedPlate('1234567', existing)).toEqual({
      ok: false,
      error: TREATED_PLATE_DUPLICATE_ERROR,
    })
  })
})

describe('leftoverTreatedPlateError', () => {
  it('ignores leftover on draft', () => {
    expect(leftoverTreatedPlateError('123', 'draft')).toBeUndefined()
  })

  it('errors leftover digits on complete', () => {
    expect(leftoverTreatedPlateError('123', 'complete')).toBe(TREATED_PLATE_LEFTOVER_ERROR)
  })

  it('allows empty pending on complete', () => {
    expect(leftoverTreatedPlateError('', 'complete')).toBeUndefined()
  })
})

describe('treatedPlateCaption', () => {
  it('joins model and color', () => {
    expect(treatedPlateCaption('REXTON', 'שחור')).toBe('REXTON · שחור')
  })

  it('shows a single side when the other is missing', () => {
    expect(treatedPlateCaption('REXTON', null)).toBe('REXTON')
    expect(treatedPlateCaption(null, 'שחור')).toBe('שחור')
    expect(treatedPlateCaption(null, null)).toBeNull()
  })
})

describe('removeTreatedPlate', () => {
  it('drops by digit match', () => {
    const plates = [
      { plate_number: '12-345-67', model: null, color: null },
      { plate_number: '713-86-301', model: 'REXTON', color: 'שחור' },
    ]
    expect(removeTreatedPlate(plates, '1234567')).toEqual([plates[1]])
  })
})
