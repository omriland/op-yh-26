#!/usr/bin/env node
/**
 * Invites members listed in a CSV (Excel: Save As → "CSV UTF-8"). Read
 * README.md in this folder first. Dry run by default: validates every row and
 * prints the plan without any network call.
 *
 *   node scripts/bulk-invite/bulk-invite.mjs members.csv
 *   BULK_INVITE_ALLOW=1 YAHPZ_ADMIN_EMAIL=… YAHPZ_ADMIN_PASSWORD=… SUPABASE_ANON_KEY=… \
 *     node scripts/bulk-invite/bulk-invite.mjs members.csv --send --confirm-production [--limit 3]
 *
 * --send sends a real invite email and SMS to every row.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { buildInvites, parseCsv, resultsCsv, runInvites } from './lib.mjs'

const PRODUCTION_URL = 'https://rtvizpsfvtjowbimugns.supabase.co'

async function signIn(anonKey, email, password) {
  const res = await fetch(`${PRODUCTION_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body.access_token) throw new Error('הכניסה כמנהל נכשלה. בדקו את הדוא״ל והסיסמה.')
  return body.access_token
}

try {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      send: { type: 'boolean', default: false },
      'confirm-production': { type: 'boolean', default: false },
      limit: { type: 'string' },
      'delay-ms': { type: 'string', default: '1500' },
    },
    strict: true,
  })
  const file = positionals[0]
  if (!file) throw new Error('Usage: node scripts/bulk-invite/bulk-invite.mjs <file.csv> [--send --confirm-production] [--limit N]')

  const { invites, errors } = buildInvites(parseCsv(readFileSync(file, 'utf8')))
  if (errors.length) {
    console.error(`${errors.length} problems, nothing was sent:`)
    for (const e of errors) console.error(`  ${e}`)
    process.exit(1)
  }
  const limit = values.limit === undefined ? undefined : Number(values.limit)
  if (limit !== undefined && !(Number.isInteger(limit) && limit > 0)) throw new Error('--limit must be a positive integer')
  const planned = limit === undefined ? invites : invites.slice(0, limit)
  console.log(`${invites.length} rows valid. Plan (${planned.length}):`)
  for (const { line, body } of planned) {
    console.log(`  ${line}. ${body.full_name} · ${body.callsign} · ${body.email} · ${body.roles[0]}`)
  }

  if (!values.send) {
    console.log('Dry run: nothing sent. Add --send --confirm-production (and BULK_INVITE_ALLOW=1) to invite.')
    process.exit(0)
  }
  if (!values['confirm-production'] || process.env.BULK_INVITE_ALLOW !== '1') {
    throw new Error('--send needs --confirm-production and BULK_INVITE_ALLOW=1.')
  }
  const anonKey = process.env.SUPABASE_ANON_KEY
  const adminEmail = process.env.YAHPZ_ADMIN_EMAIL
  const adminPassword = process.env.YAHPZ_ADMIN_PASSWORD
  if (!anonKey || !adminEmail || !adminPassword) {
    throw new Error('Set SUPABASE_ANON_KEY, YAHPZ_ADMIN_EMAIL and YAHPZ_ADMIN_PASSWORD.')
  }
  const accessToken = await signIn(anonKey, adminEmail, adminPassword)

  const results = await runInvites({
    invites,
    limit,
    delayMs: Number(values['delay-ms']),
    log: console.log,
    invoke: async (body) => {
      const res = await fetch(`${PRODUCTION_URL}/functions/v1/admin-users`, {
        method: 'POST',
        headers: {
          apikey: anonKey,
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      return { status: res.status, body: await res.json().catch(() => ({})) }
    },
  })
  const out = `${file}.results.csv`
  writeFileSync(out, resultsCsv(results))
  const count = (o) => results.filter((r) => r.outcome === o).length
  console.log(
    `invited ${count('invited')}, already existed ${count('exists')}, failed ${count('failed')}, ` +
      `stopped ${count('stopped')}, not reached ${planned.length - results.length}. Results: ${out}`,
  )
  if (count('stopped')) process.exit(2)
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
