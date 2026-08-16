import { describe, expect, it } from 'vitest'
import {
  COCKPIT_INTRO_STORAGE_KEY,
  hasSeenCockpitIntro,
  markCockpitIntroSeen,
} from './cockpitIntro'

function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear() {
      map.clear()
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null
    },
    key(index: number) {
      return [...map.keys()][index] ?? null
    },
    removeItem(key: string) {
      map.delete(key)
    },
    setItem(key: string, value: string) {
      map.set(key, value)
    },
  }
}

describe('cockpitIntro', () => {
  it('is unseen until marked for that user', () => {
    const storage = memoryStorage()
    expect(hasSeenCockpitIntro('u1', storage)).toBe(false)
    markCockpitIntroSeen('u1', storage)
    expect(hasSeenCockpitIntro('u1', storage)).toBe(true)
    expect(storage.getItem(`${COCKPIT_INTRO_STORAGE_KEY}:u1`)).toBe('1')
  })

  it('does not leak seen state across users', () => {
    const storage = memoryStorage()
    markCockpitIntroSeen('u1', storage)
    expect(hasSeenCockpitIntro('u2', storage)).toBe(false)
  })

  it('does not open without a user id', () => {
    expect(hasSeenCockpitIntro('', memoryStorage())).toBe(true)
  })
})
