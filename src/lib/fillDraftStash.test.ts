import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FILL_DRAFT_MAX_AGE_MS,
  clearFillDraft,
  fillDraftKey,
  fillDraftSavedLabel,
  readFillDraft,
  stashFillDraft,
} from './fillDraftStash'

const NOW = 1_787_000_000_000

function installStorage(impl?: Partial<Storage>) {
  const map = new Map<string, string>()
  const store: Storage = {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, v),
    ...impl,
  } as Storage
  vi.stubGlobal('window', { localStorage: store })
  return { map, store }
}

describe('fillDraftStash', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('round-trips a draft', () => {
    installStorage()
    stashFillDraft('responder', 'a1', { treatment_detail: 'חילוץ מכביש 6' }, NOW)
    const back = readFillDraft<{ treatment_detail: string }>('responder', 'a1', NOW)
    expect(back?.draft.treatment_detail).toBe('חילוץ מכביש 6')
    expect(back?.savedAt).toBe(NOW)
  })

  it('scopes keys so the two fill flows cannot collide', () => {
    expect(fillDraftKey('responder', 'a1')).not.toBe(fillDraftKey('shiftBorn', 'a1'))
    installStorage()
    stashFillDraft('responder', 'a1', { v: 'responder' }, NOW)
    stashFillDraft('shiftBorn', 'a1', { v: 'shift' }, NOW)
    expect(readFillDraft<{ v: string }>('responder', 'a1', NOW)?.draft.v).toBe('responder')
    expect(readFillDraft<{ v: string }>('shiftBorn', 'a1', NOW)?.draft.v).toBe('shift')
  })

  it('drops a draft older than the max age', () => {
    installStorage()
    stashFillDraft('responder', 'a1', { v: 1 }, NOW)
    expect(readFillDraft('responder', 'a1', NOW + FILL_DRAFT_MAX_AGE_MS - 1)).not.toBeNull()
    expect(readFillDraft('responder', 'a1', NOW + FILL_DRAFT_MAX_AGE_MS + 1)).toBeNull()
  })

  it('clears the key it dropped, so it is not re-read', () => {
    const { map } = installStorage()
    stashFillDraft('responder', 'a1', { v: 1 }, NOW)
    readFillDraft('responder', 'a1', NOW + FILL_DRAFT_MAX_AGE_MS + 1)
    expect(map.size).toBe(0)
  })

  it('discards corrupt JSON instead of throwing at the user', () => {
    const { store, map } = installStorage()
    store.setItem(fillDraftKey('responder', 'a1'), '{not json')
    expect(readFillDraft('responder', 'a1', NOW)).toBeNull()
    expect(map.size).toBe(0)
  })

  it('discards a payload missing its envelope', () => {
    const { store } = installStorage()
    store.setItem(fillDraftKey('responder', 'a1'), JSON.stringify({ treatment_detail: 'x' }))
    expect(readFillDraft('responder', 'a1', NOW)).toBeNull()
  })

  it('clears on demand', () => {
    installStorage()
    stashFillDraft('responder', 'a1', { v: 1 }, NOW)
    clearFillDraft('responder', 'a1')
    expect(readFillDraft('responder', 'a1', NOW)).toBeNull()
  })

  it('never throws when storage is unavailable', () => {
    vi.stubGlobal('window', undefined)
    expect(() => stashFillDraft('responder', 'a1', { v: 1 }, NOW)).not.toThrow()
    expect(readFillDraft('responder', 'a1', NOW)).toBeNull()
    expect(() => clearFillDraft('responder', 'a1')).not.toThrow()
  })

  it('never throws when the quota is exhausted', () => {
    installStorage({
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    })
    expect(() => stashFillDraft('responder', 'a1', { v: 1 }, NOW)).not.toThrow()
  })

  it('formats the saved-at label as a 24-hour clock', () => {
    expect(fillDraftSavedLabel(Date.UTC(2026, 7, 20, 3, 14), 'en-GB')).toMatch(/^\d{2}:\d{2}$/)
  })
})
