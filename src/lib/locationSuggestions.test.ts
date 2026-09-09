import { describe, expect, it, vi } from 'vitest'
import { searchLocationSuggestionsLocalFirst } from './locationSuggestions'

const junction = {
  id: 'junction-1',
  name_he: 'מחלף השלום',
  name_en: null,
  roads: '20',
  lat: 32.073,
  lng: 34.793,
}

describe('searchLocationSuggestionsLocalFirst', () => {
  it('does not query Google when the closed list has a match', async () => {
    const searchJunctions = vi.fn().mockResolvedValue([junction])
    const searchPlaces = vi.fn()

    const result = await searchLocationSuggestionsLocalFirst({
      localQuery: 'השלום',
      googleQuery: 'כביש 20 השלום',
      sessionToken: 'session-1',
      searchJunctions,
      searchPlaces,
    })

    expect(searchJunctions).toHaveBeenCalledWith('השלום')
    expect(searchPlaces).not.toHaveBeenCalled()
    expect(result).toEqual({ junctions: [junction], places: null, localError: null })
  })

  it('queries Google only after the closed list returns no match', async () => {
    const searchJunctions = vi.fn().mockResolvedValue([])
    const searchPlaces = vi.fn().mockResolvedValue({
      ok: true,
      predictions: [{ placeId: 'google-1', primaryText: 'מקום', secondaryText: 'ישראל' }],
    })

    const result = await searchLocationSuggestionsLocalFirst({
      localQuery: 'מקום אחר',
      googleQuery: 'כביש 20 מקום אחר',
      sessionToken: 'session-1',
      searchJunctions,
      searchPlaces,
    })

    expect(searchJunctions).toHaveBeenCalledWith('מקום אחר')
    expect(searchPlaces).toHaveBeenCalledWith('כביש 20 מקום אחר', 'session-1')
    expect(result.junctions).toEqual([])
    expect(result.places?.ok).toBe(true)
  })

  it('falls back to Google when the local lookup fails', async () => {
    const error = new Error('local unavailable')
    const searchJunctions = vi.fn().mockRejectedValue(error)
    const searchPlaces = vi.fn().mockResolvedValue({ ok: true, predictions: [] })

    const result = await searchLocationSuggestionsLocalFirst({
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
