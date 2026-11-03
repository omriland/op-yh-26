import { describe, expect, it, vi } from 'vitest'
import {
  deleteUserAccount,
  isImpersonationSession,
  jwtSessionId,
} from '../../supabase/functions/_shared/deleteAccount'

function jwt(payload: Record<string, unknown>): string {
  const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url')
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.sig`
}

type RpcResult = { data: unknown; error: { message: string } | null }

function fakeAdmin(rpc: RpcResult, removeError: { message: string } | null = null) {
  const removed: { bucket: string; paths: string[] }[] = []
  const client = {
    rpc: vi.fn(async () => rpc),
    storage: {
      from: (bucket: string) => ({
        remove: vi.fn(async (paths: string[]) => {
          removed.push({ bucket, paths })
          return { data: null, error: removeError }
        }),
      }),
    },
  }
  return { client, removed }
}

describe('jwtSessionId', () => {
  it('reads session_id from a bearer token', () => {
    const token = jwt({ sub: 'u1', session_id: '7c1d2e3f-0000-4000-8000-000000000001' })
    expect(jwtSessionId(`Bearer ${token}`)).toBe('7c1d2e3f-0000-4000-8000-000000000001')
  })

  it('returns null for a missing, malformed or session-less token', () => {
    expect(jwtSessionId(null)).toBeNull()
    expect(jwtSessionId('Basic abc')).toBeNull()
    expect(jwtSessionId('Bearer not-a-jwt')).toBeNull()
    expect(jwtSessionId(`Bearer ${jwt({ sub: 'u1' })}`)).toBeNull()
  })
})

describe('deleteUserAccount', () => {
  it('calls the database routine for that user only', async () => {
    const { client } = fakeAdmin({ data: { status: 'simulated' }, error: null })
    await deleteUserAccount(client as never, 'user-1')
    expect(client.rpc).toHaveBeenCalledWith('delete_user_account', { p_user_id: 'user-1' })
  })

  it('reports a simulated deletion for the App Review demo and touches no files', async () => {
    const { client, removed } = fakeAdmin({ data: { status: 'simulated' }, error: null })
    expect(await deleteUserAccount(client as never, 'demo')).toEqual({ ok: true, status: 'simulated', filesFailed: 0 })
    expect(removed).toEqual([])
  })

  it('removes the returned files bucket by bucket', async () => {
    const { client, removed } = fakeAdmin({
      data: {
        status: 'deleted',
        storage: [
          { bucket: 'event-media', path: 'e1/a.jpg' },
          { bucket: 'user-feedback', path: 'u1/voice.webm' },
          { bucket: 'event-media', path: 'e2/b.jpg' },
        ],
      },
      error: null,
    })
    expect(await deleteUserAccount(client as never, 'user-1')).toEqual({ ok: true, status: 'deleted', filesFailed: 0 })
    expect(removed).toEqual([
      { bucket: 'event-media', paths: ['e1/a.jpg', 'e2/b.jpg'] },
      { bucket: 'user-feedback', paths: ['u1/voice.webm'] },
    ])
  })

  it('still succeeds when file removal fails, and counts what was left', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = fakeAdmin(
      { data: { status: 'deleted', storage: [{ bucket: 'event-media', path: 'e1/a.jpg' }] }, error: null },
      { message: 'storage down' },
    )
    expect(await deleteUserAccount(client as never, 'user-1')).toEqual({ ok: true, status: 'deleted', filesFailed: 1 })
    error.mockRestore()
  })

  it.each([
    ['account_is_last_admin', 409],
    ['account_is_super_admin', 403],
    ['account_already_deleted', 409],
    ['account_not_found', 404],
  ])('maps the database refusal %s to HTTP %i with a Hebrew message', async (code, status) => {
    const { client } = fakeAdmin({ data: null, error: { message: code } })
    const result = await deleteUserAccount(client as never, 'user-1')
    expect(result).toMatchObject({ ok: false, status, code })
    expect(result.ok === false && /[֐-׿]/.test(result.error)).toBe(true)
  })

  it('reports any other database error as a generic failure', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = fakeAdmin({ data: null, error: { message: 'deadlock detected' } })
    expect(await deleteUserAccount(client as never, 'user-1')).toMatchObject({ ok: false, status: 500, code: 'failed' })
    error.mockRestore()
  })
})

describe('isImpersonationSession', () => {
  function fakeAudit(rows: unknown[], error: { message: string } | null = null) {
    const calls: Record<string, unknown> = {}
    const query = {
      select: () => query,
      eq: (col: string, value: unknown) => {
        calls[col] = value
        return query
      },
      limit: async () => ({ data: rows, error }),
    }
    return { client: { from: (table: string) => ((calls.table = table), query) }, calls }
  }

  it('is true when the session was minted by "view as"', async () => {
    const { client, calls } = fakeAudit([{ id: 1 }])
    expect(await isImpersonationSession(client as never, 'sess-1')).toBe(true)
    expect(calls).toEqual({ table: 'impersonation_audit', action: 'started', session_id: 'sess-1' })
  })

  it('is false for an ordinary session', async () => {
    const { client } = fakeAudit([])
    expect(await isImpersonationSession(client as never, 'sess-1')).toBe(false)
  })

  it('fails closed: no session id or a lookup error counts as impersonation', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await isImpersonationSession(fakeAudit([]).client as never, null)).toBe(true)
    expect(await isImpersonationSession(fakeAudit([], { message: 'x' }).client as never, 'sess-1')).toBe(true)
    error.mockRestore()
  })
})
