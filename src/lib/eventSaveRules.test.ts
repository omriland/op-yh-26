import { describe, expect, it } from 'vitest'
import { emptyEventDraft } from './eventForm'
import { emptyResponderFillDraft } from './responderFill'
import { emptyTreatedPlateFields } from './treatedPlates'
import {
  evaluateEventFormSaveRules,
  evaluateResponderFillSaveRules,
  mergeFieldErrors,
  OVERNIGHT_END_TITLE,
} from './eventSaveRules'
import { VEHICLE_PHOTOS_TITLE } from './eventVehiclePhotos'
import { EVENT_EDIT_LOCKED_TOOLTIP } from './eventEditLock'
import { PATROL_CALLSIGN_NUMBER_ERROR } from './patrolCallsign'

const districts = [{ id: 'd1', name: 'צפון' }]
const roads = [{ id: 'r1', name: '20' }]

function fullDraft() {
  return {
    ...emptyEventDraft({ full_name: 'א', callsign: '1' }),
    event_type_id: 't1',
    road_id: 'r1',
    patrol_callsign_number: '411',
    start_time: '08:00',
    end_time: '09:00',
  }
}

describe('evaluateEventFormSaveRules', () => {
  it('blocks a full save missing אוק - מס', () => {
    const result = evaluateEventFormSaveRules({
      draft: { ...fullDraft(), patrol_callsign_number: '' },
      districts,
      roads,
      canClearCancelled: true,
      previousIsCancelled: false,
      treatedTotal: 0,
      lastSavedDate: fullDraft().event_date,
    })
    expect(result.blocks.some((issue) => issue.id === 'callsign_number' || issue.fieldErrors?.patrol_callsign_number)).toBe(
      true,
    )
    expect(mergeFieldErrors(result.blocks).patrol_callsign_number).toBe(
      PATROL_CALLSIGN_NUMBER_ERROR,
    )
    expect(result.notifies).toEqual([])
  })

  it('allows a cockpit partial without אוק - מס', () => {
    const result = evaluateEventFormSaveRules({
      draft: { ...fullDraft(), patrol_callsign_number: '', event_type_id: '', road_id: '' },
      districts,
      roads,
      allowPartial: true,
      canClearCancelled: true,
      previousIsCancelled: false,
      treatedTotal: 0,
      lastSavedDate: fullDraft().event_date,
    })
    expect(result.blocks).toEqual([])
  })

  it('notifies on overnight end and future date', () => {
    const result = evaluateEventFormSaveRules({
      draft: {
        ...fullDraft(),
        event_date: '2099-01-01',
        start_time: '22:00',
        end_time: '01:00',
      },
      districts,
      roads,
      canClearCancelled: true,
      previousIsCancelled: false,
      treatedTotal: 0,
      lastSavedDate: '2026-09-10',
      today: '2026-09-10',
    })
    expect(result.blocks).toEqual([])
    expect(result.notifies.map((issue) => issue.id)).toEqual(['future_date', 'overnight_end'])
    expect(result.notifies[1]?.title).toBe(OVERNIGHT_END_TITLE)
  })

  it('blocks a shift-lead edit after 7 days', () => {
    const result = evaluateEventFormSaveRules({
      draft: {
        ...fullDraft(),
        id: 'evt-old',
        created_at: '2026-01-01T00:00:00.000Z',
      },
      districts,
      roads,
      roles: ['shift_lead'],
      canClearCancelled: true,
      previousIsCancelled: false,
      treatedTotal: 0,
      lastSavedDate: fullDraft().event_date,
    })
    expect(result.blocks.some((issue) => issue.message === EVENT_EDIT_LOCKED_TOOLTIP)).toBe(
      true,
    )
  })
})

describe('evaluateResponderFillSaveRules', () => {
  it('blocks leftover complete-mode field errors', () => {
    const result = evaluateResponderFillSaveRules({
      draft: emptyResponderFillDraft(),
      mode: 'complete',
      allowedPlates: ['1234567'],
      coveredPlateDigits: new Set(),
    })
    expect(result.blocks[0]?.id).toBe('fill_fields')
    expect(result.blocks[0]?.fieldErrors?.vehicle_plate).toBeTruthy()
  })

  it('notifies when treated vehicles have no photos', () => {
    const result = evaluateResponderFillSaveRules({
      draft: {
        ...emptyResponderFillDraft(),
        treated_plates: [{ plate_number: '12-345', ...emptyTreatedPlateFields() }],
      },
      mode: 'draft',
      coveredPlateDigits: new Set(),
    })
    expect(result.blocks).toEqual([])
    expect(result.notifies[0]?.id).toBe('vehicle_photos')
    expect(result.notifies[0]?.title).toBe(VEHICLE_PHOTOS_TITLE)
    expect(result.notifies[0]?.vehicles).toHaveLength(1)
  })

  it('skips the photo notify after the user proceeds', () => {
    const result = evaluateResponderFillSaveRules({
      draft: {
        ...emptyResponderFillDraft(),
        treated_plates: [{ plate_number: '12-345', ...emptyTreatedPlateFields() }],
      },
      mode: 'draft',
      coveredPlateDigits: new Set(),
      photoNotifyOk: true,
    })
    expect(result.notifies).toEqual([])
  })
})
