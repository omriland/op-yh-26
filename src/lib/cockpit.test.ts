import { describe, expect, it } from 'vitest'
import {
  COCKPIT_AUTOSAVE_MS,
  COCKPIT_WINDOW_MS,
  canDeleteCockpitDraft,
  cockpitDeleteBlock,
  cockpitDeleteHint,
  cockpitReelLead,
  cockpitReelPlace,
  cockpitReelTitle,
  cockpitReelType,
  filterCockpitReel,
  formatCockpitClock,
  isInCockpitWindow,
} from './cockpit'

const NOW = new Date('2026-08-16T12:00:00.000Z')

function item(id: string, createdAt: string) {
  return { id, created_at: createdAt }
}

describe('cockpit window', () => {
  it('keeps events created within the last two hours', () => {
    expect(isInCockpitWindow('2026-08-16T10:00:00.000Z', NOW)).toBe(true)
    expect(isInCockpitWindow('2026-08-16T11:59:00.000Z', NOW)).toBe(true)
  })

  it('drops events older than two hours and future rows', () => {
    expect(isInCockpitWindow('2026-08-16T09:59:59.000Z', NOW)).toBe(false)
    expect(isInCockpitWindow('2026-08-16T12:00:01.000Z', NOW)).toBe(false)
  })

  it('sorts the גלגלת newest first', () => {
    const rows = filterCockpitReel(
      [
        item('old', '2026-08-16T10:10:00.000Z'),
        item('stale', '2026-08-16T09:00:00.000Z'),
        item('new', '2026-08-16T11:50:00.000Z'),
      ],
      NOW,
    )
    expect(rows.map((row) => row.id)).toEqual(['new', 'old'])
  })

  it('uses a two-hour window and 800ms autosave delay', () => {
    expect(COCKPIT_WINDOW_MS).toBe(2 * 60 * 60 * 1000)
    expect(COCKPIT_AUTOSAVE_MS).toBe(800)
  })
})

describe('cockpitReelTitle', () => {
  it('uses police event id, otherwise אירוע חדש', () => {
    expect(
      cockpitReelTitle({ police_event_id: '12345', event_type: { name: 'תאונה' } }),
    ).toBe('12345')
    expect(cockpitReelTitle({ police_event_id: '  ', event_type: { name: 'תאונה' } })).toBe(
      'אירוע חדש',
    )
    expect(cockpitReelTitle({ police_event_id: null, event_type: null })).toBe('אירוע חדש')
  })
})

describe('cockpit reel details', () => {
  it('exposes event type and road · location separately', () => {
    const event = {
      police_event_id: '12345',
      event_type: { name: 'תאונה' },
      road: { name: 'כביש 20' },
      location: 'מחלף השלום',
    }
    expect(cockpitReelType(event)).toBe('תאונה')
    expect(cockpitReelPlace(event)).toBe('כביש 20 · מחלף השלום')
    expect(cockpitReelType({ event_type: null })).toBeNull()
    expect(cockpitReelPlace({ road: null, location: null })).toBeNull()
  })

  it('blocks delete only while responders are allocated', () => {
    expect(
      canDeleteCockpitDraft({
        event_type: { name: 'תאונה' },
        road: { name: 'כביש 20' },
        responders: [],
      }),
    ).toBe(true)
    expect(
      cockpitDeleteBlock({
        event_type: { name: 'תאונה' },
        road: { name: 'כביש 20' },
        responders: [{ id: 'r1' }],
      }),
    ).toBe('responders')
    expect(
      cockpitDeleteBlock({
        event_type: null,
        road: null,
        responders: [],
      }),
    ).toBeNull()
    expect(cockpitDeleteHint('responders')).toBe(
      'יש כוננים משובצים. הסירו אותם תחילה.',
    )
    expect(cockpitDeleteHint('confirm')).toBe('לחצו שוב למחיקה.')
  })

  it('returns אחמ״ש name and callsign when present', () => {
    expect(
      cockpitReelLead({
        shift_lead: { full_name: 'עמרי לנדמן', callsign: 'Admin' },
      }),
    ).toEqual({ full_name: 'עמרי לנדמן', callsign: 'Admin' })
    expect(cockpitReelLead({ shift_lead: null })).toBeNull()
    expect(cockpitReelLead({ shift_lead: { full_name: '  ', callsign: '  ' } })).toBeNull()
  })
})

describe('formatCockpitClock', () => {
  it('shows Jerusalem wall-clock time', () => {
    expect(formatCockpitClock('2026-08-16T10:05:00.000Z')).toBe('13:05')
  })
})
