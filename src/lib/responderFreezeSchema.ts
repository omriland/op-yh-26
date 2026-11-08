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

/**
 * `events.lead_km_owed` is a computed column from
 * `20261108120000_event_lifecycle_release.sql`. It answers "does the אחמ״ש still
 * owe ק״מ" with every volunteer's car in view, which a plain כונן's own query
 * cannot see. Same token rules as the freeze fields.
 */
export const EVENT_LEAD_KM_FIELD = '__event_lead_km_field__'

const LEAD_KM_COLUMN = 'lead_km_owed,'

let leadKmProbe: Promise<boolean> | null = null

async function detectLeadKm(): Promise<boolean> {
  const { error } = await supabase.from('events').select('lead_km_owed').limit(1)
  return error?.code !== UNDEFINED_COLUMN
}

export function hasEventLeadKmColumn(): Promise<boolean> {
  leadKmProbe ??= detectLeadKm()
  return leadKmProbe
}

/** Resolve the schema tokens in a select, probing each column once per session. */
export async function withResponderFreeze(select: string): Promise<string> {
  const columns = (await hasResponderFreezeColumns()) ? COLUMNS : ''
  let resolved = select.split(RESPONDER_FREEZE_FIELDS).join(columns)
  if (resolved.includes(EVENT_LEAD_KM_FIELD)) {
    const leadKm = (await hasEventLeadKmColumn()) ? LEAD_KM_COLUMN : ''
    resolved = resolved.split(EVENT_LEAD_KM_FIELD).join(leadKm)
  }
  return resolved
}

export function resetResponderFreezeProbe(): void {
  probe = null
  leadKmProbe = null
}
