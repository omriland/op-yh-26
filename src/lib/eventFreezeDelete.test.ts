import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const migrationsDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../supabase/migrations')

function freezeSql(): string {
  return [
    '20260820120000_event_freeze.sql',
    '20260820133000_event_freeze_report_lists.sql',
    '20260820140000_event_freeze_delete_skip_self.sql',
    '20260820151000_event_freeze_delete_skip_cascade_refresh.sql',
  ]
    .map((name) => readFileSync(resolve(migrationsDir, name), 'utf8'))
    .join('\n')
}

function lastFunctionDef(sql: string, name: string): string {
  const marker = `create or replace function public.${name}`
  const start = sql.toLowerCase().lastIndexOf(marker)
  if (start < 0) throw new Error(`missing ${name}`)
  const rest = sql.slice(start)
  const end = rest.toLowerCase().indexOf('$$;', marker.length)
  if (end < 0) throw new Error(`unclosed ${name}`)
  return rest.slice(0, end)
}

describe('deleteEvent', () => {
  it('deletes only the given event id', () => {
    const src = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), './events.ts'),
      'utf8',
    )
    const fn = src.slice(src.indexOf('export async function deleteEvent'))
    const body = fn.slice(0, fn.indexOf('export async function approveEventFreeze'))
    expect(body).toContain(".eq('id', eventId)")
    expect(body.toLowerCase()).not.toContain('.in(')
  })
})

describe('event freeze delete triggers', () => {
  it('does not UPDATE the events row from BEFORE DELETE (Postgres aborts the delete)', () => {
    const sql = freezeSql()
    const beforeDelete = lastFunctionDef(sql, 'events_before_delete_refresh_freeze')
    expect(beforeDelete).toContain("yahpaz.deleting_event_id")
    expect(beforeDelete.toLowerCase()).not.toContain('perform public.refresh_event_freeze')
  })

  it('skips freeze refresh for the event being deleted', () => {
    const refresh = lastFunctionDef(freezeSql(), 'refresh_event_freeze')
    expect(refresh).toContain("yahpaz.deleting_event_id")
  })

  it('recomputes sibling freeze flags after the event row is gone', () => {
    const afterDelete = lastFunctionDef(freezeSql(), 'events_after_delete_refresh_freeze')
    expect(afterDelete.toLowerCase()).toContain('refresh_event_freeze_for_responder_day')
  })

  it('does not refresh freeze from CASCADE event_responders DELETE (half-deleted cluster would unfreeze siblings)', () => {
    const responderTrigger = lastFunctionDef(freezeSql(), 'event_responders_refresh_freeze')
    expect(responderTrigger).toContain('yahpaz.deleting_event_id')
    expect(responderTrigger.toLowerCase()).toContain("if tg_op = 'delete'")
  })

  it('never deletes sibling events from freeze triggers', () => {
    const sql = freezeSql().toLowerCase()
    const freezeFns = [
      'refresh_event_freeze',
      'refresh_event_freeze_for_responder_day',
      'events_before_delete_refresh_freeze',
      'events_after_delete_refresh_freeze',
      'event_responders_refresh_freeze',
    ]
    for (const name of freezeFns) {
      const def = lastFunctionDef(sql, name)
      expect(def).not.toMatch(/delete\s+from\s+public\.events/)
    }
  })

  it('sees in-transaction sibling rows when matching duplicates after delete', () => {
    const match = lastFunctionDef(freezeSql(), 'event_matches_suspicious_duplicate')
    expect(match.toLowerCase()).toContain('volatile')
  })
})
