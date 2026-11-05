/**
 * Saved views (תצוגות) for the unit אירועים list, per user.
 *
 * Home is `event_filter_presets` (own rows only, RLS). Until that migration is
 * applied the table is missing, so presets live in this browser's localStorage
 * instead; both lists are shown, and ids say which store a preset is in.
 */

import { parseView, serializeView, type EventListView } from './eventFilters'
import { supabase } from './supabase'

export type EventFilterPreset = { id: string; name: string; view: EventListView }

export const PRESET_NAME_MAX = 40
export const DEFAULT_PRESET_ID = 'default'
export const DEFAULT_PRESET_NAME = 'ברירת מחדל'

const LOCAL_PREFIX = 'local:'

export function presetNameError(
  name: string,
  existing: readonly EventFilterPreset[],
): string | null {
  const trimmed = name.trim()
  if (!trimmed) return 'יש להזין שם לתצוגה.'
  if (trimmed.length > PRESET_NAME_MAX) return `עד ${PRESET_NAME_MAX} תווים.`
  const key = trimmed.toLocaleLowerCase('he')
  if (
    key === DEFAULT_PRESET_NAME ||
    existing.some((preset) => preset.name.trim().toLocaleLowerCase('he') === key)
  ) {
    return PRESET_DUPLICATE_NAME
  }
  return null
}

/** Rows from the table or from localStorage; anything malformed is skipped. */
export function parsePresetRows(rows: unknown): EventFilterPreset[] {
  if (!Array.isArray(rows)) return []
  return rows.flatMap((row) => {
    if (!row || typeof row !== 'object') return []
    const { id, name, view } = row as { id?: unknown; name?: unknown; view?: unknown }
    if (typeof id !== 'string' || typeof name !== 'string' || !name.trim()) return []
    const parsed = parseView(view)
    return parsed ? [{ id, name: name.trim(), view: parsed }] : []
  })
}

export function isLocalPreset(id: string): boolean {
  return id.startsWith(LOCAL_PREFIX)
}

export const PRESET_DUPLICATE_NAME = 'כבר קיימת תצוגה בשם זה.'

/** The name is taken: the unique index said so (another tab or device saved it first). */
export class DuplicatePresetNameError extends Error {
  constructor() {
    super(PRESET_DUPLICATE_NAME)
  }
}

/** The table is not there yet (migration not applied). Any other error is a real failure. */
export function isMissingPresetTable(error: { code?: string; message?: string } | null): boolean {
  return error?.code === 'PGRST205' || error?.code === '42P01'
}

function byName(a: EventFilterPreset, b: EventFilterPreset): number {
  return a.name.localeCompare(b.name, 'he')
}

/**
 * Which browser-only views to copy into the table once it exists: those whose
 * name the table does not already hold (case-insensitive), first one per name.
 */
export function localPresetsToMigrate(
  local: readonly EventFilterPreset[],
  table: readonly EventFilterPreset[],
): EventFilterPreset[] {
  const taken = new Set(table.map((preset) => preset.name.trim().toLocaleLowerCase('he')))
  return local.filter((preset) => {
    const key = preset.name.trim().toLocaleLowerCase('he')
    if (taken.has(key)) return false
    taken.add(key)
    return true
  })
}

function localKey(userId: string): string {
  return `yahpaz:eventFilterPresets:${userId}`
}

function localStore(storage?: Storage | null): Storage | null {
  return storage ?? (typeof localStorage === 'undefined' ? null : localStorage)
}

export function readLocalPresets(userId: string, storage?: Storage | null): EventFilterPreset[] {
  try {
    const raw = localStore(storage)?.getItem(localKey(userId))
    return raw ? parsePresetRows(JSON.parse(raw)) : []
  } catch {
    return []
  }
}

export function writeLocalPresets(
  userId: string,
  presets: readonly EventFilterPreset[],
  storage?: Storage | null,
): boolean {
  try {
    const store = localStore(storage)
    if (!store) return false
    store.setItem(localKey(userId), JSON.stringify(presets))
    return true
  } catch {
    return false
  }
}

/** Once a request says the table is missing, stop asking for this page load. */
let tableMissing = false

export async function listPresets(userId: string): Promise<EventFilterPreset[]> {
  const local = readLocalPresets(userId)
  if (tableMissing) return [...local].sort(byName)
  const { data, error } = await supabase
    .from('event_filter_presets')
    .select('id, name, view')
    .order('name', { ascending: true })
  if (error) {
    if (isMissingPresetTable(error)) {
      tableMissing = true
      return [...local].sort(byName)
    }
    throw new Error(error.message)
  }
  const table = parsePresetRows(data)
  if (local.length === 0) return table.sort(byName)
  return [...table, ...(await migrateLocalPresets(userId, local, table))].sort(byName)
}

/** Copies browser-only views into the table, then forgets them. Returns what could not move. */
async function migrateLocalPresets(
  userId: string,
  local: EventFilterPreset[],
  table: EventFilterPreset[],
): Promise<EventFilterPreset[]> {
  const moving = localPresetsToMigrate(local, table)
  if (moving.length > 0) {
    const { data, error } = await supabase
      .from('event_filter_presets')
      .insert(moving.map((preset) => ({ user_id: userId, name: preset.name, view: serializeView(preset.view) })))
      .select('id, name, view')
    if (error) return local
    writeLocalPresets(userId, [])
    return parsePresetRows(data)
  }
  writeLocalPresets(userId, [])
  return []
}

export async function savePreset(
  userId: string,
  name: string,
  view: EventListView,
): Promise<EventFilterPreset> {
  const trimmed = name.trim()
  if (!tableMissing) {
    const { data, error } = await supabase
      .from('event_filter_presets')
      .insert({ user_id: userId, name: trimmed, view: serializeView(view) })
      .select('id, name, view')
      .single()
    if (!error) {
      const [saved] = parsePresetRows([data])
      if (saved) return saved
      throw new Error('preset row did not parse')
    }
    if (error.code === '23505') throw new DuplicatePresetNameError()
    if (!isMissingPresetTable(error)) throw new Error(error.message)
    tableMissing = true
  }
  if (presetNameError(trimmed, readLocalPresets(userId)) === PRESET_DUPLICATE_NAME) {
    throw new DuplicatePresetNameError()
  }
  const saved: EventFilterPreset = {
    id: `${LOCAL_PREFIX}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: trimmed,
    view,
  }
  if (!writeLocalPresets(userId, [...readLocalPresets(userId), { ...saved, view: serializeView(view) }])) {
    throw new Error('localStorage unavailable')
  }
  return saved
}

export async function deletePreset(userId: string, id: string): Promise<void> {
  if (isLocalPreset(id)) {
    const next = readLocalPresets(userId).filter((preset) => preset.id !== id)
    if (!writeLocalPresets(userId, next)) throw new Error('localStorage unavailable')
    return
  }
  const { error } = await supabase.from('event_filter_presets').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
