import { describe, expect, it, vi } from 'vitest'

const { filters } = vi.hoisted(() => ({ filters: [] as [string, string, unknown][] }))

vi.mock('./responderFreezeSchema', () => ({
  RESPONDER_FREEZE_FIELDS: '',
  withResponderFreeze: (select: string) => Promise.resolve(select),
}))

vi.mock('./supabase', () => {
  const builder = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      filters.push(['eq', column, value])
      return builder
    },
    gte: () => builder,
    order: () => Promise.resolve({ data: [], error: null }),
  }
  return { supabase: { from: () => builder } }
})

import { fetchCockpitReel } from './cockpit'

describe('fetchCockpitReel', () => {
  it('lists manual events only: shift-born events belong to the shared shift report', async () => {
    await fetchCockpitReel(new Date('2026-11-03T10:00:00Z'))
    expect(filters).toContainEqual(['eq', 'origin', 'manual'])
  })
})
