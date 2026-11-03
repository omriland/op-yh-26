import { beforeEach, describe, expect, it, vi } from 'vitest'

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: {}, supabaseAnon: { functions: { invoke } } }))

import { loadFillByToken } from './responderFillToken'

describe('loadFillByToken', () => {
  beforeEach(() => invoke.mockReset())

  it('reports a shift-born event so the app can open the shared report', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: {
        context: new Response(JSON.stringify({ error: 'shift_born', event_id: 'ev-1' }), {
          status: 400,
        }),
      },
    })
    expect(await loadFillByToken('tok')).toEqual({
      ok: false,
      code: 'shift_born',
      eventId: 'ev-1',
      error: 'קישור הדיווח אינו תקין או שפג תוקפו.',
    })
  })
})
