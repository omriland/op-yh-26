import { describe, expect, it } from 'vitest'
import {
  buildDuplicateClusters,
  DUPLICATE_TIME_WINDOW_MINUTES,
  type DuplicateParticipationSource,
} from './duplicateEventsReport'

function part(
  overrides: Partial<DuplicateParticipationSource> &
    Pick<DuplicateParticipationSource, 'event_id' | 'responder_id'>,
): DuplicateParticipationSource {
  return {
    event_date: '2026-08-10',
    location: 'צומת גלילות',
    started_at: '2026-08-10T10:00:00+03:00',
    is_cancelled: false,
    police_event_id: null,
    event_type_name: 'תאונה',
    road_name: null,
    full_name: 'אבי לוי',
    callsign: 'A1',
    ...overrides,
  }
}

describe('DUPLICATE_TIME_WINDOW_MINUTES', () => {
  it('is 30', () => {
    expect(DUPLICATE_TIME_WINDOW_MINUTES).toBe(30)
  })
})

describe('buildDuplicateClusters', () => {
  it('returns empty when no matches', () => {
    expect(
      buildDuplicateClusters([
        part({ event_id: 'e1', responder_id: 'r1', started_at: '2026-08-10T10:00:00+03:00' }),
        part({
          event_id: 'e2',
          responder_id: 'r1',
          started_at: '2026-08-10T12:00:00+03:00',
        }),
      ]),
    ).toEqual([])
  })

  it('clusters same volunteer, date, location within 30 minutes', () => {
    const clusters = buildDuplicateClusters([
      part({ event_id: 'e1', responder_id: 'r1', started_at: '2026-08-10T10:00:00+03:00' }),
      part({ event_id: 'e2', responder_id: 'r1', started_at: '2026-08-10T10:20:00+03:00' }),
    ])
    expect(clusters).toHaveLength(1)
    expect(clusters[0]!.sizeLabel).toBe('כפול')
    expect(clusters[0]!.members.map((m) => m.event_id).sort()).toEqual(['e1', 'e2'])
  })

  it('forms משולש when three participations connect transitively', () => {
    const clusters = buildDuplicateClusters([
      part({ event_id: 'e1', responder_id: 'r1', started_at: '2026-08-10T10:00:00+03:00' }),
      part({ event_id: 'e2', responder_id: 'r1', started_at: '2026-08-10T10:25:00+03:00' }),
      part({ event_id: 'e3', responder_id: 'r1', started_at: '2026-08-10T10:50:00+03:00' }),
    ])
    expect(clusters).toHaveLength(1)
    expect(clusters[0]!.sizeLabel).toBe('משולש')
    expect(clusters[0]!.members).toHaveLength(3)
  })

  it('does not match empty locations or null started_at', () => {
    expect(
      buildDuplicateClusters([
        part({ event_id: 'e1', responder_id: 'r1', location: '  ', started_at: '2026-08-10T10:00:00+03:00' }),
        part({ event_id: 'e2', responder_id: 'r1', location: '', started_at: '2026-08-10T10:05:00+03:00' }),
        part({ event_id: 'e3', responder_id: 'r1', started_at: null }),
        part({ event_id: 'e4', responder_id: 'r1', started_at: '2026-08-10T10:05:00+03:00' }),
      ]),
    ).toEqual([])
  })

  it('requires same responder and same event_date', () => {
    expect(
      buildDuplicateClusters([
        part({ event_id: 'e1', responder_id: 'r1', started_at: '2026-08-10T10:00:00+03:00' }),
        part({ event_id: 'e2', responder_id: 'r2', started_at: '2026-08-10T10:05:00+03:00' }),
        part({
          event_id: 'e3',
          responder_id: 'r1',
          event_date: '2026-08-11',
          started_at: '2026-08-11T10:05:00+03:00',
        }),
      ]),
    ).toEqual([])
  })

  it('trims location before compare', () => {
    const clusters = buildDuplicateClusters([
      part({ event_id: 'e1', responder_id: 'r1', location: ' גלילות ', started_at: '2026-08-10T10:00:00+03:00' }),
      part({ event_id: 'e2', responder_id: 'r1', location: 'גלילות', started_at: '2026-08-10T10:10:00+03:00' }),
    ])
    expect(clusters).toHaveLength(1)
  })

  it('drops a cluster after every member is approved for suspicious_duplicate', () => {
    expect(
      buildDuplicateClusters([
        part({
          event_id: 'e1',
          responder_id: 'r1',
          started_at: '2026-08-10T10:00:00+03:00',
          approved_suspicious_duplicate: true,
          frozen_suspicious_duplicate: false,
        }),
        part({
          event_id: 'e2',
          responder_id: 'r1',
          started_at: '2026-08-10T10:10:00+03:00',
          approved_suspicious_duplicate: true,
          frozen_suspicious_duplicate: false,
        }),
      ]),
    ).toEqual([])
  })

  it('keeps a cluster when only one of three members is approved', () => {
    const clusters = buildDuplicateClusters([
      part({
        event_id: 'e1',
        responder_id: 'r1',
        started_at: '2026-08-10T10:00:00+03:00',
        approved_suspicious_duplicate: true,
        frozen_suspicious_duplicate: false,
      }),
      part({
        event_id: 'e2',
        responder_id: 'r1',
        started_at: '2026-08-10T10:25:00+03:00',
        frozen_suspicious_duplicate: true,
      }),
      part({
        event_id: 'e3',
        responder_id: 'r1',
        started_at: '2026-08-10T10:50:00+03:00',
        frozen_suspicious_duplicate: true,
      }),
    ])
    expect(clusters).toHaveLength(1)
    expect(clusters[0]!.members).toHaveLength(3)
    expect(clusters[0]!.members.map((member) => member.event_id).sort()).toEqual(['e1', 'e2', 'e3'])
  })

  it('does not keep a cluster after deletes leave a single event', () => {
    expect(
      buildDuplicateClusters([
        part({
          event_id: 'e-only',
          responder_id: 'r1',
          started_at: '2026-08-10T10:00:00+03:00',
          frozen_suspicious_duplicate: false,
        }),
      ]),
    ).toEqual([])
  })

  it('keeps the remaining pair frozen after deleting 1 of 3 pairwise duplicates', () => {
    const remaining = buildDuplicateClusters([
      part({
        event_id: 'e2',
        responder_id: 'r1',
        started_at: '2026-08-10T10:10:00+03:00',
        frozen_suspicious_duplicate: true,
      }),
      part({
        event_id: 'e3',
        responder_id: 'r1',
        started_at: '2026-08-10T10:20:00+03:00',
        frozen_suspicious_duplicate: true,
      }),
    ])
    expect(remaining).toHaveLength(1)
    expect(remaining[0]!.sizeLabel).toBe('כפול')
    expect(remaining[0]!.members.map((member) => member.event_id).sort()).toEqual(['e2', 'e3'])
    expect(remaining[0]!.members.every((member) => member.frozen_suspicious_duplicate)).toBe(true)
  })
})

describe('joint pairs', () => {
  it('does not flag a shift event and a manual event sharing a number', () => {
    expect(
      buildDuplicateClusters([
        part({ event_id: 'm1', responder_id: 'r1', police_event_id: '12345', origin: 'manual' }),
        part({ event_id: 's1', responder_id: 'r1', police_event_id: '12345', origin: 'shift' }),
      ]),
    ).toEqual([])
  })

  it('still flags two manual events with the same number, person, place and time', () => {
    const clusters = buildDuplicateClusters([
      part({ event_id: 'm1', responder_id: 'r1', police_event_id: '12345', origin: 'manual' }),
      part({ event_id: 'm2', responder_id: 'r1', police_event_id: '12345', origin: 'manual' }),
    ])
    expect(clusters).toHaveLength(1)
  })

  it('still flags two shift events with the same number, person, place and time', () => {
    const clusters = buildDuplicateClusters([
      part({ event_id: 's1', responder_id: 'r1', police_event_id: '12345', origin: 'shift' }),
      part({ event_id: 's2', responder_id: 'r1', police_event_id: '12345', origin: 'shift' }),
    ])
    expect(clusters).toHaveLength(1)
  })

  it('still flags a manual and a shift event with different numbers, same person, place and time', () => {
    const clusters = buildDuplicateClusters([
      part({ event_id: 'm1', responder_id: 'r1', police_event_id: '12345', origin: 'manual' }),
      part({ event_id: 's1', responder_id: 'r1', police_event_id: '999', origin: 'shift' }),
    ])
    expect(clusters).toHaveLength(1)
  })
})
