import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  SHOW_OTHERS_CREATED_EVENTS_LABEL,
  readShowOthersCreatedEvents,
  shouldFilterUnitEventsToOwnCreated,
  unitEventsCreatedByFilter,
  writeShowOthersCreatedEvents,
} from './unitEventsScope'

const migrationsDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../supabase/migrations')

describe('shouldFilterUnitEventsToOwnCreated', () => {
  it('is true only for אחמ״ש without admin or SuperAdmin', () => {
    expect(shouldFilterUnitEventsToOwnCreated(['shift_lead'])).toBe(true)
    expect(shouldFilterUnitEventsToOwnCreated(['shift_lead', 'responder'])).toBe(true)
  })

  it('is false for admin even when they also have shift_lead', () => {
    expect(shouldFilterUnitEventsToOwnCreated(['admin'])).toBe(false)
    expect(shouldFilterUnitEventsToOwnCreated(['admin', 'shift_lead'])).toBe(false)
    expect(shouldFilterUnitEventsToOwnCreated(['admin', 'shift_lead', 'responder'])).toBe(false)
  })

  it('is false for SuperAdmin even when they also have shift_lead', () => {
    expect(shouldFilterUnitEventsToOwnCreated(['super_admin'])).toBe(false)
    expect(shouldFilterUnitEventsToOwnCreated(['super_admin', 'shift_lead'])).toBe(false)
    expect(shouldFilterUnitEventsToOwnCreated(['admin', 'super_admin', 'shift_lead'])).toBe(false)
  })

  it('is false for responders and empty roles', () => {
    expect(shouldFilterUnitEventsToOwnCreated(['responder'])).toBe(false)
    expect(shouldFilterUnitEventsToOwnCreated([])).toBe(false)
  })
})

describe('unitEventsCreatedByFilter', () => {
  it('defaults a lead-only viewer to their own shift_lead_id', () => {
    expect(
      unitEventsCreatedByFilter({
        roles: ['shift_lead'],
        showOthersCreated: false,
        userId: 'lead-a',
      }),
    ).toBe('lead-a')
  })

  it('returns null when the lead-only toggle is on', () => {
    expect(
      unitEventsCreatedByFilter({
        roles: ['shift_lead', 'responder'],
        showOthersCreated: true,
        userId: 'lead-a',
      }),
    ).toBeNull()
  })

  it('never filters admin or SuperAdmin', () => {
    expect(
      unitEventsCreatedByFilter({
        roles: ['admin', 'shift_lead'],
        showOthersCreated: false,
        userId: 'admin-1',
      }),
    ).toBeNull()
    expect(
      unitEventsCreatedByFilter({
        roles: ['super_admin'],
        showOthersCreated: false,
        userId: 'sa-1',
      }),
    ).toBeNull()
  })

  it('returns null when the viewer id is missing', () => {
    expect(
      unitEventsCreatedByFilter({
        roles: ['shift_lead'],
        showOthersCreated: false,
        userId: undefined,
      }),
    ).toBeNull()
  })
})

describe('show-others session stash', () => {
  it('uses the locked Hebrew label', () => {
    expect(SHOW_OTHERS_CREATED_EVENTS_LABEL).toBe('הצג אירועים שנוצרו על ידי אחרים')
  })

  it('defaults off and persists only for the session store', () => {
    const store = memoryStorage()
    expect(readShowOthersCreatedEvents(store)).toBe(false)
    writeShowOthersCreatedEvents(true, store)
    expect(readShowOthersCreatedEvents(store)).toBe(true)
    writeShowOthersCreatedEvents(false, store)
    expect(readShowOthersCreatedEvents(store)).toBe(false)
  })
})

describe('search_unit_event_ids creator filter', () => {
  const sql = readFileSync(
    resolve(migrationsDir, '20260902190000_search_unit_event_ids_shift_lead.sql'),
    'utf8',
  )

  it('adds an optional p_shift_lead_id and applies it in the where clause', () => {
    expect(sql).toMatch(/p_shift_lead_id uuid default null/)
    expect(sql).toMatch(/p_shift_lead_id is null or e\.shift_lead_id = p_shift_lead_id/)
  })
})

function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear() {
      data.clear()
    },
    getItem(key: string) {
      return data.get(key) ?? null
    },
    key(index: number) {
      return [...data.keys()][index] ?? null
    },
    removeItem(key: string) {
      data.delete(key)
    },
    setItem(key: string, value: string) {
      data.set(key, value)
    },
  }
}
