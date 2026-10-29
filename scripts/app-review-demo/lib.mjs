/**
 * App Review demo account: safety gates, demo data plan, provision, teardown.
 *
 * Used by create-app-review-demo.mjs and remove-app-review-demo.mjs. Takes a
 * Supabase service-role client from the caller so tests can pass a fake.
 * Never prints the password or the service key, never sends SMS/email/push:
 * users are created with auth.admin.createUser (no invite, no magic link).
 */

import { randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, relative, resolve, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

export const PRODUCTION_URL = 'https://rtvizpsfvtjowbimugns.supabase.co'
export const LOCAL_URL = 'http://127.0.0.1:54321'
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

export const DEMO_LABEL = 'דמו - App Review'
/** Signs in. Responder only, no phone, login OTP off. */
export const DEMO_USER = {
  email: 'app-review-demo@yahpz.com',
  fullName: 'App Review דמו',
  callsign: 'דמו-1',
}
/** Never signs in (banned, no password). Lead of the demo events, demo contact and map pin. */
export const DEMO_LEAD = {
  email: 'app-review-demo-lead@yahpz.com',
  fullName: 'אחמ״ש דמו',
  callsign: 'דמו-אחמ״ש',
}
/** Glilot interchange: a public road location, not anyone's home. */
const DEMO_PLACE = { name: 'מחלף גלילות', lat: 32.1452, lng: 34.8036 }
const DEMO_PLATE = '0000001'
const BAN_FOREVER = '876000h'

const USAGE = `Usage:
  node scripts/app-review-demo/<script>.mjs --target local [--dry-run]
  APP_REVIEW_DEMO_ALLOW=1 node scripts/app-review-demo/<script>.mjs --target production --confirm-production [--dry-run]
Env: SUPABASE_SERVICE_ROLE_KEY (required), SUPABASE_URL (optional; local defaults to ${LOCAL_URL}).`

export function parseCli(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      target: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      'confirm-production': { type: 'boolean', default: false },
      'rotate-password': { type: 'boolean', default: false },
      'secrets-file': { type: 'string' },
    },
    strict: true,
  })
  return {
    target: values.target,
    dryRun: values['dry-run'],
    confirmProduction: values['confirm-production'],
    rotatePassword: values['rotate-password'],
    secretsFile: values['secrets-file'],
  }
}

/** Every refusal happens here, before any network call. */
export function resolveTarget(cli, env) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (cli.target !== 'local' && cli.target !== 'production') {
    throw new Error(`--target must be "local" or "production".\n${USAGE}`)
  }
  if (!key) throw new Error(`SUPABASE_SERVICE_ROLE_KEY is not set.\n${USAGE}`)

  if (cli.target === 'local') {
    const url = (env.SUPABASE_URL || LOCAL_URL).replace(/\/+$/, '')
    if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url)) {
      throw new Error(`--target local only talks to 127.0.0.1 or localhost, not ${url}.`)
    }
    return { url, key, isProduction: false }
  }

  if (!cli.confirmProduction || env.APP_REVIEW_DEMO_ALLOW !== '1') {
    throw new Error(
      'Refusing production: pass --confirm-production AND set APP_REVIEW_DEMO_ALLOW=1.',
    )
  }
  const url = (env.SUPABASE_URL || PRODUCTION_URL).replace(/\/+$/, '')
  if (url !== PRODUCTION_URL) {
    throw new Error(`--target production only talks to ${PRODUCTION_URL}, not ${url}.`)
  }
  return { url, key, isProduction: true }
}

export function defaultSecretsFile(isProduction) {
  const name = isProduction ? 'app-review-demo.env' : 'app-review-demo.local.env'
  return join(homedir(), '.yahpz-secrets', name)
}

/** The password file must never land inside a git checkout of this repo. */
export function assertOutsideRepo(file, repoRoot = REPO_ROOT) {
  const rel = relative(repoRoot, resolve(file))
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
    throw new Error(`Secrets file must be outside the repo: ${file}`)
  }
}

/** Meets passwordRules.ts (8+, an uppercase letter, a special character). */
export function generatePassword() {
  return `${randomBytes(24).toString('base64url')}!A`
}

export function writeSecretsFile(file, { email, password, target, now }) {
  assertOutsideRepo(file)
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
  writeFileSync(
    file,
    [
      `# App Review demo account (${target}), written ${now.toISOString()}.`,
      '# Type these into App Store Connect > App Review Information. Do not commit.',
      `APP_REVIEW_DEMO_EMAIL=${email}`,
      `APP_REVIEW_DEMO_PASSWORD=${password}`,
      '',
    ].join('\n'),
    { mode: 0o600 },
  )
  chmodSync(file, 0o600)
}

export function jerusalemDate(now) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(now)
}

function check(result, what) {
  if (result.error) throw new Error(`${what}: ${result.error.message}`)
  return result.data
}

/** Refuses when 20261029120000_app_review_demo_isolation.sql is not applied. */
export async function assertMigrationPresent(admin) {
  for (const [table, column] of [
    ['profiles', 'is_app_review_demo'],
    ['events', 'is_demo'],
    ['shifts', 'is_demo'],
  ]) {
    const { error } = await admin.from(table).select(column).limit(1)
    if (error) {
      throw new Error(
        `Refusing: ${table}.${column} is missing on the target. Apply ` +
          'supabase/migrations/20261029120000_app_review_demo_isolation.sql first.',
      )
    }
  }
}

async function findProfile(admin, email) {
  return check(
    await admin
      .from('profiles')
      .select('id, is_app_review_demo')
      .eq('email', email)
      .maybeSingle(),
    `look up ${email}`,
  )
}

async function loadRefs(admin) {
  const byOrder = async (table) =>
    check(
      await admin.from(table).select('id, name').eq('active', true).order('sort_order').limit(1),
      `load ${table}`,
    )?.[0] ?? null
  const districts = check(
    await admin.from('districts').select('id, name, code').eq('active', true),
    'load districts',
  )
  // שלוחה תל אביב when it exists, else the system שלוחה with תחנה "תל אביב".
  const telAviv = districts.find((d) => d.name.trim() === 'תל אביב')
  const system = districts.find((d) => d.code === 'station_other_duplicated')
  return {
    eventTypeId: (await byOrder('event_types'))?.id ?? null,
    roadId: (await byOrder('roads'))?.id ?? null,
    districtId: telAviv?.id ?? system?.id ?? null,
    station: telAviv ? null : system ? 'תל אביב' : null,
  }
}

/** Three demo events: two waiting for the demo member's report, one reported. */
export function demoEventRows({ leadId, today, refs }) {
  const base = {
    shift_lead_id: leadId,
    is_demo: true,
    notes: DEMO_LABEL,
    event_date: today,
    event_type_id: refs.eventTypeId,
    road_id: refs.roadId,
    district_id: refs.districtId,
    station: refs.station,
    location: `${DEMO_LABEL} · ${DEMO_PLACE.name}`,
    location_lat: DEMO_PLACE.lat,
    location_lng: DEMO_PLACE.lng,
    patrol_callsign_prefix: 'אביב',
  }
  return [
    { ...base, police_event_id: '4127', patrol_callsign_number: '511', status: 'in_progress',
      started_at: `${today}T08:10:00`, ended_at: `${today}T08:55:00` },
    { ...base, police_event_id: '4128', patrol_callsign_number: '512', status: 'in_progress',
      started_at: `${today}T10:20:00`, ended_at: `${today}T11:05:00` },
    { ...base, police_event_id: '4129', patrol_callsign_number: '511', status: 'done',
      started_at: `${today}T06:40:00`, ended_at: `${today}T07:30:00` },
  ]
}

export function demoAssignmentRows({ demoId, today, events }) {
  const id = (policeId) => events.find((e) => e.police_event_id === policeId).id
  return [
    { event_id: id('4127'), responder_id: demoId, status: 'pending' },
    { event_id: id('4128'), responder_id: demoId, status: 'in_progress',
      odometer_start: 48210, started_at: `${today}T10:25:00` },
    { event_id: id('4129'), responder_id: demoId, status: 'done',
      odometer_start: 48150, odometer_end: 48188, total_km: 38,
      started_at: `${today}T06:45:00`, ended_at: `${today}T07:30:00` },
  ]
}

async function ensureUser(admin, person, { banned }, log, dryRun) {
  const existing = await findProfile(admin, person.email)
  if (existing && !existing.is_app_review_demo) {
    throw new Error(
      `Refusing: ${person.email} already exists and is not a demo account. ` +
        'Never turn a real account into a demo one.',
    )
  }
  if (existing) {
    log(`= ${person.email} exists (${existing.id})`)
    return { id: existing.id, created: false }
  }
  if (dryRun) {
    log(`+ would create ${person.email}${banned ? ' (banned, no password)' : ''}`)
    return { id: null, created: true }
  }
  // createUser sends nothing. No password yet: nobody can sign in before the
  // profile is flagged.
  const created = check(
    await admin.auth.admin.createUser({
      email: person.email,
      email_confirm: true,
      user_metadata: { full_name: person.fullName, callsign: person.callsign },
      ...(banned ? { ban_duration: BAN_FOREVER } : {}),
    }),
    `create ${person.email}`,
  )
  log(`+ created ${person.email} (${created.user.id})`)
  return { id: created.user.id, created: true }
}

async function flagDemoProfile(admin, id, person) {
  check(
    await admin
      .from('profiles')
      .update({
        is_app_review_demo: true,
        phone: null,
        full_name: person.fullName,
        callsign: person.callsign,
        active: true,
        invite_pending: false,
        must_change_password: false,
        otp_login_enabled: false,
        otp_users_page_enabled: false,
        volunteer_status: 'active_volunteer',
        availability: 'available',
        available_from: null,
      })
      .eq('id', id),
    `flag ${person.email}`,
  )
  check(
    await admin
      .from('user_roles')
      .upsert({ user_id: id, role: 'responder' }, { onConflict: 'user_id,role', ignoreDuplicates: true }),
    `responder role for ${person.email}`,
  )
}

async function removeStorageFolder(admin, bucket, folder) {
  const entries = check(await admin.storage.from(bucket).list(folder, { limit: 1000 }), `list ${bucket}`)
  const paths = []
  for (const entry of entries ?? []) {
    // Folders have no id; feedback attachments sit one level deeper.
    if (entry.id) paths.push(`${folder}/${entry.name}`)
    else paths.push(...(await removeStorageFolder(admin, bucket, `${folder}/${entry.name}`)))
  }
  if (paths.length) check(await admin.storage.from(bucket).remove(paths), `remove ${bucket} files`)
  return paths
}

/** Deletes every demo event and shift (children cascade) and their photos. */
async function clearDemoData(admin, log) {
  const events = check(await admin.from('events').select('id').eq('is_demo', true), 'load demo events')
  for (const event of events) await removeStorageFolder(admin, 'event-media', event.id)
  check(await admin.from('events').delete().eq('is_demo', true), 'delete demo events')
  check(await admin.from('shifts').delete().eq('is_demo', true), 'delete demo shifts')
  log(`- cleared ${events.length} demo events and the demo shifts`)
}

export async function provision({ admin, cli, target, log, now = new Date() }) {
  const dryRun = cli.dryRun
  const secretsFile = cli.secretsFile ?? defaultSecretsFile(target.isProduction)
  assertOutsideRepo(secretsFile)
  await assertMigrationPresent(admin)
  log(`Target: ${target.url}${dryRun ? ' (dry run, no writes)' : ''}`)

  const lead = await ensureUser(admin, DEMO_LEAD, { banned: true }, log, dryRun)
  const demo = await ensureUser(admin, DEMO_USER, { banned: false }, log, dryRun)
  const refs = await loadRefs(admin)
  const today = jerusalemDate(now)
  const needsPassword = demo.created || cli.rotatePassword || !existsSync(secretsFile)

  if (dryRun) {
    const existing = check(await admin.from('events').select('id').eq('is_demo', true), 'load demo events')
    log(`~ would replace ${existing.length} demo events with 3 dated ${today}, and the demo shift`)
    log(`~ refs: ${JSON.stringify(refs)}`)
    log(needsPassword ? `~ would set a new password into ${secretsFile}` : '~ would keep the current password')
    return { dryRun: true }
  }

  await flagDemoProfile(admin, lead.id, DEMO_LEAD)
  await flagDemoProfile(admin, demo.id, DEMO_USER)

  const vehicle = check(
    await admin.from('vehicles').select('id').eq('user_id', demo.id).limit(1).maybeSingle(),
    'load demo vehicle',
  )
  if (!vehicle) {
    check(
      await admin.from('vehicles').insert({
        user_id: demo.id, plate_number: DEMO_PLATE, model: `רכב ${DEMO_LABEL}`, is_default: true,
      }),
      'insert demo vehicle',
    )
  }
  const address = check(
    await admin.from('user_addresses').select('id').eq('user_id', lead.id).eq('kind', 'other').maybeSingle(),
    'load demo map pin',
  )
  if (!address) {
    check(
      await admin.from('user_addresses').insert({
        user_id: lead.id, kind: 'other', label: DEMO_LABEL,
        formatted_address: `${DEMO_PLACE.name} (${DEMO_LABEL})`, place_id: 'app-review-demo',
        lat: DEMO_PLACE.lat, lng: DEMO_PLACE.lng,
      }),
      'insert demo map pin',
    )
  }

  await clearDemoData(admin, log)
  const shift = check(
    await admin.from('shifts').insert({
      shift_lead_id: lead.id, is_demo: true, shift_date: today,
      vehicle_type: 'patrol_center', shift_kind: 'morning', notes: DEMO_LABEL,
    }).select('id').single(),
    'insert demo shift',
  )
  check(
    await admin.from('shift_responders').insert({ shift_id: shift.id, responder_id: demo.id }),
    'assign demo shift',
  )
  const events = check(
    await admin.from('events').insert(demoEventRows({ leadId: lead.id, today, refs })).select('id, police_event_id'),
    'insert demo events',
  )
  check(
    await admin.from('event_responders').insert(demoAssignmentRows({ demoId: demo.id, today, events })),
    'assign demo events',
  )
  log(`+ 3 demo events (${events.map((e) => e.police_event_id).join(', ')}) and 1 demo shift, dated ${today}`)

  if (needsPassword) {
    const password = generatePassword()
    writeSecretsFile(secretsFile, { email: DEMO_USER.email, password, target: cli.target, now })
    check(await admin.auth.admin.updateUserById(demo.id, { password }), 'set demo password')
    log(`+ password set; written to ${secretsFile} (mode 600)`)
  } else {
    log(`= password unchanged (in ${secretsFile}; --rotate-password to replace it)`)
  }
  return { dryRun: false, demoId: demo.id, leadId: lead.id }
}

export async function teardown({ admin, cli, target, log }) {
  const secretsFile = cli.secretsFile ?? defaultSecretsFile(target.isProduction)
  assertOutsideRepo(secretsFile)
  await assertMigrationPresent(admin)
  log(`Target: ${target.url}${cli.dryRun ? ' (dry run, no writes)' : ''}`)

  const people = []
  for (const person of [DEMO_USER, DEMO_LEAD]) {
    const profile = await findProfile(admin, person.email)
    if (profile && !profile.is_app_review_demo) {
      throw new Error(`Refusing: ${person.email} exists but is not flagged as a demo account.`)
    }
    if (profile) people.push({ ...person, id: profile.id })
  }
  const ids = people.map((p) => p.id)
  const events = check(await admin.from('events').select('id').eq('is_demo', true), 'load demo events')
  const feedback = ids.length
    ? check(await admin.from('user_feedback').select('kind, body, created_at').in('user_id', ids), 'load demo feedback')
    : []
  log(`Found ${people.length} demo accounts, ${events.length} demo events, ${feedback.length} feedback items.`)
  for (const item of feedback) {
    log(`  feedback (${item.kind}, ${item.created_at}): ${(item.body ?? '[voice note]').slice(0, 200)}`)
  }
  if (cli.dryRun) return { dryRun: true }

  await clearDemoData(admin, log)
  for (const person of people) {
    await removeStorageFolder(admin, 'user-feedback', person.id)
  }
  if (ids.length) check(await admin.from('user_feedback').delete().in('user_id', ids), 'delete demo feedback')
  for (const person of people) {
    check(await admin.auth.admin.deleteUser(person.id), `delete ${person.email}`)
    log(`- deleted ${person.email}`)
  }
  if (existsSync(secretsFile)) {
    rmSync(secretsFile)
    log(`- removed ${secretsFile}`)
  }
  return { dryRun: false }
}
