import { describe, expect, it } from 'vitest'
import { emptyEventDraft } from './eventForm'
import { emptyResponderFillDraft } from './responderFill'
import { emptyTreatedPlateFields } from './treatedPlates'
import {
  evaluateEventFormSaveRules,
  evaluateResponderFillSaveRules,
  mergeFieldErrors,
  OVERNIGHT_END_TITLE,
  skippedPhotoDigits,
  vehiclePhotosIssue,
} from './eventSaveRules'
import { VEHICLE_PHOTOS_TITLE, withPendingPhotoLinks } from './eventVehiclePhotos'
import { EVENT_EDIT_LOCKED_TOOLTIP } from './eventEditLock'

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
  it('allows a full save without או״ק, כביש, or מספר אירוע', () => {
    const result = evaluateEventFormSaveRules({
      draft: {
        ...fullDraft(),
        patrol_callsign_number: '',
        road_id: '',
        police_event_id: '',
      },
      districts,
      roads,
      canClearCancelled: true,
      previousIsCancelled: false,
      treatedTotal: 0,
      lastSavedDate: fullDraft().event_date,
    })
    expect(result.blocks).toEqual([])
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

  it('still lets admin and super_admin save after 7 days', () => {
    const draft = {
      ...fullDraft(),
      id: 'evt-old',
      created_at: '2026-01-01T00:00:00.000Z',
    }
    for (const roles of [['admin'], ['super_admin', 'shift_lead']] as const) {
      const result = evaluateEventFormSaveRules({
        draft,
        districts,
        roads,
        roles,
        canClearCancelled: true,
        previousIsCancelled: false,
        treatedTotal: 0,
        lastSavedDate: fullDraft().event_date,
      })
      expect(result.blocks.some((issue) => issue.id === 'edit_age_lock')).toBe(false)
    }
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
    expect(mergeFieldErrors(result.blocks).vehicle_plate).toBeTruthy()
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

  it('skips a vehicle the user already chose to save without a photo', () => {
    const result = evaluateResponderFillSaveRules({
      draft: {
        ...emptyResponderFillDraft(),
        treated_plates: [{ plate_number: '12-345', ...emptyTreatedPlateFields() }],
      },
      mode: 'draft',
      coveredPlateDigits: new Set(),
      photoSkippedDigits: new Set(['12345']),
    })
    expect(result.notifies).toEqual([])
  })

  it('still asks about a vehicle added after the user skipped others', () => {
    const result = evaluateResponderFillSaveRules({
      draft: {
        ...emptyResponderFillDraft(),
        treated_plates: [
          { plate_number: '12-345', ...emptyTreatedPlateFields() },
          { plate_number: '678-90-123', ...emptyTreatedPlateFields() },
        ],
      },
      mode: 'draft',
      coveredPlateDigits: new Set(),
      photoSkippedDigits: new Set(['12345']),
    })
    expect(result.notifies[0]?.vehicles?.map((plate) => plate.plate_number)).toEqual([
      '678-90-123',
    ])
  })

  it('does not prompt when photo coverage is unknown', () => {
    const result = evaluateResponderFillSaveRules({
      draft: {
        ...emptyResponderFillDraft(),
        treated_plates: [{ plate_number: '12-345', ...emptyTreatedPlateFields() }],
      },
      mode: 'draft',
      coveredPlateDigits: null,
    })
    expect(result.notifies).toEqual([])
  })
})

describe('vehiclePhotosIssue', () => {
  const plate = (plate_number: string) => ({ plate_number, ...emptyTreatedPlateFields() })

  it('never names a vehicle whose photo is linked, whatever the plate formatting', () => {
    expect(vehiclePhotosIssue([plate('12-345-67')], new Set(['1234567']))).toBeNull()
  })

  it('counts a photo waiting for a vehicle the form has not saved yet', () => {
    const covered = withPendingPhotoLinks(new Set(), [{ mediaId: 'm1', digits: ['1234567'] }])
    expect(vehiclePhotosIssue([plate('12-345-67')], covered)).toBeNull()
  })

  it('names only the vehicles with no photo', () => {
    const covered = withPendingPhotoLinks(new Set(['1111111']), [
      { mediaId: 'm1', digits: ['2222222'] },
    ])
    const issue = vehiclePhotosIssue(
      [plate('11-111-11'), plate('22-222-22'), plate('33-333-33')],
      covered,
    )
    expect(issue?.vehicles?.map((row) => row.plate_number)).toEqual(['33-333-33'])
  })

  it('remembers exactly the vehicles a prompt named', () => {
    const issue = vehiclePhotosIssue([plate('33-333-33')], new Set())
    expect(skippedPhotoDigits(issue ? [issue] : [])).toEqual(['3333333'])
  })
})
