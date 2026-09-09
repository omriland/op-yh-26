import { describe, expect, it, vi } from 'vitest'
import {
  rankLocationSuggestions,
  searchLocationSuggestionsCombined,
} from './locationSuggestions'

const junction = {
  id: 'junction-1',
  name_he: 'מחלף השלום',
  name_en: null,
  roads: '20',
  lat: 32.073,
  lng: 34.793,
}

describe('searchLocationSuggestionsCombined', () => {
  it('queries the closed list and Google once in the same search', async () => {
    const searchJunctions = vi.fn().mockResolvedValue([junction])
    const predictions = [
      { placeId: 'google-1', primaryText: 'השלום', secondaryText: 'תל אביב' },
    ]
    const searchPlaces = vi.fn().mockResolvedValue({ ok: true, predictions })

    const result = await searchLocationSuggestionsCombined({
      localQuery: 'השלום',
      googleQuery: 'כביש 20 השלום',
      sessionToken: 'session-1',
      searchJunctions,
      searchPlaces,
    })

    expect(searchJunctions).toHaveBeenCalledWith('השלום')
    expect(searchPlaces).toHaveBeenCalledWith('כביש 20 השלום', 'session-1')
    expect(result).toEqual({
      junctions: [junction],
      places: { ok: true, predictions },
      localError: null,
    })
  })

  it('keeps Google results when the closed-list lookup fails', async () => {
    const error = new Error('local unavailable')
    const searchJunctions = vi.fn().mockRejectedValue(error)
    const searchPlaces = vi.fn().mockResolvedValue({ ok: true, predictions: [] })

    const result = await searchLocationSuggestionsCombined({
      localQuery: 'השלום',
      googleQuery: 'השלום',
      sessionToken: 'session-1',
      searchJunctions,
      searchPlaces,
    })

    expect(searchPlaces).toHaveBeenCalledOnce()
    expect(result.localError).toBe(error)
  })
})

describe('rankLocationSuggestions', () => {
  const google = {
    placeId: 'google-1',
    primaryText: 'מחלף השלום',
    secondaryText: 'תל אביב',
  }

  it('ranks junctions above Google and free text last', () => {
    expect(rankLocationSuggestions([junction], [google], 'השלום', true)).toEqual([
      { kind: 'junction', junction },
      { kind: 'google', prediction: google },
      { kind: 'free_text', text: 'השלום' },
    ])
  })

  it('keeps free text as the fallback when neither source matches', () => {
    expect(rankLocationSuggestions([], [], ' מקום שלא נמצא ', true)).toEqual([
      { kind: 'free_text', text: 'מקום שלא נמצא' },
    ])
  })

  it('omits free text for places-only fields', () => {
    expect(rankLocationSuggestions([], [google], 'השלום', false)).toEqual([
      { kind: 'google', prediction: google },
    ])
  })
})
