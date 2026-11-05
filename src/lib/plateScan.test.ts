import { describe, expect, it } from 'vitest'
import { addPlateSuggestions, autoLinkPlateIds, visiblePlateSuggestions } from './plateScan'

describe('addPlateSuggestions', () => {
  it('appends new digits once, keeping order', () => {
    expect(addPlateSuggestions(['1234567'], ['12-345-67', '7654321', '7654321'])).toEqual([
      '1234567',
      '7654321',
    ])
  })
})

describe('visiblePlateSuggestions', () => {
  it('hides plates already on the event, in the form, or dismissed', () => {
    expect(
      visiblePlateSuggestions(['1234567', '7654321', '11122233', '5556667'], {
        eventPlates: ['12-345-67'],
        formPlates: ['765-43-21'.replace(/-/g, '')],
        dismissed: ['5556667'],
      }),
    ).toEqual(['11122233'])
  })
  it('matches on digits whatever the formatting', () => {
    expect(
      visiblePlateSuggestions(['1234567'], {
        eventPlates: [],
        formPlates: ['12-345-67'],
        dismissed: [],
      }),
    ).toEqual([])
  })
})

describe('autoLinkPlateIds', () => {
  const plates = [
    { id: 'a', plate_number: '12-345-67' },
    { id: 'b', plate_number: '765-43-21' },
    { id: 'c', plate_number: '1234567' },
  ]

  it('returns saved plates whose digits match a scanned plate, in list order', () => {
    expect(autoLinkPlateIds(['7654321', '12-345-67'], plates, [])).toEqual(['a', 'b', 'c'])
  })

  it('skips plates the photo is already linked to', () => {
    expect(autoLinkPlateIds(['1234567'], plates, ['a'])).toEqual(['c'])
  })

  it('returns nothing when no scanned plate is on the event', () => {
    expect(autoLinkPlateIds(['9999999'], plates, [])).toEqual([])
    expect(autoLinkPlateIds([], plates, [])).toEqual([])
    expect(autoLinkPlateIds(['1234567'], [], [])).toEqual([])
  })

  it('ignores scanned values with no digits', () => {
    expect(autoLinkPlateIds(['', '--'], [{ id: 'x', plate_number: '' }], [])).toEqual([])
  })
})
