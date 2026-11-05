import { beforeEach, describe, expect, it, vi } from 'vitest'

type Call = { table: string; op: string; filters: [string, unknown][] }
type Result = { data: unknown; error: { message: string } | null }

const { state } = vi.hoisted(() => ({
  state: {
    calls: [] as Call[],
    handler: (() => ({ data: null, error: null })) as (call: Call) => Result,
    rpc: (() => ({ data: null, error: null })) as (name: string) => Result,
  },
}))

vi.mock('./supabase', () => {
  function from(table: string) {
    const call: Call = { table, op: 'select', filters: [] }
    const run = () => {
      state.calls.push(call)
      return Promise.resolve(state.handler(call))
    }
    const builder = {
      select() {
        return builder
      },
      update() {
        call.op = 'update'
        return builder
      },
      insert() {
        call.op = 'insert'
        return builder
      },
      delete() {
        call.op = 'delete'
        return builder
      },
      eq(column: string, value: unknown) {
        call.filters.push([column, value])
        return builder
      },
      in() {
        return builder
      },
      order() {
        return builder
      },
      maybeSingle: run,
      single: run,
      then(resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) {
        return run().then(resolve, reject)
      },
    }
    return builder
  }
  return {
    supabase: {
      from,
      rpc: (name: string) => Promise.resolve(state.rpc(name)),
    },
  }
})

import { saveShiftForm, type ShiftFormDraft } from './shiftForm'
import { SHIFT_TOO_EARLY_MESSAGE } from './shifts'
import { STALE_SAVE_MESSAGE } from './shiftBornEvents'

const draft: ShiftFormDraft = {
  id: 's1',
  status: 'in_progress',
  shift_date: '2026-11-01',
  shift_kind: 'morning',
  vehicle_type: 'patrol_north',
  personal_vehicle_id: null,
  responder_ids: ['u1'],
  event_ids: [],
  odometer_start: null,
  odometer_end: null,
  total_km: null,
  notes: '',
  event_type_counts: [],
  treated_vehicle_counts: [],
  cancelled_count: 0,
  expected_updated_at: 't1',
}

beforeEach(() => {
  state.calls = []
  state.handler = () => ({ data: null, error: null })
  state.rpc = () => ({ data: null, error: null })
})

describe('saveShiftForm after the shift row is written', () => {
  it('hands back the new token when a later step fails, so a retry is not stale', async () => {
    state.handler = (call) => {
      if (call.table === 'shifts' && call.op === 'update') {
        return { data: { id: 's1', updated_at: 't2' }, error: null }
      }
      if (call.table === 'shift_responders') return { data: null, error: { message: 'down' } }
      return { data: [], error: null }
    }
    const result = await saveShiftForm(draft, 'lead')
    expect(result).toMatchObject({ ok: false, saved: { shiftId: 's1', updated_at: 't2' } })
  })

  it('shows the server refusal for lowering another lead’s event count as-is', async () => {
    const message = 'אין הרשאה למחוק אירוע שנוצר על ידי אחמ״ש אחר.'
    state.handler = (call) =>
      call.table === 'shifts' && call.op === 'update'
        ? { data: { id: 's1', updated_at: 't2' }, error: null }
        : { data: [], error: null }
    state.rpc = () => ({ data: null, error: { message } })
    const result = await saveShiftForm(draft, 'lead')
    expect(result).toMatchObject({ ok: false, error: message })
  })
})

describe('saveShiftForm for a crew member', () => {
  const crew = { syncResponders: false, canEditIdentity: false }

  it('names the date rule, not a stale save, before the shift date', async () => {
    const result = await saveShiftForm({ ...draft, shift_date: '2999-01-01' }, 'u1', crew)
    expect(result).toEqual({ ok: false, error: SHIFT_TOO_EARLY_MESSAGE })
    expect(state.calls.some((call) => call.op === 'update')).toBe(false)
  })

  it('names the date rule when a lead moved the shift ahead while the form was open', async () => {
    state.handler = (call) => {
      if (call.table === 'shifts' && call.op === 'update') return { data: null, error: null }
      if (call.table === 'shifts') return { data: { shift_date: '2999-01-01' }, error: null }
      return { data: [], error: null }
    }
    const result = await saveShiftForm(draft, 'u1', crew)
    expect(result).toEqual({ ok: false, error: SHIFT_TOO_EARLY_MESSAGE })
  })

  it('still reports a stale save when the date is not the reason', async () => {
    state.handler = (call) => {
      if (call.table === 'shifts' && call.op === 'update') return { data: null, error: null }
      if (call.table === 'shifts') return { data: { shift_date: '2026-11-01' }, error: null }
      return { data: [], error: null }
    }
    const result = await saveShiftForm(draft, 'u1', crew)
    expect(result).toEqual({ ok: false, error: STALE_SAVE_MESSAGE })
  })
})

describe('saveShiftForm personal vehicle', () => {
  const personal = { ...draft, vehicle_type: 'personal' as const, personal_vehicle_id: 'v1' }

  it('keeps an archived vehicle the shift already had', async () => {
    state.handler = (call) => {
      if (call.table === 'vehicles') return { data: { user_id: 'u1', archived: true }, error: null }
      if (call.table === 'shifts' && call.op === 'select') {
        return { data: { personal_vehicle_id: 'v1' }, error: null }
      }
      if (call.table === 'shifts') return { data: { id: 's1', updated_at: 't2' }, error: null }
      return { data: [], error: null }
    }
    const result = await saveShiftForm(personal, 'lead')
    expect(result.ok).toBe(true)
  })

  it('refuses a newly picked archived vehicle and says what to do', async () => {
    state.handler = (call) => {
      if (call.table === 'vehicles') return { data: { user_id: 'u1', archived: true }, error: null }
      if (call.table === 'shifts') return { data: { personal_vehicle_id: 'v0' }, error: null }
      return { data: [], error: null }
    }
    const result = await saveShiftForm(personal, 'lead')
    expect(result).toMatchObject({
      ok: false,
      error: 'לא ניתן לשייך רכב בארכיון למשמרת. יש לבחור לוחית אחרת.',
    })
  })
})
