import { describe, expect, it } from 'vitest'
import { shiftBornEventFillRowsFrom } from './shiftBornFill'

describe('shiftBornEventFillRowsFrom', () => {
  it('keeps police event id and treated rows for the debrief save', () => {
    const rows = shiftBornEventFillRowsFrom([
      {
        id: 'evt-1',
        status: 'in_progress',
        police_event_id: ' 12 ',
        treatment_detail: 'חילוץ',
        treatment_notes: null,
        road_id: 'road-1',
        location: 'צומת',
        updated_at: '2026-08-16T08:00:00Z',
        event_type: { name: 'תקוע' },
        treated: [
          { vehicle_kind_id: 'kind-1', quantity: 2 },
          { vehicle_kind_id: 'kind-2', quantity: 0 },
        ],
      },
      {
        id: 'evt-skip',
        status: 'in_progress',
        police_event_id: null,
        treatment_detail: null,
        treatment_notes: null,
        road_id: null,
        location: null,
        updated_at: null,
        event_type: null,
        treated: [],
      },
    ])

    expect(rows).toEqual([
      {
        id: 'evt-1',
        typeName: 'תקוע',
        status: 'in_progress',
        expected_updated_at: '2026-08-16T08:00:00Z',
        draft: {
          police_event_id: ' 12 ',
          treatment_detail: 'חילוץ',
          treatment_notes: '',
          road_id: 'road-1',
          location: 'צומת',
          treated: [{ vehicle_kind_id: 'kind-1', quantity: 2 }],
        },
      },
    ])
  })
})
