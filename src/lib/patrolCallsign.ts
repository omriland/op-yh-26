import { digitsOnly } from './format'

/** Optional כינוי — short free text. */
export const PATROL_CALLSIGN_PREFIX_MAX_LENGTH = 16
/** Required מספר — digits only. */
export const PATROL_CALLSIGN_NUMBER_MAX_LENGTH = 5

export const PATROL_CALLSIGN_PREFIX_LABEL = 'אוק - כינוי'
export const PATROL_CALLSIGN_NUMBER_LABEL = 'אוק - מס'
export const PATROL_CALLSIGN_PREFIX_PLACEHOLDER = 'אביב'
export const PATROL_CALLSIGN_NUMBER_PLACEHOLDER = '411'
export const PATROL_CALLSIGN_NUMBER_ERROR = 'יש למלא אוק - מס.'

export type SplitPatrolCallsign = {
  prefix: string
  number: string
}

/**
 * Split a legacy `או״ק ניידת` value into prefix + number.
 *
 * Rule (also used in the SQL backfill):
 * - Find the **last** contiguous digit run in the trimmed string.
 * - That run → callsign number (first 5 digits if longer).
 * - Everything else, whitespace-collapsed and trimmed → prefix.
 * - Digits-only → number only.
 * - No digits → prefix only.
 *
 * Examples: `411` → number; `אביב` → prefix; `אביב 411` / `אביב411` → both;
 * `אביב 411 ב` → number `411`, prefix `אביב ב`.
 */
export function splitPatrolCallsign(raw: string | null | undefined): SplitPatrolCallsign {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return { prefix: '', number: '' }

  const match = trimmed.match(/^(.*?)(\d+)(?!.*\d)(.*)$/)
  if (!match) return { prefix: trimmed, number: '' }

  const number = match[2]!.slice(0, PATROL_CALLSIGN_NUMBER_MAX_LENGTH)
  const prefix = `${match[1] ?? ''}${match[3] ?? ''}`.replace(/\s+/g, ' ').trim()
  return { prefix, number }
}

export function formatPatrolCallsign(
  prefix: string | null | undefined,
  number: string | null | undefined,
): string {
  const parts = [(prefix ?? '').trim(), (number ?? '').trim()].filter(Boolean)
  return parts.join(' ')
}

export function patrolCallsignPrefixForInput(raw: string): string {
  return raw.slice(0, PATROL_CALLSIGN_PREFIX_MAX_LENGTH)
}

export function patrolCallsignNumberForInput(raw: string): string {
  return digitsOnly(raw).slice(0, PATROL_CALLSIGN_NUMBER_MAX_LENGTH)
}

/** Prefer split columns; fall back to parsing the legacy combined value. */
export function resolvePatrolCallsign(input: {
  prefix?: string | null
  number?: string | null
  legacy?: string | null
}): SplitPatrolCallsign {
  const prefix = input.prefix ?? ''
  const number = input.number ?? ''
  if (prefix.trim() || number.trim()) {
    return { prefix: prefix.trim(), number: digitsOnly(number) }
  }
  return splitPatrolCallsign(input.legacy)
}
