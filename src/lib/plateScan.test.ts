import { describe, expect, it } from 'vitest'
import { addPlateSuggestions, visiblePlateSuggestions } from './plateScan'

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
