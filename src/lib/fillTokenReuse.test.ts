import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const srcDir = resolve(import.meta.dirname)
const repoRoot = resolve(srcDir, '../..')

describe('fill-email link reuse', () => {
  it('loads and saves with the session-less client so a stale JWT cannot fake-expire the link', () => {
    const src = readFileSync(resolve(srcDir, 'responderFillToken.ts'), 'utf8')
    expect(src).toContain("import { supabase, supabaseAnon } from './supabase'")
    expect(src).toMatch(/loadFillByToken[\s\S]*?supabaseAnon\.functions\.invoke\('responder-fill'/)
    expect(src).toMatch(/saveFillByToken[\s\S]*?supabaseAnon\.functions\.invoke\('responder-fill'/)
    expect(src).toMatch(/notifyFillReady[\s\S]*?supabase\.functions\.invoke\('responder-fill'/)
  })

  it('never persists a user session on the fill-token client', () => {
    const src = readFileSync(resolve(srcDir, 'supabase.ts'), 'utf8')
    expect(src).toContain('export const supabaseAnon')
    expect(src).toMatch(/export const supabaseAnon = createClient\([\s\S]*persistSession: false/)
    expect(src).toMatch(/export const supabaseAnon = createClient\([\s\S]*autoRefreshToken: false/)
  })

  it('deploys responder-fill without gateway JWT verification', () => {
    const yml = readFileSync(
      resolve(repoRoot, '.github/workflows/deploy-edge-functions.yml'),
      'utf8',
    )
    expect(yml).toMatch(
      /for fn in partner-auth responder-api responder-track ios-enroll responder-fill/,
    )
    expect(yml).toContain('20261007120000_fill_token_stretch_remaining.sql')
    expect(yml).not.toMatch(
      /for fn in admin-users phone-otp responder-fill send-email unit-broadcast user-feedback/,
    )
  })

  it('stretches leftover short-lived hashes to 180 days and does not consume on load or save', () => {
    const sql = readFileSync(
      resolve(repoRoot, 'supabase/migrations/20261007120000_fill_token_stretch_remaining.sql'),
      'utf8',
    )
    expect(sql).toContain("interval '180 days'")
    expect(sql).toContain("interval '14 days'")
    expect(sql).toContain('fill_token_hash is not null')

    const edge = readFileSync(
      resolve(repoRoot, 'supabase/functions/responder-fill/index.ts'),
      'utf8',
    )
    expect(edge).toContain('do not')
    expect(edge).toMatch(/Opening or refreshing the same email link must keep working/)
    expect(edge).toMatch(/Draft save must not burn the link/)
    expect(edge).not.toMatch(/fill_token_hash:\s*null/)
    expect(edge).not.toMatch(/fill_token_expires_at:\s*null/)
  })
})
