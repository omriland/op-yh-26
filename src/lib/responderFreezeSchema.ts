import { supabase } from './supabase'

/**
 * Participation-level freeze columns arrive with
 * `20260910140000_responder_level_event_freeze.sql`. PostgREST fails the whole
 * query when a selected column is missing, so every select that wants them goes
 * through this token and drops them while the migration is still pending.
 *
 * Use the token as a standalone list item followed by another field — it
 * carries its own trailing comma so dropping it never leaves `,,`.
 */
export const RESPONDER_FREEZE_FIELDS = '__responder_freeze_fields__'

const COLUMNS = 'frozen_over_60km, frozen_suspicious_duplicate,'

/** Postgres `undefined_column`. */
const UNDEFINED_COLUMN = '42703'

let probe: Promise<boolean> | null = null

async function detect(): Promise<boolean> {
  const { error } = await supabase.from('event_responders').select('frozen_over_60km').limit(1)
  // Anything other than "no such column" (RLS, offline, auth) keeps the columns:
  // a transient failure must not silently downgrade the whole session.
  return error?.code !== UNDEFINED_COLUMN
}

export function hasResponderFreezeColumns(): Promise<boolean> {
  probe ??= detect()
  return probe
}

/** Resolve the freeze token in a select, probing the schema once per session. */
export async function withResponderFreeze(select: string): Promise<string> {
  const columns = (await hasResponderFreezeColumns()) ? COLUMNS : ''
  return select.split(RESPONDER_FREEZE_FIELDS).join(columns)
}

export function resetResponderFreezeProbe(): void {
  probe = null
}
