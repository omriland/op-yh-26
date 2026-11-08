import { describe, expect, it } from 'vitest'
import {
  RECENT_SEARCHES_KEY,
  addRecentSearch,
  clearRecentSearches,
  readRecentSearches,
} from './recentSearches'

function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, v),
  }
}

const throwing = {
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('blocked')
  },
  removeItem: () => {
    throw new Error('blocked')
  },
} as unknown as Storage

describe('recent searches', () => {
  it('keeps the newest five, newest first, without repeats', () => {
    const store = memoryStorage()
    for (const q of ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ב']) addRecentSearch(q, store)
    expect(readRecentSearches(store)).toEqual(['ב', 'ו', 'ה', 'ד', 'ג'])
  })
  it('ignores blank queries and trims', () => {
    const store = memoryStorage()
    addRecentSearch('   ', store)
    addRecentSearch('  כביש 6 ', store)
    expect(readRecentSearches(store)).toEqual(['כביש 6'])
  })
  it('clears', () => {
    const store = memoryStorage()
    addRecentSearch('x', store)
    clearRecentSearches(store)
    expect(readRecentSearches(store)).toEqual([])
  })
  it('survives blocked storage and corrupt data', () => {
    expect(readRecentSearches(throwing)).toEqual([])
    expect(addRecentSearch('x', throwing)).toEqual(['x'])
    expect(() => clearRecentSearches(throwing)).not.toThrow()
    const store = memoryStorage()
    store.setItem(RECENT_SEARCHES_KEY, '{nope')
    expect(readRecentSearches(store)).toEqual([])
    store.setItem(RECENT_SEARCHES_KEY, JSON.stringify(['ok', 3, null]))
    expect(readRecentSearches(store)).toEqual(['ok'])
  })
  it('works without storage at all', () => {
    expect(readRecentSearches(null)).toEqual([])
  })
})
