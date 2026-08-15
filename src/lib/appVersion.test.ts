import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DISMISSED_VERSION_KEY,
  currentAppVersion,
  fetchRemoteVersionId,
  parseVersionPayload,
  readDismissedVersion,
  shouldForceUpdatePreview,
  shouldShowUpdateNotice,
  writeDismissedVersion,
} from './appVersion'

function stubSessionStorage() {
  const store = new Map<string, string>()
  const sessionStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
  }
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: sessionStorage,
    configurable: true,
  })
  return store
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('shouldShowUpdateNotice', () => {
  it('hides when remote id is missing or current is empty', () => {
    expect(shouldShowUpdateNotice('abc', null, null)).toBe(false)
    expect(shouldShowUpdateNotice('', 'def', null)).toBe(false)
  })

  it('hides when remote matches this tab', () => {
    expect(shouldShowUpdateNotice('abc', 'abc', null)).toBe(false)
  })

  it('shows when remote differs and was not dismissed', () => {
    expect(shouldShowUpdateNotice('abc', 'def', null)).toBe(true)
  })

  it('hides when this tab already dismissed that remote id', () => {
    expect(shouldShowUpdateNotice('abc', 'def', 'def')).toBe(false)
  })

  it('shows again when a later deploy replaces the dismissed id', () => {
    expect(shouldShowUpdateNotice('abc', 'ghi', 'def')).toBe(true)
  })
})

describe('shouldForceUpdatePreview', () => {
  it('is true only in dev with update_notice=1', () => {
    expect(shouldForceUpdatePreview('?update_notice=1', true)).toBe(true)
    expect(shouldForceUpdatePreview('update_notice=1', true)).toBe(true)
  })

  it('is false in production or without the flag', () => {
    expect(shouldForceUpdatePreview('?update_notice=1', false)).toBe(false)
    expect(shouldForceUpdatePreview('', true)).toBe(false)
    expect(shouldForceUpdatePreview('?other=1', true)).toBe(false)
  })
})

describe('parseVersionPayload', () => {
  it('reads a non-empty id string', () => {
    expect(parseVersionPayload({ id: 'commit-1' })).toBe('commit-1')
  })

  it('rejects missing, blank, or non-string ids', () => {
    expect(parseVersionPayload(null)).toBeNull()
    expect(parseVersionPayload({})).toBeNull()
    expect(parseVersionPayload({ id: '' })).toBeNull()
    expect(parseVersionPayload({ id: '   ' })).toBeNull()
    expect(parseVersionPayload({ id: 12 })).toBeNull()
  })
})

describe('dismissed version storage', () => {
  it('writes and reads the dismissed remote id', () => {
    stubSessionStorage()
    expect(readDismissedVersion()).toBeNull()
    writeDismissedVersion('def')
    expect(readDismissedVersion()).toBe('def')
    expect(sessionStorage.getItem(DISMISSED_VERSION_KEY)).toBe('def')
  })
})

describe('currentAppVersion', () => {
  it('returns the provided build id and treats a missing id as empty', () => {
    expect(currentAppVersion('baked-1')).toBe('baked-1')
    expect(currentAppVersion(undefined)).toBe('')
  })
})

describe('fetchRemoteVersionId', () => {
  it('returns the id from version.json with a no-store request', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'remote-9' }),
    })
    await expect(fetchRemoteVersionId(fetchImpl)).resolves.toBe('remote-9')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url.startsWith('/version.json?')).toBe(true)
    expect(init.cache).toBe('no-store')
  })

  it('returns null on network, http, or payload failure', async () => {
    await expect(
      fetchRemoteVersionId(vi.fn().mockRejectedValue(new Error('offline'))),
    ).resolves.toBeNull()
    await expect(
      fetchRemoteVersionId(vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) })),
    ).resolves.toBeNull()
    await expect(
      fetchRemoteVersionId(
        vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: '' }) }),
      ),
    ).resolves.toBeNull()
  })
})
