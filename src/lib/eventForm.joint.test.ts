import { describe, expect, it } from 'vitest'
import { policeEventIdSaveAction } from './eventForm'

const base = {
  variant: 'full' as const,
  eventDate: '2026-11-20',
  policeEventId: ' 12345 ',
  viewerLeadId: 'u1',
  lastSavedPoliceEventId: '',
}

function existing(id: string, origin: 'manual' | 'shift', extra = {}) {
  return { id, event_date: '2026-11-20', police_event_id: '12345', origin, ...extra }
}

describe('policeEventIdSaveAction with joint events', () => {
  it('asks to confirm when a manual save meets one shift event', () => {
    expect(
      policeEventIdSaveAction({ ...base, origin: 'manual', existing: [existing('s1', 'shift')] }),
    ).toEqual({ kind: 'confirm_joint' })
  })

  it('asks to confirm when a shift save meets one manual event', () => {
    expect(
      policeEventIdSaveAction({ ...base, origin: 'shift', existing: [existing('m1', 'manual')] }),
    ).toEqual({ kind: 'confirm_joint' })
  })

  it('still blocks a second manual event', () => {
    expect(
      policeEventIdSaveAction({ ...base, origin: 'manual', existing: [existing('m1', 'manual')] }),
    ).toEqual({ kind: 'block' })
  })

  it('still blocks a second shift event', () => {
    expect(
      policeEventIdSaveAction({ ...base, origin: 'shift', existing: [existing('s1', 'shift')] }),
    ).toEqual({ kind: 'block' })
  })

  it('blocks a manual save when a manual and a shift event already exist', () => {
    expect(
      policeEventIdSaveAction({
        ...base,
        origin: 'manual',
        existing: [existing('m1', 'manual'), existing('s1', 'shift')],
      }),
    ).toEqual({ kind: 'block' })
  })

  it('blocks a shift save when a manual and a shift event already exist', () => {
    expect(
      policeEventIdSaveAction({
        ...base,
        origin: 'shift',
        existing: [existing('m1', 'manual'), existing('s1', 'shift')],
      }),
    ).toEqual({ kind: 'block' })
  })

  it('ignores cancelled events and other dates', () => {
    expect(
      policeEventIdSaveAction({
        ...base,
        origin: 'manual',
        existing: [
          existing('s1', 'shift', { is_cancelled: true }),
          existing('s2', 'shift', { event_date: '2026-11-19' }),
        ],
      }),
    ).toEqual({ kind: 'proceed' })
  })

  it('trims the typed number before comparing', () => {
    expect(
      policeEventIdSaveAction({ ...base, origin: 'manual', existing: [existing('s1', 'shift', { police_event_id: ' 12345 ' })] }),
    ).toEqual({ kind: 'confirm_joint' })
  })

  it('does not ask again when the edited event is already half of the pair', () => {
    expect(
      policeEventIdSaveAction({
        ...base,
        origin: 'manual',
        currentEventId: 'm1',
        existing: [existing('m1', 'manual'), existing('s1', 'shift')],
      }),
    ).toEqual({ kind: 'proceed' })
  })
})

describe('policeEventIdSaveAction joint events in the cockpit', () => {
  const cockpit = { ...base, variant: 'cockpit' as const }

  it('asks to confirm instead of stripping the number beside one shift event', () => {
    expect(
      policeEventIdSaveAction({ ...cockpit, origin: 'manual', existing: [existing('s1', 'shift')] }),
    ).toEqual({ kind: 'confirm_joint' })
  })

  it('still strips the number for a second manual event', () => {
    expect(
      policeEventIdSaveAction({
        ...cockpit,
        origin: 'manual',
        existing: [existing('m1', 'manual', { shift_lead_id: 'someone-else' })],
      }),
    ).toEqual({ kind: 'strip', policeEventId: '' })
  })

  it('strips the number when a joint pair already exists', () => {
    expect(
      policeEventIdSaveAction({
        ...cockpit,
        origin: 'manual',
        existing: [existing('m1', 'manual'), existing('s1', 'shift')],
      }),
    ).toEqual({ kind: 'strip', policeEventId: '' })
  })
})
