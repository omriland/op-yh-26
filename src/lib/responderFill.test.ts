import { describe, expect, it } from 'vitest'
import { EVENT_MEDIA_LEFTOVER_ERROR } from './eventMedia'
import {
  deriveEventStatusAfterParticipation,
  emptyResponderFillDraft,
  fillHeaderStatus,
  gateResponderFillWrite,
  mergeFillVehicleChoices,
  odometerDelta,
  odometerRangeError,
  responderVehicleChoices,
  RESPONDER_FILL_CANCELLED_NOTE,
  validateResponderFillDraft,
  type ResponderFillDraft,
} from './responderFill'
import { ODOMETER_ORDER_ERROR } from './odometer'

function draft(patch: Partial<ResponderFillDraft> = {}): ResponderFillDraft {
  return { ...emptyResponderFillDraft(), ...patch }
}

/** Long enough to satisfy the פירוט הטיפול minimum in complete-mode cases. */
const treatmentOk = 'א'.repeat(40)

describe('responderVehicleChoices', () => {
  it('includes a vehicle added after the responder was assigned', () => {
    const choices = responderVehicleChoices(
      [
        { plate_number: '12-345-67', model: 'ישן', archived: false, is_default: true },
        { plate_number: '99-888-77', model: 'חדש', archived: false, is_default: false },
      ],
      '',
    )
    expect(choices.options.map((vehicle) => vehicle.plate)).toEqual(['1234567', '9988877'])
    expect(choices.selectedPlate).toBe('1234567')
  })

  it('hides an archived car unless that plate is already saved on the event', () => {
    const choices = responderVehicleChoices(
      [{ plate_number: '11-111-11', model: 'ארכיון', archived: true, is_default: false }],
      '1111111',
    )
    expect(choices.options).toEqual([{ plate: '1111111', model: 'ארכיון' }])
    expect(
      responderVehicleChoices(
        [{ plate_number: '11-111-11', model: 'ארכיון', archived: true }],
        '',
      ).options,
    ).toEqual([])
  })
})

describe('mergeFillVehicleChoices', () => {
  it('keeps a plate the responder already chose and fills an empty one', () => {
    const options = [
      { plate: '1234567', model: 'א' },
      { plate: '9988877', model: 'ב' },
    ]
    expect(mergeFillVehicleChoices('9988877', options, '1234567')).toBe('9988877')
    expect(mergeFillVehicleChoices('', options, '1234567')).toBe('1234567')
  })
})

describe('deriveEventStatusAfterParticipation', () => {
  it('keeps draft-only progress as in_progress, not partial', () => {
    expect(deriveEventStatusAfterParticipation(['pending', 'in_progress'])).toBe('in_progress')
  })

  it('uses partial only when someone has completed', () => {
    expect(deriveEventStatusAfterParticipation(['done', 'pending'])).toBe('partial')
  })

  it('marks done only when every participation is done and the event gate is met', () => {
    expect(
      deriveEventStatusAfterParticipation(['done', 'done'], {
        endedAt: '2026-09-10T09:00:00',
        totalKms: [12, 0],
      }),
    ).toBe('done')
  })

  it('stays partial when every participation is done but ended_at is missing', () => {
    expect(
      deriveEventStatusAfterParticipation(['done', 'done'], {
        endedAt: null,
        totalKms: [12, 8],
      }),
    ).toBe('partial')
  })

  it('stays partial when every participation is done but a lead KM is null', () => {
    expect(
      deriveEventStatusAfterParticipation(['done', 'done'], {
        endedAt: '2026-09-10T09:00:00',
        totalKms: [12, null],
      }),
    ).toBe('partial')
  })
})

describe('odometerRangeError', () => {
  it('stays silent on an equal pair and on 0 in both fields', () => {
    expect(odometerRangeError('100', '100')).toBeUndefined()
    expect(odometerRangeError('0', '0')).toBeUndefined()
    expect(odometerRangeError('100', '120')).toBeUndefined()
  })

  it('names the rule it enforces on a reversed pair', () => {
    expect(odometerRangeError('100', '99')).toBe(ODOMETER_ORDER_ERROR)
    expect(odometerRangeError('1', '0')).toBe(ODOMETER_ORDER_ERROR)
  })

  it('waits for both numbers', () => {
    expect(odometerRangeError('100', '')).toBeUndefined()
    expect(odometerRangeError('', '0')).toBeUndefined()
  })
})

describe('odometerDelta', () => {
  it('shows the difference when end is at least the start, including zero', () => {
    expect(odometerDelta('100', '120')).toBe(20)
    expect(odometerDelta('100', '100')).toBe(0)
    expect(odometerDelta('0', '0')).toBe(0)
  })

  it('stays quiet until both readings are numbers, and on a reversed pair', () => {
    expect(odometerDelta('', '')).toBeNull()
    expect(odometerDelta('100', '')).toBeNull()
    expect(odometerDelta('', '50')).toBeNull()
    expect(odometerDelta('100', '99')).toBeNull()
  })
})

describe('validateResponderFillDraft (user-entered odometer end)', () => {
  const plates = ['1234567']

  it('draft mode allows a short פירוט הטיפול', () => {
    const errors = validateResponderFillDraft(
      draft({ treatment_detail: 'טיפול' }),
      'draft',
      plates,
      null,
    )
    expect(errors.treatment_detail).toBeUndefined()
  })

  it('complete mode requires at least 25 characters in פירוט הטיפול', () => {
    const short = validateResponderFillDraft(
      draft({
        vehicle_plate: '1234567',
        odometer_start: '100',
        odometer_end: '112',
        route: 'כביש 1',
        treatment_detail: 'א'.repeat(24),
      }),
      'complete',
      plates,
      12,
    )
    expect(short.treatment_detail).toBe('יש להזין לפחות 25 תווים בפירוט הטיפול.')

    const exact = validateResponderFillDraft(
      draft({
        vehicle_plate: '1234567',
        odometer_start: '100',
        odometer_end: '112',
        route: 'כביש 1',
        treatment_detail: `  ${'א'.repeat(25)}  `,
      }),
      'complete',
      plates,
      12,
    )
    expect(exact.treatment_detail).toBeUndefined()

    const longer = validateResponderFillDraft(
      draft({
        vehicle_plate: '1234567',
        odometer_start: '100',
        odometer_end: '112',
        route: 'כביש 1',
        treatment_detail: 'א'.repeat(80),
      }),
      'complete',
      plates,
      12,
    )
    expect(longer.treatment_detail).toBeUndefined()
  })

  it('draft mode does not require totalKm or end', () => {
    const errors = validateResponderFillDraft(
      draft({ odometer_start: '100' }),
      'draft',
      plates,
      null,
    )
    expect(errors.odometer_end).toBeUndefined()
  })

  it('complete mode accepts odometers when lead totalKm is missing', () => {
    const errors = validateResponderFillDraft(
      draft({
        vehicle_plate: '1234567',
        odometer_start: '100',
        odometer_end: '112',
        route: 'כביש 1',
        treatment_detail: treatmentOk,
      }),
      'complete',
      plates,
      null,
    )
    expect(errors).toEqual({})
  })

  it('complete mode requires user-entered end even when totalKm is set', () => {
    const errors = validateResponderFillDraft(
      draft({
        vehicle_plate: '1234567',
        odometer_start: '100',
        odometer_end: '',
        route: 'כביש 1',
        treatment_detail: treatmentOk,
      }),
      'complete',
      plates,
      12,
    )
    expect(errors.odometer_end).toBe('יש למלא מד אוץ סיום.')
  })

  it('complete mode accepts user end when totalKm is present', () => {
    const errors = validateResponderFillDraft(
      draft({
        vehicle_plate: '1234567',
        odometer_start: '100',
        odometer_end: '115',
        route: 'כביש 1',
        treatment_detail: treatmentOk,
      }),
      'complete',
      plates,
      12,
    )
    expect(errors).toEqual({})
  })

  it('complete mode allows totalKm of 0 when user end > start', () => {
    const errors = validateResponderFillDraft(
      draft({
        vehicle_plate: '1234567',
        odometer_start: '100',
        odometer_end: '110',
        route: 'כביש 1',
        treatment_detail: treatmentOk,
      }),
      'complete',
      plates,
      0,
    )
    expect(errors).toEqual({})
  })

  it('accepts an equal pair, including 0 in both readings', () => {
    const equal = validateResponderFillDraft(
      draft({
        vehicle_plate: '1234567',
        odometer_start: '100',
        odometer_end: '100',
        route: 'כביש 1',
        treatment_detail: treatmentOk,
      }),
      'complete',
      plates,
      12,
    )
    expect(equal).toEqual({})

    const zeros = validateResponderFillDraft(
      draft({
        vehicle_plate: '1234567',
        odometer_start: '0',
        odometer_end: '0',
        route: 'כביש 1',
        treatment_detail: treatmentOk,
      }),
      'complete',
      plates,
      12,
    )
    expect(zeros).toEqual({})
  })

  it('rejects a reversed pair', () => {
    const errors = validateResponderFillDraft(
      draft({
        vehicle_plate: '1234567',
        odometer_start: '100',
        odometer_end: '99',
        route: 'כביש 1',
        treatment_detail: treatmentOk,
      }),
      'complete',
      plates,
      12,
    )
    expect(errors.odometer_end).toBe('מד אוץ סיום אינו יכול להיות קטן ממד אוץ התחלה')
  })

  it('complete mode errors when the open plate field has leftover digits', () => {
    const errors = validateResponderFillDraft(
      draft({
        vehicle_plate: '1234567',
        odometer_start: '100',
        odometer_end: '112',
        route: 'כביש 1',
        treatment_detail: treatmentOk,
        treated_plate_pending: '12',
      }),
      'complete',
      plates,
      12,
    )
    expect(errors.treated_plates).toBe('יש ללחוץ הוספה לשמירת המספר')
  })

  it('complete mode auto-commits a finished leftover plate', () => {
    const errors = validateResponderFillDraft(
      draft({
        vehicle_plate: '1234567',
        odometer_start: '100',
        odometer_end: '112',
        route: 'כביש 1',
        treatment_detail: treatmentOk,
        treated_plate_pending: '24100502',
      }),
      'complete',
      plates,
      12,
    )
    expect(errors.treated_plates).toBeUndefined()
  })

  it('complete mode allows zero treated plates', () => {
    const errors = validateResponderFillDraft(
      draft({
        vehicle_plate: '1234567',
        odometer_start: '100',
        odometer_end: '112',
        route: 'כביש 1',
        treatment_detail: treatmentOk,
      }),
      'complete',
      plates,
      12,
    )
    expect(errors.treated_plates).toBeUndefined()
  })

  it('complete mode errors when a photo draft is missing when-taken', () => {
    const errors = validateResponderFillDraft(
      draft({
        vehicle_plate: '1234567',
        odometer_start: '100',
        odometer_end: '112',
        route: 'כביש 1',
        treatment_detail: treatmentOk,
      }),
      'complete',
      plates,
      12,
      1,
    )
    expect(errors.event_media).toBe(EVENT_MEDIA_LEFTOVER_ERROR)
  })

  it('draft mode ignores unfinished photo drafts', () => {
    const errors = validateResponderFillDraft(
      draft({
        vehicle_plate: '1234567',
        odometer_start: '100',
        odometer_end: '112',
        route: 'כביש 1',
        treatment_detail: treatmentOk,
      }),
      'draft',
      plates,
      12,
      2,
    )
    expect(errors.event_media).toBeUndefined()
  })

  it('complete mode allows zero unfinished photo drafts', () => {
    const errors = validateResponderFillDraft(
      draft({
        vehicle_plate: '1234567',
        odometer_start: '100',
        odometer_end: '112',
        route: 'כביש 1',
        treatment_detail: treatmentOk,
      }),
      'complete',
      plates,
      12,
      0,
    )
    expect(errors.event_media).toBeUndefined()
  })
})

describe('gateResponderFillWrite', () => {
  it('lets a responder draft and complete a cancelled event', () => {
    expect(RESPONDER_FILL_CANCELLED_NOTE).toBe('האירוע בוטל.')
    expect(
      gateResponderFillWrite({
        complete: false,
        participationStatus: 'in_progress',
        eventStatus: 'in_progress',
      }),
    ).toBe('proceed')
    expect(
      gateResponderFillWrite({
        complete: true,
        participationStatus: 'in_progress',
        eventStatus: 'in_progress',
      }),
    ).toBe('proceed')
  })

  it('allows a blank or short פירוט on a cancelled event', () => {
    const plates = ['1234567']
    const fields = {
      vehicle_plate: '1234567',
      odometer_start: '100',
      odometer_end: '112',
      route: 'כביש 1',
    }
    for (const treatment_detail of ['', '   ', 'בוטל', 'א'.repeat(24)]) {
      expect(
        validateResponderFillDraft(
          draft({ ...fields, treatment_detail }),
          'complete',
          plates,
          12,
          0,
          true,
        ).treatment_detail,
      ).toBeUndefined()
    }
    expect(
      validateResponderFillDraft(
        draft({ ...fields, treatment_detail: 'בוטל' }),
        'complete',
        plates,
        12,
        0,
        false,
      ).treatment_detail,
    ).toBe('יש להזין לפחות 25 תווים בפירוט הטיפול.')
  })

  it('still reports an already-finished participation as success on a cancelled event', () => {
    // Retrying a save that already landed must not surface an error.
    expect(
      gateResponderFillWrite({
        complete: true,
        participationStatus: 'done',
        eventStatus: 'partial',
      }),
    ).toBe('already_complete')
  })

  it('leaves a live event untouched', () => {
    expect(
      gateResponderFillWrite({
        complete: false,
        participationStatus: 'in_progress',
        eventStatus: 'in_progress',
      }),
    ).toBe('proceed')
  })

  it('treats a second complete after the write landed as success', () => {
    expect(
      gateResponderFillWrite({
        complete: true,
        participationStatus: 'done',
        eventStatus: 'in_progress',
      }),
    ).toBe('already_complete')
  })

  it('still locks a draft save on a completed participation', () => {
    expect(
      gateResponderFillWrite({
        complete: false,
        participationStatus: 'done',
        eventStatus: 'in_progress',
      }),
    ).toBe('locked')
  })

  it('locks when the event is already done', () => {
    expect(
      gateResponderFillWrite({
        complete: true,
        participationStatus: 'in_progress',
        eventStatus: 'done',
      }),
    ).toBe('locked')
  })

  it('lets an in-progress complete proceed', () => {
    expect(
      gateResponderFillWrite({
        complete: true,
        participationStatus: 'in_progress',
        eventStatus: 'in_progress',
      }),
    ).toBe('proceed')
  })
})

describe('fillHeaderStatus', () => {
  const base = {
    participationStatus: 'done' as const,
    totalKm: null,
    origin: 'manual' as const,
    ended_at: '2026-09-13T10:00:00+03:00',
  }

  it('matches the mine list and the event detail on a shift-born event', () => {
    // Shift-born docs are shared; the lead-KM note is irrelevant there.
    expect(fillHeaderStatus({ ...base, origin: 'shift' }).note).toBeNull()
  })

  it('still tells a manual-event responder that the lead owes KM', () => {
    expect(fillHeaderStatus(base).note).toBe('אחמ״ש טרם הזין ק״מ')
  })

  it('says סיימת לתעד when the lead has not set an end time', () => {
    // The viewer's own part is done; the event stamp (ממתין למילוי פרטים) is
    // what says the אחמ״ש still owes details.
    const open = { ...base, ended_at: null, totalKm: 12 }
    expect(fillHeaderStatus(open).stamp.label).toBe('סיימת לתעד')
    expect(fillHeaderStatus(open).note).toBe('ממתין לפרטים נוספים מאחמ״ש')
  })

  it('leaves a shift-born event out of the lead-details gate', () => {
    expect(fillHeaderStatus({ ...base, origin: 'shift', ended_at: null }).note).toBeNull()
  })

  it('reports a clean finish once the lead entered KM and an end time', () => {
    expect(fillHeaderStatus({ ...base, totalKm: 12 }).note).toBeNull()
    expect(fillHeaderStatus({ ...base, totalKm: 12 }).stamp.label).toBe('הושלם')
  })
})
