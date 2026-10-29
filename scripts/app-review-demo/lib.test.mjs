import { existsSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { passwordStrengthError } from '../../src/lib/passwordRules'
import {
  DEMO_LABEL,
  LOCAL_URL,
  PRODUCTION_URL,
  REPO_ROOT,
  assertOutsideRepo,
  demoAssignmentRows,
  demoEventRows,
  generatePassword,
  parseCli,
  provision,
  resolveTarget,
  teardown,
} from './lib.mjs'

const KEY = { SUPABASE_SERVICE_ROLE_KEY: 'test-key' }
const PROD_OK = { ...KEY, APP_REVIEW_DEMO_ALLOW: '1' }

/** Records every write; `respond(query)` answers reads. */
function fakeAdmin(respond = () => ({ data: [], error: null })) {
  const writes = []
  const from = (table) => {
    const query = { table, op: 'select', args: [], filters: [] }
    const chain = new Proxy(
      {},
      {
        get(_, prop) {
          if (prop === 'then') {
            return (resolve, reject) => Promise.resolve(respond(query)).then(resolve, reject)
          }
          return (...args) => {
            if (['insert', 'update', 'upsert', 'delete'].includes(prop)) {
              query.op = prop
              writes.push(query)
            } else if (prop === 'select' && query.op === 'select') {
              query.args = args
            } else if (prop === 'eq' || prop === 'in') {
              query.filters.push(args)
            }
            return chain
          }
        },
      },
    )
    return chain
  }
  const record = (kind) =>
    new Proxy({}, { get: (_, prop) => async (...args) => {
      writes.push({ [kind]: prop, args })
      return { data: { user: { id: 'new-user' } }, error: null }
    } })
  return { from, auth: { admin: record('auth') }, storage: { from: () => record('storage') }, writes }
}

const localTarget = resolveTarget({ target: 'local' }, KEY)
const scratchSecrets = join(tmpdir(), 'app-review-demo-test', 'demo.env')

describe('resolveTarget', () => {
  it('requires a target', () => {
    expect(() => resolveTarget({}, KEY)).toThrow(/--target/)
  })
  it('requires the service key', () => {
    expect(() => resolveTarget({ target: 'local' }, {})).toThrow(/SUPABASE_SERVICE_ROLE_KEY/)
  })
  it('keeps local on loopback', () => {
    expect(resolveTarget({ target: 'local' }, KEY).url).toBe(LOCAL_URL)
    expect(() => resolveTarget({ target: 'local' }, { ...KEY, SUPABASE_URL: PRODUCTION_URL })).toThrow(
      /127\.0\.0\.1/,
    )
  })
  it('refuses production without both the flag and the env var', () => {
    expect(() => resolveTarget({ target: 'production' }, PROD_OK)).toThrow(/Refusing production/)
    expect(() => resolveTarget({ target: 'production', confirmProduction: true }, KEY)).toThrow(
      /Refusing production/,
    )
    expect(() =>
      resolveTarget({ target: 'production', confirmProduction: true }, { ...PROD_OK, APP_REVIEW_DEMO_ALLOW: 'yes' }),
    ).toThrow(/Refusing production/)
  })
  it('pins production to the yahpaz-2026 project', () => {
    expect(() =>
      resolveTarget(
        { target: 'production', confirmProduction: true },
        { ...PROD_OK, SUPABASE_URL: 'https://other.supabase.co' },
      ),
    ).toThrow(/only talks to/)
    expect(resolveTarget({ target: 'production', confirmProduction: true }, PROD_OK)).toMatchObject({
      url: PRODUCTION_URL,
      isProduction: true,
    })
  })
  it('rejects unknown flags', () => {
    expect(() => parseCli(['--target', 'local', '--yes'])).toThrow()
  })
})

describe('secrets and password', () => {
  it('never writes the password file inside the repo', () => {
    expect(() => assertOutsideRepo(join(REPO_ROOT, '.env.demo'))).toThrow(/outside the repo/)
    expect(() => assertOutsideRepo(join(homedir(), '.yahpz-secrets', 'app-review-demo.env'))).not.toThrow()
  })
  it('generates passwords the app accepts', () => {
    const a = generatePassword()
    expect(passwordStrengthError(a)).toBeNull()
    expect(a).not.toBe(generatePassword())
  })
})

describe('demo data plan', () => {
  const refs = { eventTypeId: 't', roadId: 'r', districtId: 'd', station: null }
  const events = demoEventRows({ leadId: 'lead', today: '2026-10-29', refs })

  it('labels every event as demo and leads it with the demo lead', () => {
    expect(events).toHaveLength(3)
    for (const e of events) {
      expect(e).toMatchObject({ is_demo: true, notes: DEMO_LABEL, shift_lead_id: 'lead' })
      expect(e.location).toContain(DEMO_LABEL)
    }
    expect(events.map((e) => e.police_event_id)).toEqual(['4127', '4128', '4129'])
    expect(events[0]).toMatchObject({ patrol_callsign_prefix: 'אביב', patrol_callsign_number: '511' })
  })
  it('assigns only the demo account, one event already reported', () => {
    const rows = demoAssignmentRows({
      demoId: 'demo',
      today: '2026-10-29',
      events: events.map((e, i) => ({ id: `e${i}`, police_event_id: e.police_event_id })),
    })
    expect(rows.every((r) => r.responder_id === 'demo')).toBe(true)
    expect(rows.map((r) => r.status)).toEqual(['pending', 'in_progress', 'done'])
  })
})

describe('provision and teardown gates', () => {
  const cli = { target: 'local', dryRun: false, secretsFile: scratchSecrets }

  it('refuses when the isolation migration is missing, before any write', async () => {
    const admin = fakeAdmin((q) =>
      q.args[0] === 'is_app_review_demo' ? { data: null, error: { message: 'column does not exist' } } : { data: [], error: null },
    )
    await expect(provision({ admin, cli, target: localTarget, log: () => {} })).rejects.toThrow(
      /20261029120000_app_review_demo_isolation/,
    )
    expect(admin.writes).toEqual([])
  })

  it('refuses to turn an existing real account into a demo one', async () => {
    const admin = fakeAdmin((q) =>
      q.table === 'profiles' && q.filters.some(([c]) => c === 'email')
        ? { data: { id: 'real', is_app_review_demo: false }, error: null }
        : { data: [], error: null },
    )
    await expect(provision({ admin, cli, target: localTarget, log: () => {} })).rejects.toThrow(
      /not a demo account/,
    )
    await expect(teardown({ admin, cli, target: localTarget, log: () => {} })).rejects.toThrow(
      /not flagged/,
    )
    expect(admin.writes).toEqual([])
  })

  it('writes nothing on a dry run', async () => {
    const admin = fakeAdmin((q) =>
      q.table === 'profiles' && q.filters.length ? { data: null, error: null } : { data: [], error: null },
    )
    const log = []
    await provision({ admin, cli: { ...cli, dryRun: true }, target: localTarget, log: (m) => log.push(m) })
    expect(admin.writes).toEqual([])
    expect(existsSync(scratchSecrets)).toBe(false)
    expect(log.join('\n')).toContain('would create app-review-demo@yahpz.com')
  })
})
