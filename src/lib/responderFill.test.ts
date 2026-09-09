import { describe, expect, it } from 'vitest'
import { EVENT_MEDIA_LEFTOVER_ERROR } from './eventMedia'
import {
  deriveEventStatusAfterParticipation,
  emptyResponderFillDraft,
  gateResponderFillWrite,
  odometerRangeError,
  validateResponderFillDraft,
  type ResponderFillDraft,
} from './responderFill'
import { ODOMETER_ORDER_ERROR } from './odometer'

function draft(patch: Partial<ResponderFillDraft> = {}): ResponderFillDraft {
  return { ...emptyResponderFillDraft(), ...patch }
}

describe('deriveEventStatusAfterParticipation', () => {
  it('keeps draft-only progress as in_progress, not partial', () => {
    expect(deriveEventStatusAfterParticipation(['pending', 'in_progress'])).toBe('in_progress')
  })

  it('uses partial only when someone has completed', () => {
    expect(deriveEventStatusAfterParticipation(['done', 'pending'])).toBe('partial')
  })

  it('marks done when every participation is done', () => {
    expect(deriveEventStatusAfterParticipation(['done', 'done'])).toBe('done')
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

describe('validateResponderFillDraft (user-entered odometer end)', () => {
  const plates = ['1234567']

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
        treatment_detail: 'טיפול',
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
        treatment_detail: 'טיפול',
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
        treatment_detail: 'טיפול',
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
        treatment_detail: 'טיפול',
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
        treatment_detail: 'טיפול',
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
        treatment_detail: 'טיפול',
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
        treatment_detail: 'טיפול',
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
        treatment_detail: 'טיפול',
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
        treatment_detail: 'טיפול',
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
        treatment_detail: 'טיפול',
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
        treatment_detail: 'טיפול',
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
        treatment_detail: 'טיפול',
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
        treatment_detail: 'טיפול',
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
