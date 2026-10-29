import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import type { AppRole } from './auth'
import {
  PRELAUNCH_BODY_LINES,
  PRELAUNCH_LAUNCH_AT,
  PRELAUNCH_LAUNCH_AT_MS,
  PRELAUNCH_TITLE,
  PRELAUNCH_OPEN_SLACK_MS,
  devPrelaunchOffsetMs,
  hasPrelaunchExemptRole,
  isMissingRpcError,
  parsePrelaunchGate,
  prelaunchWaitMs,
  type PrelaunchCheck,
} from './prelaunch'
import {
  PRELAUNCH_BLOCKED_MESSAGE,
  isPrelaunchBlocked,
} from '../../supabase/functions/_shared/prelaunch'

const MIGRATION = 'supabase/migrations/20261029180000_prelaunch_gate.sql'
const BEFORE = PRELAUNCH_LAUNCH_AT_MS - 60_000
const AFTER = PRELAUNCH_LAUNCH_AT_MS + PRELAUNCH_OPEN_SLACK_MS + 1

const ROLE_MATRIX: { roles: AppRole[]; exempt: boolean }[] = [
  { roles: ['responder'], exempt: false },
  { roles: ['shift_lead'], exempt: false },
  { roles: ['responder', 'shift_lead'], exempt: false },
  { roles: [], exempt: false },
  { roles: ['admin'], exempt: true },
  { roles: ['super_admin'], exempt: true },
  { roles: ['responder', 'shift_lead', 'admin'], exempt: true },
]

function server(exempt: boolean, serverOffsetMs = 0): PrelaunchCheck {
  return { kind: 'server', exempt, launchAtMs: PRELAUNCH_LAUNCH_AT_MS, serverOffsetMs }
}

describe('launch instant', () => {
  it('is 2026-11-01 00:01 in Asia/Jerusalem', () => {
    const local = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jerusalem',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(PRELAUNCH_LAUNCH_AT_MS)
    expect(PRELAUNCH_LAUNCH_AT).toBe('2026-10-31T22:01:00Z')
    expect(local).toBe('01/11/2026, 00:01')
  })

  it('matches public.prelaunch_launch_at() in the migration', () => {
    const sql = readFileSync(MIGRATION, 'utf8')
    const match = sql.match(/select timestamptz '([^']+)';/)
    expect(match).not.toBeNull()
    expect(Date.parse(match![1].replace(' ', 'T').replace('+00', 'Z'))).toBe(PRELAUNCH_LAUNCH_AT_MS)
  })
})

describe('gate copy', () => {
  it('is the title plus two lines, the first being "החשבון שלך מוכן."', () => {
    expect(PRELAUNCH_TITLE).toBe('המערכת תעלה לאוויר ב-1.11')
    expect(PRELAUNCH_BODY_LINES).toEqual(['החשבון שלך מוכן.', 'הכניסה למערכת תיפתח ביום ראשון, 1 בנובמבר.'])
  })

  it('shows no hour anywhere (the launch moment itself stays 00:01)', () => {
    const page = readFileSync('src/pages/PrelaunchGatePage.tsx', 'utf8')
    for (const text of [PRELAUNCH_TITLE, ...PRELAUNCH_BODY_LINES, PRELAUNCH_BLOCKED_MESSAGE, page]) {
      expect(text).not.toMatch(/\d{1,2}:\d{2}|בשעה/)
    }
    expect(page).toContain('<br />')
  })
})

describe('hasPrelaunchExemptRole', () => {
  it.each(ROLE_MATRIX)('$roles → exempt $exempt', ({ roles, exempt }) => {
    expect(hasPrelaunchExemptRole(roles)).toBe(exempt)
  })
})

describe('prelaunchWaitMs with a server answer', () => {
  it.each(ROLE_MATRIX)('$roles before launch: blocked unless exempt', ({ roles, exempt }) => {
    const wait = prelaunchWaitMs(server(exempt), roles, BEFORE)
    expect(wait === null).toBe(exempt)
  })

  it.each(ROLE_MATRIX)('$roles after launch: never blocked', ({ roles, exempt }) => {
    expect(prelaunchWaitMs(server(exempt), roles, AFTER)).toBeNull()
  })

  it('exempts the App Review demo account, which is a responder, on the server flag', () => {
    expect(prelaunchWaitMs(server(true), ['responder'], BEFORE)).toBeNull()
  })

  it('trusts the server over role names', () => {
    expect(prelaunchWaitMs(server(false), ['admin'], BEFORE)).not.toBeNull()
  })

  it('waits until launch plus the slack', () => {
    expect(prelaunchWaitMs(server(false), ['responder'], BEFORE)).toBe(60_000 + PRELAUNCH_OPEN_SLACK_MS)
    expect(prelaunchWaitMs(server(false), ['responder'], PRELAUNCH_LAUNCH_AT_MS)).toBe(PRELAUNCH_OPEN_SLACK_MS)
    expect(prelaunchWaitMs(server(false), ['responder'], AFTER)).toBeNull()
  })

  it('uses the server clock: a client clock an hour fast still waits', () => {
    const hour = 60 * 60_000
    expect(prelaunchWaitMs(server(false, -hour), ['responder'], BEFORE + hour)).not.toBeNull()
  })

  it('uses the server clock: a client clock an hour slow still opens', () => {
    const hour = 60 * 60_000
    expect(prelaunchWaitMs(server(false, hour), ['responder'], AFTER - hour)).toBeNull()
  })

  it('lets a dev clock override replace the server offset', () => {
    expect(prelaunchWaitMs(server(false), ['responder'], BEFORE, AFTER - BEFORE)).toBeNull()
    expect(prelaunchWaitMs(server(false), ['responder'], AFTER, BEFORE - AFTER)).not.toBeNull()
  })
})

describe('prelaunchWaitMs without a server answer', () => {
  it('falls back to roles and the client clock when the server is unreachable', () => {
    const unavailable: PrelaunchCheck = { kind: 'unavailable' }
    for (const { roles, exempt } of ROLE_MATRIX) {
      expect(prelaunchWaitMs(unavailable, roles, BEFORE) === null).toBe(exempt)
      expect(prelaunchWaitMs(unavailable, roles, AFTER)).toBeNull()
    }
  })

  it('has no gate when the RPC does not exist (not deployed or rolled back)', () => {
    expect(prelaunchWaitMs({ kind: 'not_installed' }, ['responder'], BEFORE)).toBeNull()
  })
})

describe('parsePrelaunchGate', () => {
  it('reads the RPC payload and the clock offset', () => {
    expect(
      parsePrelaunchGate(
        { exempt: false, blocked: true, server_now_ms: 1_000_500, launch_at_ms: PRELAUNCH_LAUNCH_AT_MS },
        1_000_000,
      ),
    ).toEqual({ kind: 'server', exempt: false, launchAtMs: PRELAUNCH_LAUNCH_AT_MS, serverOffsetMs: 500 })
  })

  it.each([null, 'x', {}, { exempt: 'no', server_now_ms: 1, launch_at_ms: 2 }, { exempt: true }])(
    'treats %j as unavailable',
    (data) => {
      expect(parsePrelaunchGate(data, 0)).toEqual({ kind: 'unavailable' })
    },
  )
})

describe('isMissingRpcError', () => {
  it('spots a function that is not deployed', () => {
    expect(isMissingRpcError({ code: 'PGRST202', message: 'Could not find the function' })).toBe(true)
    expect(isMissingRpcError({ code: '42883' })).toBe(true)
    expect(isMissingRpcError({ code: 'PGRST301', message: 'JWT expired' })).toBe(false)
    expect(isMissingRpcError(null)).toBe(false)
  })
})

describe('devPrelaunchOffsetMs', () => {
  it('reads ?prelaunch_now= in dev', () => {
    expect(devPrelaunchOffsetMs('?prelaunch_now=2026-10-31T22:00:00Z', BEFORE)).toBe(
      Date.parse('2026-10-31T22:00:00Z') - BEFORE,
    )
    expect(devPrelaunchOffsetMs('?prelaunch_now=nonsense', BEFORE)).toBe(0)
    expect(devPrelaunchOffsetMs('', BEFORE)).toBe(0)
  })

  it('is off outside dev', () => {
    vi.stubEnv('DEV', false)
    try {
      expect(devPrelaunchOffsetMs('?prelaunch_now=2026-11-02T00:00:00Z', BEFORE)).toBe(0)
    } finally {
      vi.unstubAllEnvs()
    }
  })
})

describe('edge functions: isPrelaunchBlocked', () => {
  const client = (result: { data: unknown; error: unknown }) => ({
    rpc: vi.fn(async () => result),
  })

  it('asks the database for the member', async () => {
    const c = client({ data: true, error: null })
    expect(await isPrelaunchBlocked(c, 'user-1')).toBe(true)
    expect(c.rpc).toHaveBeenCalledWith('is_prelaunch_blocked', { p_uid: 'user-1' })
    expect(await isPrelaunchBlocked(client({ data: false, error: null }), 'user-1')).toBe(false)
  })

  it('fails open when the check is missing or fails', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await isPrelaunchBlocked(client({ data: null, error: { code: 'PGRST202' } }), 'u')).toBe(false)
    quiet.mockRestore()
  })

  it('shows the same text as the web gate', async () => {
    const { PRELAUNCH_TITLE } = await import('./prelaunch')
    expect(PRELAUNCH_BLOCKED_MESSAGE).toBe(PRELAUNCH_TITLE)
  })
})
