import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')
const sql = readFileSync(resolve(root, 'supabase/migrations/20261108150000_app_search.sql'), 'utf8')

function header(name: string): string {
  const start = sql.indexOf(`create or replace function ${name}(`)
  return sql.slice(start, sql.indexOf('as $$', start))
}

// The behaviour is tested on a real database (scripts/smart-search/test/security-matrix.sql);
// these guard the shape that keeps it safe.
describe('app_search migration', () => {
  it('runs app_search as the caller so RLS scopes every row', () => {
    expect(header('public.app_search')).toContain('security invoker')
    expect(header('public.app_search')).not.toContain('security definer')
  })
  it('keeps phone and email matching for admins only', () => {
    expect(sql).toContain("case when v_is_admin then concat_ws(' ', p.phone")
    expect(sql).toContain("|| case when v_is_admin then jsonb_build_object(\n          'phone', k.phone,")
  })
  it('gates the archive to admins inside a definer function and audits per typing session', () => {
    const archive = header('public.app_search_archive')
    expect(archive).toContain('security definer')
    expect(sql).toContain("raise exception 'not authorized to read the legacy event archive' using errcode = '42501'")
    expect(sql).toContain('on conflict (actor_user_id, search_session) where search_session is not null do update')
    expect(sql).toContain('revoke all on function legacy.archive_search(jsonb, int) from public, anon, authenticated')
  })
  it('does not redefine the functions the deploy workflow replays from older files', () => {
    for (const name of ['public.admin_search(', 'public.admin_search_archive(', 'public.log_smart_search(']) {
      expect(sql).not.toContain(`create or replace function ${name}`)
    }
  })
  it('lets any signed-in user log, but not read, the search log', () => {
    expect(header('public.app_search_log')).toContain('security definer')
    expect(sql).toContain('grant execute on function public.app_search_log(text, jsonb, text, int, text) to authenticated')
    expect(sql).not.toMatch(/grant select on table public\.smart_search_log/)
  })
  it('withholds every new function from anon', () => {
    for (const fn of ['app_search(jsonb, text, int)', 'app_search_archive(jsonb, uuid, int)', 'app_search_log(text, jsonb, text, int, text)']) {
      expect(sql).toContain(`revoke all on function public.${fn} from public, anon`)
    }
  })
})
