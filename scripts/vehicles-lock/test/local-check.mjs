#!/usr/bin/env node
/**
 * LOCAL ONLY. Checks, with real JWTs against a local `supabase start` stack,
 * that the bulk invite adds cars idempotently and that members can read but not
 * write their cars. Fake @example.test users only; nothing is emailed or texted
 * (the invite step is replaced by a direct local Auth admin call).
 *
 *   SUPABASE_URL=http://127.0.0.1:55321 ANON_KEY=… SERVICE_ROLE_KEY=… node local-check.mjs import
 *   … node local-check.mjs rls        # after the launch time is moved to the past locally
 *   … node local-check.mjs rls-rolled-back
 *
 * Run through local-check.sh, which also flips the local launch time.
 */
import { randomBytes } from 'node:crypto'
import { runInvites, syncUserVehicles, plateDigits } from '../../bulk-invite/lib.mjs'
import { postgrestVehicleApi } from '../../bulk-invite/vehicles-api.mjs'

const url = process.env.SUPABASE_URL ?? ''
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url)) {
  console.error('SUPABASE_URL must be a local http://127.0.0.1:<port> stack.')
  process.exit(1)
}
const anon = process.env.ANON_KEY
const service = process.env.SERVICE_ROLE_KEY
const PASSWORD = `T-${randomBytes(12).toString('hex')}`
let passed = 0
let failed = 0
const check = (name, ok, detail = '') => {
  if (ok) passed += 1
  else failed += 1
  console.log(`${ok ? 'ok' : 'NOT OK'} - ${name}${!ok && detail ? ` (${detail})` : ''}`)
}

async function http(path, { method = 'GET', key = anon, token = key, body, headers = {} } = {}) {
  const res = await fetch(`${url}${path}`, {
    method,
    headers: { apikey: key, authorization: `Bearer ${token}`, 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = text
  }
  return { status: res.status, body: json }
}
const svc = (path, opts = {}) => http(path, { ...opts, key: service })

async function setPassword(email) {
  const list = await svc(`/auth/v1/admin/users?per_page=1000`)
  const user = list.body.users.find((u) => u.email === email)
  await svc(`/auth/v1/admin/users/${user.id}`, { method: 'PUT', body: { password: PASSWORD } })
  return user.id
}
async function signIn(email) {
  await setPassword(email)
  const r = await http('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password: PASSWORD } })
  if (!r.body?.access_token) throw new Error(`sign-in failed for ${email}: ${r.status}`)
  return r.body.access_token
}

/** Same writes as admin-users `invite`, minus the email and SMS. */
async function fakeInvite(body) {
  const created = await svc('/auth/v1/admin/users', {
    method: 'POST',
    body: {
      email: body.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: body.full_name, callsign: body.callsign, phone: body.phone },
    },
  })
  if (created.status === 422 || created.status === 400) {
    return { status: 409, body: { error: 'המשתמש כבר קיים במערכת.' } }
  }
  if (created.status !== 200) return { status: 500, body: { error: `create ${created.status}` } }
  const id = created.body.id
  await svc(`/rest/v1/profiles?id=eq.${id}`, {
    method: 'PATCH',
    body: { full_name: body.full_name, callsign: body.callsign, phone: body.phone, email: body.email, active: true },
  })
  await svc('/rest/v1/user_roles', { method: 'POST', body: body.roles.map((role) => ({ user_id: id, role })) })
  return { status: 200, body: { ok: true, user_id: id } }
}

const invite = (n, email, roles, callsign) => ({
  line: n,
  body: { action: 'invite', full_name: `דמו ${callsign}`, email, callsign, phone: `05000000${String(n).padStart(2, '0')}`, roles, vehicles: [] },
})
const ADMIN = 'vl-admin@example.test'
const MEMBER = 'vl-member@example.test'
const LEAD = 'vl-lead@example.test'
const OTHER = 'vl-other@example.test'
const STAFF = [
  invite(2, ADMIN, ['admin', 'shift_lead', 'responder'], 'דמו-ר1'),
  invite(3, MEMBER, ['responder'], 'דמו-ר2'),
  invite(4, LEAD, ['shift_lead', 'responder'], 'דמו-ר3'),
  invite(5, OTHER, ['responder'], 'דמו-ר4'),
]
const CARS = new Map([
  [MEMBER, [{ plate_number: '1234567', model: 'GMC AT4' }, { plate_number: '12345678', model: 'טויוטה היילקס' }, { plate_number: '7654321', model: 'ג׳יפ' }]],
  [LEAD, [{ plate_number: '2223334', model: 'שברולט סילברדו' }]],
  [OTHER, [{ plate_number: '9998887', model: 'ראם' }]],
])

async function vehiclesOf(email) {
  const id = (await svc(`/rest/v1/profiles?select=id&email=eq.${encodeURIComponent(email)}`)).body[0]?.id
  return (await svc(`/rest/v1/vehicles?select=id,plate_number,model,is_default,created_at&user_id=eq.${id}&order=created_at`)).body
}

async function bulk(adminToken) {
  const api = postgrestVehicleApi({ url, apiKey: anon, accessToken: adminToken })
  return runInvites({
    invites: STAFF.slice(1),
    invoke: fakeInvite,
    delayMs: 0,
    vehiclesByEmail: CARS,
    syncVehicles: (args) => syncUserVehicles({ ...args, api }),
  })
}

async function importPhase() {
  // The admin who runs the import must exist first (like Omri).
  await fakeInvite(STAFF[0].body)
  const adminToken = await signIn(ADMIN)

  const first = await bulk(adminToken)
  check('first run invites 3 fake users', first.every((r) => r.outcome === 'invited'), JSON.stringify(first))
  check('first run adds 3 + 1 + 1 cars', first.map((r) => r.vehicles_added).join() === '3,1,1', JSON.stringify(first))
  const memberCars = await vehiclesOf(MEMBER)
  check('member has exactly 3 cars', memberCars.length === 3)
  check('plates stored in the app format', memberCars.map((v) => v.plate_number).join() === '12-345-67,123-45-678,76-543-21', memberCars.map((v) => v.plate_number).join())
  check('first car in the file is רכב ראשי', memberCars.filter((v) => v.is_default).map((v) => v.plate_number).join() === '12-345-67')

  const second = await bulk(adminToken)
  check('re-run: everyone already exists', second.every((r) => r.outcome === 'exists'))
  check('re-run adds no car', second.every((r) => r.vehicles_added === 0), JSON.stringify(second))
  check('re-run leaves 3 cars', (await vehiclesOf(MEMBER)).length === 3)

  // Lose one car (as if the first run stopped half way), then re-run.
  const lost = memberCars.find((v) => plateDigits(v.plate_number) === '7654321')
  await svc(`/rest/v1/vehicles?id=eq.${lost.id}`, { method: 'DELETE' })
  const third = await bulk(adminToken)
  check('re-run after a partial run adds only the missing car', third[0].vehicles_added === 1 && third[0].vehicles_skipped === 2, JSON.stringify(third[0]))
  check('still no duplicate', (await vehiclesOf(MEMBER)).length === 3)

  // The unique index still stops a duplicate that slips past the check.
  const api = postgrestVehicleApi({ url, apiKey: anon, accessToken: adminToken })
  const memberId = (await svc(`/rest/v1/profiles?select=id&email=eq.${encodeURIComponent(MEMBER)}`)).body[0].id
  check('direct duplicate insert is reported as duplicate', (await api.insert(memberId, { plate_number: '12-345-67', model: 'x' })) === 'duplicate')
}

async function rlsPhase({ rolledBack = false } = {}) {
  const tokens = {}
  for (const e of [ADMIN, MEMBER, LEAD, OTHER]) tokens[e] = await signIn(e)
  const as = (email, path, opts = {}) => http(path, { ...opts, token: tokens[email] })
  const id = async (email) => (await svc(`/rest/v1/profiles?select=id&email=eq.${encodeURIComponent(email)}`)).body[0].id
  const memberId = await id(MEMBER)
  const otherId = await id(OTHER)
  const mine = await vehiclesOf(MEMBER)
  const target = mine[1]
  const ret = { prefer: 'return=representation' }

  const read = await as(MEMBER, `/rest/v1/vehicles?select=plate_number&user_id=eq.${memberId}`)
  check('member reads own cars', read.status === 200 && read.body.length === 3, `${read.status} ${JSON.stringify(read.body)}`)
  const readOther = await as(MEMBER, `/rest/v1/vehicles?select=plate_number&user_id=eq.${otherId}`)
  check('member does not see another member\'s cars', readOther.status === 200 && readOther.body.length === 0)

  const ins = await as(MEMBER, '/rest/v1/vehicles', { method: 'POST', body: { user_id: memberId, plate_number: '5556667', model: 'x' }, headers: ret })
  check('member insert fails with 42501', ins.status === 403 && ins.body?.code === '42501', `${ins.status} ${JSON.stringify(ins.body)}`)
  if (!rolledBack) check('member insert error is the Hebrew guard message', String(ins.body?.message).includes('רק מנהל'), ins.body?.message)

  const upd = await as(MEMBER, `/rest/v1/vehicles?id=eq.${target.id}`, { method: 'PATCH', body: { model: 'נערך' }, headers: ret })
  if (rolledBack) {
    check('rolled back: member update is a silent no-op again (old behaviour)', upd.status === 200 && Array.isArray(upd.body) && upd.body.length === 0, `${upd.status} ${JSON.stringify(upd.body)}`)
  } else {
    check('member update fails with an error', upd.status === 403 && upd.body?.code === '42501', `${upd.status} ${JSON.stringify(upd.body)}`)
  }
  const arch = await as(MEMBER, `/rest/v1/vehicles?id=eq.${target.id}`, { method: 'PATCH', body: { archived: true }, headers: ret })
  if (!rolledBack) check('member archive fails with an error', arch.status === 403, `${arch.status}`)
  const del = await as(MEMBER, `/rest/v1/vehicles?id=eq.${target.id}`, { method: 'DELETE', headers: ret })
  if (rolledBack) {
    check('rolled back: member delete is a silent no-op again', del.status === 200 && del.body.length === 0, `${del.status} ${JSON.stringify(del.body)}`)
  } else {
    check('member delete fails with an error', del.status === 403 && del.body?.code === '42501', `${del.status} ${JSON.stringify(del.body)}`)
  }
  const after = await vehiclesOf(MEMBER)
  check('member cars unchanged after the attempts', after.length === 3 && after[1].model === target.model && !after.some((v) => v.archived))

  const otherCar = (await vehiclesOf(OTHER))[0]
  const updOther = await as(MEMBER, `/rest/v1/vehicles?id=eq.${otherCar.id}`, { method: 'PATCH', body: { model: 'x' }, headers: ret })
  check('member cannot touch another member\'s car (0 rows, unchanged)', updOther.status === 200 && updOther.body.length === 0)

  const leadIns = await as(LEAD, '/rest/v1/vehicles', { method: 'POST', body: { user_id: await id(LEAD), plate_number: '5556668', model: 'x' } })
  check('shift lead insert of own car fails', leadIns.status === 403, `${leadIns.status}`)
  const leadCar = (await vehiclesOf(LEAD))[0]
  const leadUpd = await as(LEAD, `/rest/v1/vehicles?id=eq.${leadCar.id}`, { method: 'PATCH', body: { model: 'x' }, headers: ret })
  if (!rolledBack) check('shift lead update of own car fails', leadUpd.status === 403, `${leadUpd.status}`)

  const rpc = await as(MEMBER, '/rest/v1/rpc/set_default_vehicle', { method: 'POST', body: { p_vehicle_id: mine[2].id } })
  check('member can still pick רכב ראשי (set_default_vehicle)', rpc.status === 200 || rpc.status === 204, `${rpc.status} ${JSON.stringify(rpc.body)}`)
  check('רכב ראשי moved', (await vehiclesOf(MEMBER)).find((v) => v.is_default)?.id === mine[2].id)

  if (rolledBack) return
  const aIns = await as(ADMIN, '/rest/v1/vehicles', { method: 'POST', body: { user_id: memberId, plate_number: '5556669', model: 'מנהל הוסיף' }, headers: ret })
  check('admin inserts a car for a member', aIns.status === 201, `${aIns.status} ${JSON.stringify(aIns.body)}`)
  const newId = aIns.body?.[0]?.id
  const aUpd = await as(ADMIN, `/rest/v1/vehicles?id=eq.${newId}`, { method: 'PATCH', body: { model: 'מנהל ערך' }, headers: ret })
  check('admin updates it', aUpd.status === 200 && aUpd.body.length === 1 && aUpd.body[0].model === 'מנהל ערך')
  const aArch = await as(ADMIN, `/rest/v1/vehicles?id=eq.${newId}`, { method: 'PATCH', body: { archived: true }, headers: ret })
  check('admin archives it', aArch.status === 200 && aArch.body[0]?.archived === true)
  const aDel = await as(ADMIN, `/rest/v1/vehicles?id=eq.${newId}`, { method: 'DELETE', headers: ret })
  check('admin deletes it', aDel.status === 200 && aDel.body.length === 1)
  const aReadAll = await as(ADMIN, '/rest/v1/vehicles?select=id')
  check('admin reads everyone\'s cars', aReadAll.body.length >= 5)

  const sIns = await svc('/rest/v1/vehicles', { method: 'POST', body: { user_id: memberId, plate_number: '5556670', model: 'service' }, headers: ret })
  check('service role (admin-users edge function path) inserts', sIns.status === 201)
  const sDel = await svc(`/rest/v1/vehicles?id=eq.${sIns.body?.[0]?.id}`, { method: 'DELETE', headers: ret })
  check('service role deletes', sDel.status === 200 && sDel.body.length === 1)
}

async function cleanup() {
  const list = await svc('/auth/v1/admin/users?per_page=1000')
  for (const u of list.body.users.filter((x) => x.email?.endsWith('@example.test'))) {
    await svc(`/rest/v1/vehicles?user_id=eq.${u.id}`, { method: 'DELETE' })
    await svc(`/auth/v1/admin/users/${u.id}`, { method: 'DELETE' })
  }
  const left = await svc('/auth/v1/admin/users?per_page=1000')
  check('fake users removed', !left.body.users.some((x) => x.email?.endsWith('@example.test')))
}

const phase = process.argv[2]
try {
  if (phase === 'import') await importPhase()
  else if (phase === 'rls') await rlsPhase()
  else if (phase === 'rls-rolled-back') await rlsPhase({ rolledBack: true })
  else if (phase === 'cleanup') await cleanup()
  else throw new Error('phase: import | rls | rls-rolled-back | cleanup')
} catch (error) {
  failed += 1
  console.log(`NOT OK - ${error instanceof Error ? error.stack : error}`)
}
console.log(`${phase}: ${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
