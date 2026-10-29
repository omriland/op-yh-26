import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sb = vi.hoisted(() => ({
  getSession: vi.fn(),
  signOut: vi.fn(),
  verifyOtp: vi.fn(),
  invoke: vi.fn(),
}))

vi.mock('./supabase', () => ({
  supabase: {
    auth: { getSession: sb.getSession, signOut: sb.signOut, verifyOtp: sb.verifyOtp },
    functions: { invoke: sb.invoke },
  },
}))

import {
  INVITE_REDEEM_ERRORS,
  clockAheadSeconds,
  isInviteRedeemInFlight,
  redeemStashedAuthToken,
} from './consumeAuthToken'
import { getPasswordSetupReason, reasonForRecoveryEvent, stashInviteToken } from './passwordSetup'

const store = new Map<string, string>()
const storage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    store.set(key, value)
  },
  removeItem: (key: string) => {
    store.delete(key)
  },
}

function jwt(iatSeconds: number): string {
  const part = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${part({ alg: 'HS256' })}.${part({ sub: 'u1', iat: iatSeconds, exp: iatSeconds + 3600 })}.sig`
}

function session(iatSeconds = Math.floor(Date.now() / 1000)) {
  return { access_token: jwt(iatSeconds), refresh_token: 'rt', expires_at: iatSeconds + 3600, user: { id: 'u1' } }
}

beforeEach(() => {
  vi.stubGlobal('sessionStorage', storage)
  vi.stubGlobal('localStorage', storage)
  stashInviteToken('11111111-2222-4333-8444-555555555555')
  sb.getSession.mockResolvedValue({ data: { session: null } })
  sb.signOut.mockResolvedValue({ error: null })
  sb.invoke.mockResolvedValue({ data: { ok: true, token_hash: 'th', type: 'magiclink' }, error: null })
})

afterEach(() => {
  store.clear()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('redeemStashedAuthToken (durable invite link)', () => {
  it('returns the session that verifyOtp handed back', async () => {
    const s = session()
    sb.verifyOtp.mockResolvedValue({ data: { session: s, user: s.user }, error: null })
    const result = await redeemStashedAuthToken()
    expect(result).toEqual({ error: null, session: s })
    expect(sb.invoke).toHaveBeenCalledWith('admin-users', {
      body: { action: 'redeem_invite', invite_token: '11111111-2222-4333-8444-555555555555' },
    })
  })

  it('fails loudly when verify reports success but no session', async () => {
    sb.verifyOtp.mockResolvedValue({ data: { session: null, user: { id: 'u1' } }, error: null })
    const result = await redeemStashedAuthToken()
    expect(result.error).toBe(INVITE_REDEEM_ERRORS.verify_no_session)
    expect(result).toMatchObject({ reason: 'verify_no_session' })
  })

  it('refuses a phone clock more than about an hour ahead, and drops the session locally', async () => {
    const twoHoursAgo = Math.floor(Date.now() / 1000) - 2 * 3600
    sb.verifyOtp.mockResolvedValue({ data: { session: session(twoHoursAgo) }, error: null })
    const result = await redeemStashedAuthToken()
    expect(result).toMatchObject({ reason: 'clock_ahead' })
    expect(result.error).toContain('תאריך ושעה אוטומטיים')
    expect(sb.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('accepts a clock that is behind (harmless for the session)', async () => {
    const s = session(Math.floor(Date.now() / 1000) + 3 * 3600)
    sb.verifyOtp.mockResolvedValue({ data: { session: s }, error: null })
    expect(await redeemStashedAuthToken()).toEqual({ error: null, session: s })
  })

  it('is marked in flight while verifying, so the auth listener stays out of the way', async () => {
    const seen: boolean[] = []
    sb.verifyOtp.mockImplementation(async () => {
      seen.push(isInviteRedeemInFlight())
      return { data: { session: session() }, error: null }
    })
    expect(isInviteRedeemInFlight()).toBe(false)
    await redeemStashedAuthToken()
    expect(seen).toEqual([true])
    expect(isInviteRedeemInFlight()).toBe(false)
  })

  it('clears the in-flight mark when verify throws', async () => {
    sb.verifyOtp.mockRejectedValue(new Error('network'))
    await expect(redeemStashedAuthToken()).rejects.toThrow('network')
    expect(isInviteRedeemInFlight()).toBe(false)
  })

  it('keeps the invite intent when the server hands back a recovery-type token', async () => {
    sb.invoke.mockResolvedValue({ data: { ok: true, token_hash: 'th', type: 'recovery' }, error: null })
    sb.verifyOtp.mockResolvedValue({ data: { session: session() }, error: null })
    const result = await redeemStashedAuthToken()
    expect(result.error).toBeNull()
    expect(sb.verifyOtp).toHaveBeenCalledWith({ token_hash: 'th', type: 'recovery' })
    expect(getPasswordSetupReason()).toBe('invite')
  })

  it('still shows the server error from redeem_invite', async () => {
    sb.invoke.mockResolvedValue({ data: { error: 'קישור ההזמנה פג תוקף. בקשו הזמנה חדשה.' }, error: null })
    const result = await redeemStashedAuthToken()
    expect(result.error).toBe('קישור ההזמנה פג תוקף. בקשו הזמנה חדשה.')
    expect(sb.verifyOtp).not.toHaveBeenCalled()
  })
})

describe('clockAheadSeconds', () => {
  it('reads the server issue time from the access token', () => {
    const now = 1_800_000_000_000
    expect(clockAheadSeconds(jwt(now / 1000 - 3600), now)).toBe(3600)
    expect(clockAheadSeconds(jwt(now / 1000 + 60), now)).toBe(-60)
    expect(clockAheadSeconds('not-a-jwt', now)).toBeNull()
  })
})

describe('reasonForRecoveryEvent', () => {
  it('keeps an invite an invite; otherwise it is a recovery', () => {
    expect(reasonForRecoveryEvent('invite')).toBe('invite')
    expect(reasonForRecoveryEvent(null)).toBe('recovery')
    expect(reasonForRecoveryEvent('recovery')).toBe('recovery')
    expect(reasonForRecoveryEvent('admin_reset')).toBe('recovery')
  })
})
