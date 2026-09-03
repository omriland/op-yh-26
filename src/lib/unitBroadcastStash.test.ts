import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearUnitBroadcastStash,
  readUnitBroadcastStash,
  shouldStashUnitBroadcastDraft,
  stashUnitBroadcastDraft,
} from './unitBroadcastStash'

const NOW = 1_787_000_000_000

function installStorage() {
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
  }
  vi.stubGlobal('window', { localStorage: store })
}

describe('unitBroadcastStash', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('stashes only once subject or body is typed', () => {
    expect(
      shouldStashUnitBroadcastDraft({
        channel: 'both',
        audience: 'all',
        subject: '',
        body: '',
      }),
    ).toBe(false)
    expect(
      shouldStashUnitBroadcastDraft({
        channel: 'email',
        audience: 'admins',
        subject: 'הודעה',
        body: '',
      }),
    ).toBe(true)
  })

  it('round-trips a compose draft and clears empties', () => {
    installStorage()
    stashUnitBroadcastDraft(
      { channel: 'sms', audience: 'all', subject: '', body: 'שלום לכולם' },
      NOW,
    )
    expect(readUnitBroadcastStash(NOW)?.body).toBe('שלום לכולם')
    stashUnitBroadcastDraft(
      { channel: 'sms', audience: 'all', subject: '', body: '' },
      NOW,
    )
    expect(readUnitBroadcastStash(NOW)).toBeNull()
    clearUnitBroadcastStash()
    expect(readUnitBroadcastStash(NOW)).toBeNull()
  })
})
