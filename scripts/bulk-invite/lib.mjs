/**
 * Bulk invite from a CSV exported from Excel. Each row becomes one call to the
 * existing admin-users `invite` action, exactly what the "משתמש חדש" dialog
 * sends, so the server-side checks, the invite email and the SMS are the same.
 * No network here: the caller passes `invoke`, so tests use a fake.
 */

/** Header aliases, compared after dropping spaces, quotes and geresh marks. */
const HEADERS = {
  full_name: ['full_name', 'name', 'שםמלא', 'שם'],
  first_name: ['first_name', 'שםפרטי'],
  last_name: ['last_name', 'שםמשפחה'],
  email: ['email', 'e-mail', 'mail', 'דואל', 'אימייל', 'מייל', 'דוארלקטרוני', 'כתובתמייל'],
  callsign: ['callsign', 'אוק', 'אותקריאה'],
  phone: ['phone', 'mobile', 'טלפון', 'נייד', 'טלפוןנייד'],
  role: ['role', 'roles', 'תפקיד'],
  volunteer_status: ['volunteer_status', 'status', 'סטטוס'],
}

/** Same as the dialog: a higher role includes the ones below it. */
const ROLES = {
  responder: ['responder'],
  shift_lead: ['shift_lead', 'responder'],
  admin: ['admin', 'shift_lead', 'responder'],
}
const ROLE_ALIASES = {
  '': 'responder',
  responder: 'responder',
  מתנדב: 'responder',
  מתנדבת: 'responder',
  shift_lead: 'shift_lead',
  אחמש: 'shift_lead',
  admin: 'admin',
  מנהל: 'admin',
  מנהלת: 'admin',
}
/** src/lib/volunteerStatus.ts VOLUNTEER_STATUS_LABELS. Empty = server default (מתנדב פעיל). */
const STATUS_ALIASES = {
  administration: 'administration',
  מנהלה: 'administration',
  basic_training: 'basic_training',
  חניכהבסיסית: 'basic_training',
  phone_training: 'phone_training',
  חניכהטלפונית: 'phone_training',
  personal_vehicle_training: 'personal_vehicle_training',
  חניכהברכבפרטי: 'personal_vehicle_training',
  shifts_only: 'shifts_only',
  משמרותבלבד: 'shifts_only',
  active_volunteer: 'active_volunteer',
  מתנדבפעיל: 'active_volunteer',
}

const squash = (value) => String(value ?? '').toLowerCase().replace(/[\s"'״׳`]/g, '')

/** RFC 4180 CSV. Strips a UTF-8 BOM, accepts CRLF, picks `,` `;` or tab from the header line. */
export function parseCsv(text) {
  const src = String(text).replace(/^﻿/, '')
  const firstLine = src.split(/\r?\n/, 1)[0] ?? ''
  const counts = [',', ';', '\t'].map((d) => [d, firstLine.split(d).length])
  const delimiter = counts.sort((a, b) => b[1] - a[1])[0][0]
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"'
        i += 1
      } else if (ch === '"') {
        quoted = false
      } else {
        field += ch
      }
    } else if (ch === '"' && field === '') {
      quoted = true
    } else if (ch === delimiter) {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += ch
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''))
}

function normalizePhone(raw) {
  let digits = String(raw ?? '').replace(/\D/g, '')
  if (digits.startsWith('972') && digits.length === 12) digits = `0${digits.slice(3)}`
  // Excel stores 0501234567 as the number 501234567.
  if (digits.startsWith('5') && digits.length === 9) digits = `0${digits}`
  return digits
}

/**
 * Turns CSV rows into invite bodies. Returns every problem at once; the caller
 * sends nothing unless `errors` is empty.
 */
export function buildInvites(rows) {
  const errors = []
  if (rows.length < 2) return { invites: [], errors: ['הקובץ ריק או שחסרה שורת כותרות.'] }

  const header = rows[0].map(squash)
  const column = {}
  for (const [key, aliases] of Object.entries(HEADERS)) {
    const index = header.findIndex((h) => aliases.includes(h))
    if (index >= 0) column[key] = index
  }
  // "שם" next to "שם משפחה" is a first name, not a full name.
  if (column.last_name !== undefined) {
    if (column.first_name === undefined) column.first_name = column.full_name
    delete column.full_name
    if (column.first_name === undefined) errors.push('חסרה עמודה: first_name')
  }
  for (const key of column.last_name !== undefined ? ['email', 'callsign', 'phone'] : ['full_name', 'email', 'callsign', 'phone']) {
    if (column[key] === undefined) errors.push(`חסרה עמודה: ${key}`)
  }
  if (errors.length) return { invites: [], errors }

  const invites = []
  const seenEmail = new Map()
  const seenCallsign = new Map()
  rows.slice(1).forEach((cells, i) => {
    const line = i + 2
    const cell = (key) => (column[key] === undefined ? '' : String(cells[column[key]] ?? '').trim())
    const fullName =
      column.last_name !== undefined
        ? [cell('first_name'), cell('last_name')].filter(Boolean).join(' ')
        : cell('full_name')
    const email = cell('email').toLowerCase()
    const callsign = cell('callsign')
    const phone = normalizePhone(cell('phone'))
    const role = ROLE_ALIASES[squash(cell('role'))]
    const statusRaw = squash(cell('volunteer_status'))
    const status = statusRaw ? STATUS_ALIASES[statusRaw] : undefined

    const problems = []
    if (!fullName) problems.push('חסר שם מלא')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) problems.push('דוא״ל לא תקין')
    if (!callsign) problems.push('חסר או״ק')
    if (phone.length !== 10) problems.push('טלפון חייב 10 ספרות')
    if (!role) problems.push(`תפקיד לא מוכר: ${cell('role')}`)
    if (statusRaw && !status) problems.push(`סטטוס לא מוכר: ${cell('volunteer_status')}`)
    if (email && seenEmail.has(email)) problems.push(`דוא״ל כפול (שורה ${seenEmail.get(email)})`)
    const callsignKey = callsign.toLowerCase()
    if (callsign && seenCallsign.has(callsignKey)) {
      problems.push(`או״ק כפול (שורה ${seenCallsign.get(callsignKey)})`)
    }
    if (email) seenEmail.set(email, seenEmail.get(email) ?? line)
    if (callsign) seenCallsign.set(callsignKey, seenCallsign.get(callsignKey) ?? line)

    if (problems.length) {
      errors.push(`שורה ${line}: ${problems.join(', ')}`)
      return
    }
    invites.push({
      line,
      body: {
        action: 'invite',
        full_name: fullName,
        email,
        callsign,
        phone,
        roles: ROLES[role],
        ...(status ? { volunteer_status: status } : {}),
        vehicles: [],
      },
    })
  })
  return { invites, errors }
}

const ALREADY_EXISTS = 'המשתמש כבר קיים במערכת.'
/** admin-users messages about this row only. Anything else may hit every row. */
const ROW_PROBLEMS = new Set(['או״ק זה כבר בשימוש.', 'כתובת הדוא״ל אינה תקינה.'])

/**
 * Sends invites one at a time. `invoke(body)` resolves to { status, body }.
 * A user who already exists is skipped, so a re-run is safe. A known row
 * problem is recorded and the run goes on. Anything else (auth, rate limit,
 * email or SMS provider, server error, network) stops the run at that row:
 * a failed email leaves the user created but not emailed, and a re-run would
 * then skip them, so they need "שליחת הזמנה מחדש" in the users screen.
 *
 * Email only unless `sendSms`: each request carries `send_sms`, and an invite
 * that does not come back with sms "off" stops the run, because that
 * admin-users ignored the flag (not deployed yet) and may have texted.
 */
export async function runInvites({
  invites,
  invoke,
  delayMs = 1500,
  limit,
  log = () => {},
  sleep,
  vehiclesByEmail,
  syncVehicles,
  sendSms = false,
  stopOnSmsFailure = true,
}) {
  const wait = sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  const queue = typeof limit === 'number' ? invites.slice(0, limit) : invites
  const results = []
  for (const [index, invite] of queue.entries()) {
    if (index > 0) await wait(delayMs)
    let response
    try {
      response = await invoke({ ...invite.body, send_sms: sendSms })
    } catch (error) {
      response = { status: 0, body: { error: error instanceof Error ? error.message : String(error) } }
    }
    const message = response.body?.error ?? response.body?.message ?? ''
    let outcome
    if (response.status === 200 && response.body?.ok) outcome = 'invited'
    else if (response.status === 409 && message === ALREADY_EXISTS) outcome = 'exists'
    else if ((response.status === 400 || response.status === 409) && ROW_PROBLEMS.has(message)) {
      outcome = 'failed'
    } else outcome = 'stopped'
    const result = { line: invite.line, email: invite.body.email, outcome, status: response.status, message }
    if (outcome === 'invited' && typeof response.body?.sms === 'string') result.sms = response.body.sms
    const wanted = vehiclesByEmail?.get(invite.body.email) ?? []
    if (syncVehicles && wanted.length && (outcome === 'invited' || outcome === 'exists')) {
      try {
        const userId = outcome === 'invited' ? response.body?.user_id ?? null : null
        const { added, skipped } = await syncVehicles({ email: invite.body.email, userId, vehicles: wanted })
        result.vehicles_added = added
        result.vehicles_skipped = skipped
      } catch (error) {
        // The user exists now; a re-run skips them and retries only the missing cars.
        result.outcome = 'stopped'
        result.message = `רכבים: ${error instanceof Error ? error.message : String(error)}`
      }
    }
    // An SMS failure on one invite will almost surely hit every row (provider,
    // sender or credit), so stop unless told otherwise. That user has the email.
    if (stopOnSmsFailure && result.outcome === 'invited' && result.sms === 'failed') {
      result.outcome = 'stopped'
      result.message = `${result.message ? `${result.message}; ` : ''}SMS נכשל (המייל נשלח)`
    }
    if (!sendSms && result.outcome === 'invited' && result.sms !== 'off') {
      result.outcome = 'stopped'
      result.message = `${result.message ? `${result.message}; ` : ''}השרת התעלם מ-send_sms: false (admin-users לא פרוס?), ייתכן שנשלח SMS`
    }
    results.push(result)
    const cars = result.vehicles_added === undefined ? '' : ` רכבים +${result.vehicles_added} (קיימים ${result.vehicles_skipped})`
    const sms = result.sms ? ` SMS ${result.sms}` : ''
    log(`שורה ${invite.line} ${invite.body.email}: ${result.outcome}${result.message ? ` (${result.message})` : ''}${sms}${cars}`)
    if (result.outcome === 'stopped') break
  }
  return results
}

export function resultsCsv(results) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const lines = [['line', 'email', 'outcome', 'status', 'message', 'vehicles_added', 'vehicles_skipped', 'sms'].join(',')]
  for (const r of results) {
    lines.push([r.line, esc(r.email), r.outcome, r.status, esc(r.message), r.vehicles_added ?? '', r.vehicles_skipped ?? '', r.sms ?? ''].join(','))
  }
  return `﻿${lines.join('\r\n')}\r\n`
}

/** Digits only: "12-345-67", "12.345.67" and "12 345 67" are the same car. */
export const plateDigits = (raw) => String(raw ?? '').replace(/[\s\-.]/g, '')

const VEHICLE_HEADERS = {
  email: HEADERS.email,
  plate: ['plate', 'plate_number', 'מספררכב', 'לוחיתרישוי', 'רכב'],
  model: ['model', 'דגם', 'יצרןודגם'],
  shared: ['shared', 'משותף'],
}
const OPTIONAL_VEHICLE_COLUMNS = new Set(['shared'])
const YES = new Set(['כן', 'yes', 'true', '1'])

/**
 * Vehicles CSV (one car per row, keyed by email, in order: the first car of
 * a person becomes רכב ראשי). Every email must be in the invite list. Returns
 * every problem at once; the caller sends nothing unless `errors` is empty.
 * The same plate twice for one person is always an error. The same plate under
 * two people is an error unless every row of that plate is marked shared
 * (`משותף` = כן): members who really share a car, approved one by one.
 */
export function buildVehicles(rows, invites) {
  const errors = []
  const byEmail = new Map()
  if (rows.length < 2) return { byEmail, errors: ['קובץ הרכבים ריק או שחסרה שורת כותרות.'] }
  const header = rows[0].map(squash)
  const column = {}
  for (const [key, aliases] of Object.entries(VEHICLE_HEADERS)) {
    const index = header.findIndex((h) => aliases.includes(h))
    if (index >= 0) column[key] = index
    else if (!OPTIONAL_VEHICLE_COLUMNS.has(key)) errors.push(`קובץ רכבים - חסרה עמודה: ${key}`)
  }
  if (errors.length) return { byEmail, errors }
  const invited = new Set(invites.map((i) => i.body.email))
  const owner = new Map()
  rows.slice(1).forEach((cells, i) => {
    const line = i + 2
    const email = String(cells[column.email] ?? '').trim().toLowerCase()
    const plate = plateDigits(cells[column.plate])
    const model = String(cells[column.model] ?? '').replace(/\s+/g, ' ').trim()
    const shared = column.shared !== undefined && YES.has(squash(cells[column.shared]))
    const problems = []
    if (!invited.has(email)) problems.push(`דוא״ל לא ברשימת ההזמנות: ${email}`)
    if (!/^\d{7,8}$/.test(plate)) problems.push(`מספר רכב חייב 7 או 8 ספרות: ${cells[column.plate] ?? ''}`)
    if (!model) problems.push('חסר דגם')
    const seen = plate ? owner.get(plate) : undefined
    if (seen?.lines.has(email)) problems.push(`רכב כפול לאותו אדם (שורה ${seen.lines.get(email)})`)
    else if (seen && !(seen.shared && shared)) {
      problems.push(`אותו רכב אצל שני אנשים (שורה ${seen.lines.values().next().value}) - מותר רק אם כל השורות מסומנות משותף`)
    }
    if (plate && !seen) owner.set(plate, { lines: new Map([[email, line]]), shared })
    else if (seen && !seen.lines.has(email)) {
      seen.lines.set(email, line)
      seen.shared = seen.shared && shared
    }
    if (problems.length) {
      errors.push(`קובץ רכבים שורה ${line}: ${problems.join(', ')}`)
      return
    }
    if (!byEmail.has(email)) byEmail.set(email, [])
    byEmail.get(email).push({ plate_number: plate, model })
  })
  return { byEmail, errors }
}

/**
 * Adds the cars a user is missing, one insert at a time and in file order (so
 * the first one becomes רכב ראשי through the DB trigger). A plate the user
 * already has is skipped, so a re-run never duplicates. `api` is
 * { findUserId(email), listPlates(userId), insert(userId, vehicle) }; insert
 * returns 'inserted' or 'duplicate' and throws on anything else.
 */
export async function syncUserVehicles({ email, userId, vehicles, api }) {
  const id = userId ?? (await api.findUserId(email))
  if (!id) throw new Error('המשתמש לא נמצא לפי דוא״ל')
  const have = new Set((await api.listPlates(id)).map(plateDigits))
  let added = 0
  let skipped = 0
  for (const vehicle of vehicles) {
    const plate = plateDigits(vehicle.plate_number)
    if (have.has(plate)) {
      skipped += 1
      continue
    }
    const outcome = await api.insert(id, { plate_number: plate, model: vehicle.model })
    if (outcome === 'duplicate') skipped += 1
    else added += 1
    have.add(plate)
  }
  return { added, skipped }
}
