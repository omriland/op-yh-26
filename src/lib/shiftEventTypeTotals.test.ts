import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  applyShiftEventTypeChange,
  moveShiftEventTypeCount,
  shiftBornEventTypePatch,
  shiftEventsAfterTypeChange,
} from './shiftEventTypeTotals'

const sql = readFileSync(
  resolve(
    import.meta.dirname,
    '../../supabase/migrations/20261106160000_super_admin_reopen_log_and_shift_event_type.sql',
  ),
  'utf8',
)

describe('shiftBornEventTypePatch', () => {
  it('writes only the type column when it changed', () => {
    expect(shiftBornEventTypePatch('type-a', 'type-b')).toEqual({ event_type_id: 'type-b' })
    expect(Object.keys(shiftBornEventTypePatch('type-a', 'type-b') ?? {})).toEqual([
      'event_type_id',
    ])
  })

  it('writes nothing when the type is unchanged or blank', () => {
    expect(shiftBornEventTypePatch('type-a', 'type-a')).toBeNull()
    expect(shiftBornEventTypePatch('type-a', '  ')).toBeNull()
    expect(shiftBornEventTypePatch(null, '')).toBeNull()
  })
})

describe('applyShiftEventTypeChange', () => {
  const accident = 'type-accident'
  const tow = 'type-tow'
  const fire = 'type-fire'

  it('moves one event and the stored totals, and leaves the sibling event', () => {
    const result = applyShiftEventTypeChange({
      counts: [
        { event_type_id: accident, count: 2 },
        { event_type_id: tow, count: 1 },
        { event_type_id: fire, count: 4 },
      ],
      events: [
        { id: 'e1', event_type_id: accident, notes: 'האירוע שנבחר', police_event_id: '100' },
        { id: 'e2', event_type_id: accident, notes: 'אירוע אחר', police_event_id: '200' },
      ],
      eventId: 'e1',
      nextTypeId: tow,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.events[0]).toEqual({
      id: 'e1',
      event_type_id: tow,
      notes: 'האירוע שנבחר',
      police_event_id: '100',
    })
    expect(result.events[1]).toEqual({
      id: 'e2',
      event_type_id: accident,
      notes: 'אירוע אחר',
      police_event_id: '200',
    })
    expect(result.counts).toEqual([
      { event_type_id: accident, count: 1 },
      { event_type_id: tow, count: 2 },
      { event_type_id: fire, count: 4 },
    ])
  })

  it('adds a type the shift did not have yet and does not drop the old count below zero', () => {
    expect(
      moveShiftEventTypeCount([{ event_type_id: accident, count: 0 }], accident, fire),
    ).toEqual([
      { event_type_id: accident, count: 0 },
      { event_type_id: fire, count: 1 },
    ])
  })

  it('does not change counts or events when the type stays the same', () => {
    const counts = [{ event_type_id: accident, count: 3 }]
    const events = [{ id: 'e1', event_type_id: accident, notes: 'כמו שהיה' }]
    const result = applyShiftEventTypeChange({
      counts,
      events,
      eventId: 'e1',
      nextTypeId: accident,
    })
    expect(result).toEqual({
      ok: true,
      counts,
      events,
    })
  })

  it('renames only the chosen event and moves the shift totals', () => {
    const result = shiftEventsAfterTypeChange({
      counts: [
        { event_type_id: accident, count: 1 },
        { event_type_id: tow, count: 1 },
      ],
      events: [
        { id: 'e1', event_type_id: accident, event_type: { name: 'תאונה' }, police_event_id: '5025' },
        { id: 'e2', event_type_id: tow, event_type: { name: 'תקוע' }, police_event_id: '5325' },
      ],
      eventId: 'e1',
      nextTypeId: fire,
      nextTypeName: 'שריפה',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.events[0]).toEqual({
      id: 'e1',
      event_type_id: fire,
      event_type: { name: 'שריפה' },
      police_event_id: '5025',
    })
    expect(result.events[1]).toEqual({
      id: 'e2',
      event_type_id: tow,
      event_type: { name: 'תקוע' },
      police_event_id: '5325',
    })
    expect(result.counts).toEqual([
      { event_type_id: accident, count: 0 },
      { event_type_id: tow, count: 1 },
      { event_type_id: fire, count: 1 },
    ])
  })

  it('refuses an event that is not on the shift', () => {
    expect(
      applyShiftEventTypeChange({
        counts: [],
        events: [],
        eventId: 'missing',
        nextTypeId: tow,
      }),
    ).toEqual({ ok: false, error: 'not_found' })
  })
})

describe('set_shift_born_event_type', () => {
  const body = sql.slice(sql.indexOf('function public.set_shift_born_event_type'))

  it('is super_admin only and patches one event type plus the stored tallies', () => {
    expect(body).toContain('security definer')
    expect(body).toContain("not public.has_role(auth.uid(), 'super_admin')")
    expect(body).toContain("v_event.origin is distinct from 'shift'")
    expect(body).toContain('event_type_id = p_event_type_id')
    expect(body).toContain('where id = p_event_id')
    expect(body).toContain('shift_event_type_counts')
    expect(body).toContain('greatest(count - 1, 0)')
    expect(body).toContain('shift_event_type_counts.count + 1')
    expect(body).toContain("set_config('yahpaz.skip_auto_secondary', '1', true)")
    expect(body).not.toContain('sync_shift_born_events')
    expect(body).not.toContain('treatment_detail')
    expect(body).not.toContain('police_event_id')
    expect(body).toContain(
      'grant execute on function public.set_shift_born_event_type(uuid, uuid, timestamptz) to authenticated',
    )
  })
})
