import { describe, expect, it } from 'vitest'
import {
  applyLiveDelta,
  cullLivePinsToBbox,
  liveDeltaFromChange,
  liveMotionPosition,
  pushLiveMotion,
} from './liveMapChannel'
import type { LiveMapPin } from './liveMapPins'
import type { LatLngBbox } from './mapCatalogView'

const pin: LiveMapPin = {
  assignmentId: 'er1',
  lat: 32.08,
  lng: 34.78,
  label: '12 · בדרך',
  tooltip: '12:00',
  recordedAt: '2026-08-27T07:00:00.000Z',
}

describe('liveDeltaFromChange', () => {
  it('maps INSERT/UPDATE to upsert and DELETE to remove', () => {
    expect(
      liveDeltaFromChange({
        eventType: 'UPDATE',
        new: {
          event_responder_id: 'er1',
          lat: 32.1,
          lng: 34.8,
          recorded_at: '2026-08-27T07:00:10.000Z',
        },
        old: {},
      }),
    ).toEqual({
      type: 'upsert',
      assignmentId: 'er1',
      lat: 32.1,
      lng: 34.8,
      recordedAt: '2026-08-27T07:00:10.000Z',
    })
    expect(
      liveDeltaFromChange({
        eventType: 'DELETE',
        new: {},
        old: { event_responder_id: 'er1' },
      }),
    ).toEqual({ type: 'remove', assignmentId: 'er1' })
  })
})

describe('applyLiveDelta', () => {
  it('patches lat/lng on a known pin without a snapshot', () => {
    const next = applyLiveDelta([pin], {
      type: 'upsert',
      assignmentId: 'er1',
      lat: 32.2,
      lng: 34.9,
      recordedAt: '2026-08-27T07:00:10.000Z',
    })
    expect(next.needsSnapshot).toBe(false)
    expect(next.pins[0]).toMatchObject({ lat: 32.2, lng: 34.9, label: '12 · בדרך' })
  })

  it('asks for a snapshot when an unknown assignment appears', () => {
    const next = applyLiveDelta([], {
      type: 'upsert',
      assignmentId: 'new',
      lat: 32,
      lng: 34,
      recordedAt: '2026-08-27T07:00:10.000Z',
    })
    expect(next.needsSnapshot).toBe(true)
    expect(next.pins).toEqual([])
  })

  it('removes a pin', () => {
    expect(applyLiveDelta([pin], { type: 'remove', assignmentId: 'er1' })).toEqual({
      pins: [],
      needsSnapshot: false,
    })
  })
})

describe('cullLivePinsToBbox', () => {
  it('keeps only pins inside the padded view', () => {
    const bbox: LatLngBbox = { south: 32, west: 34.7, north: 32.2, east: 35 }
    expect(cullLivePinsToBbox([pin, { ...pin, assignmentId: 'far', lat: 31, lng: 34 }], bbox).map((row) => row.assignmentId)).toEqual([
      'er1',
    ])
  })
})

describe('live motion', () => {
  it('lerps from the previous display point toward the ping', () => {
    const motion = pushLiveMotion(
      { lat: 32, lng: 34 },
      { lat: 32.1, lng: 34.2 },
      1_000,
      1_000,
    )
    expect(liveMotionPosition(motion, 1_000)).toEqual({ lat: 32, lng: 34 })
    expect(liveMotionPosition(motion, 1_500)).toEqual({ lat: 32.05, lng: 34.1 })
    expect(liveMotionPosition(motion, 2_000)).toEqual({ lat: 32.1, lng: 34.2 })
  })
})
