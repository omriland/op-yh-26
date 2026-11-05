import { beforeEach, describe, expect, it } from 'vitest'
import {
  answerCobrowseConsent,
  cobrowseAgentName,
  cobrowseConnectUrl,
  cobrowseCustomData,
  cobrowseSupportLabel,
  getCobrowseState,
  requestCobrowseConsent,
  resetCobrowseState,
  setCobrowseSession,
  shouldRunCobrowse,
  subscribeCobrowse,
} from './cobrowse'

describe('shouldRunCobrowse', () => {
  const ready = { licenseKey: 'abc', signedIn: true, impersonating: false }

  it('runs for a signed-in user past the gates with a license key', () => {
    expect(shouldRunCobrowse(ready)).toBe(true)
  })

  it('never runs without a license key', () => {
    expect(shouldRunCobrowse({ ...ready, licenseKey: undefined })).toBe(false)
    expect(shouldRunCobrowse({ ...ready, licenseKey: '  ' })).toBe(false)
  })

  it('never runs before sign-in and gates are done', () => {
    expect(shouldRunCobrowse({ ...ready, signedIn: false })).toBe(false)
  })

  it('never runs while a Super Admin is impersonating', () => {
    expect(shouldRunCobrowse({ ...ready, impersonating: true })).toBe(false)
  })
})

describe('cobrowseCustomData', () => {
  it('carries id, name and callsign only', () => {
    expect(
      cobrowseCustomData({ id: 'u1', full_name: 'דנה לוי', callsign: '1234' }),
    ).toEqual({ user_id: 'u1', user_name: 'דנה לוי', callsign: '1234' })
  })

  it('omits empty fields', () => {
    expect(cobrowseCustomData({ id: 'u1', full_name: '', callsign: null })).toEqual({
      user_id: 'u1',
    })
  })
})

describe('cobrowseAgentName', () => {
  it('uses the agent name when present', () => {
    expect(cobrowseAgentName({ name: 'עמרי' })).toBe('עמרי')
  })

  it('is empty when the agent has no name', () => {
    expect(cobrowseAgentName(false)).toBe('')
    expect(cobrowseAgentName({ name: '   ' })).toBe('')
    expect(cobrowseAgentName(undefined)).toBe('')
  })
})

describe('cobrowseConnectUrl', () => {
  it('auto-connects to the device tagged with the user id', () => {
    expect(cobrowseConnectUrl('6f1c-ab')).toBe(
      'https://cobrowse.io/connect?filter_user_id=6f1c-ab',
    )
  })

  it('encodes the id', () => {
    expect(cobrowseConnectUrl('a b&c')).toBe(
      'https://cobrowse.io/connect?filter_user_id=a+b%26c',
    )
  })
})

describe('cobrowseSupportLabel', () => {
  it('names the agent after "התמיכה"', () => {
    expect(cobrowseSupportLabel('עמרי')).toBe('התמיכה (עמרי)')
  })

  it('is just "התמיכה" without a name', () => {
    expect(cobrowseSupportLabel('')).toBe('התמיכה')
  })
})

describe('consent store', () => {
  beforeEach(() => resetCobrowseState())

  it('shows a pending session request and resolves on approve', async () => {
    const answer = requestCobrowseConsent('session', 'עמרי')
    expect(getCobrowseState().pending).toEqual({ kind: 'session', agentName: 'עמרי' })
    answerCobrowseConsent(true)
    await expect(answer).resolves.toBe(true)
    expect(getCobrowseState().pending).toBeNull()
  })

  it('resolves false on decline', async () => {
    const answer = requestCobrowseConsent('control', 'עמרי')
    answerCobrowseConsent(false)
    await expect(answer).resolves.toBe(false)
  })

  it('declines an older request when a new one arrives', async () => {
    const first = requestCobrowseConsent('session', 'א')
    const second = requestCobrowseConsent('control', 'ב')
    await expect(first).resolves.toBe(false)
    expect(getCobrowseState().pending?.kind).toBe('control')
    answerCobrowseConsent(true)
    await expect(second).resolves.toBe(true)
  })

  it('declines a pending request on reset (sign-out / stop)', async () => {
    const answer = requestCobrowseConsent('session', 'א')
    resetCobrowseState()
    await expect(answer).resolves.toBe(false)
  })

  it('ignores an answer with nothing pending', () => {
    answerCobrowseConsent(true)
    expect(getCobrowseState().pending).toBeNull()
  })

  it('tracks the active session and notifies subscribers', () => {
    let calls = 0
    const unsubscribe = subscribeCobrowse(() => {
      calls += 1
    })
    setCobrowseSession({ active: true, remoteControl: false, agentName: 'עמרי' })
    expect(getCobrowseState().session).toEqual({
      active: true,
      remoteControl: false,
      agentName: 'עמרי',
    })
    unsubscribe()
    setCobrowseSession(null)
    expect(calls).toBe(1)
    expect(getCobrowseState().session).toBeNull()
  })
})
