import { describe, expect, it } from 'vitest'
import { eventMissingLeadDoneDetails } from './eventStatus'
import { SHIFT_BORN_DONE_LOCKED, SHIFT_BORN_TOO_EARLY, STALE_SAVE_MESSAGE } from './shiftBornEvents'
import {
  emptyShiftBornFillDraft,
  shiftBornCompleteErrors,
  shiftBornFillErrorMessage,
  bornRowsToSave,
  resolveShiftBornStash,
  shiftBornEventFillRowsFrom,
  type ShiftBornFillDraft,
} from './shiftBornFill'

function draft(over: Partial<ShiftBornFillDraft> = {}): ShiftBornFillDraft {
  return { ...emptyShiftBornFillDraft(), ...over }
}

describe('shiftBornCompleteErrors', () => {
  it('refuses an empty record on all three required fields', () => {
    const errors = shiftBornCompleteErrors(draft())
    expect(errors.road_id).toBe('יש לבחור כביש')
    expect(errors.location).toBe('יש להזין מיקום')
    expect(errors.treatment_detail).toBe('יש להזין לפחות 25 תווים בפירוט הטיפול.')
  })

  it('requires at least 25 characters in פירוט טיפול and allows more', () => {
    const short = shiftBornCompleteErrors(
      draft({ road_id: 'r1', location: 'מחלף שורק', treatment_detail: 'א'.repeat(24) }),
    )
    expect(short.treatment_detail).toBe('יש להזין לפחות 25 תווים בפירוט הטיפול.')

    const exact = shiftBornCompleteErrors(
      draft({
        road_id: 'r1',
        location: 'מחלף שורק',
        treatment_detail: `  ${'א'.repeat(25)}  `,
      }),
    )
    expect(exact.treatment_detail).toBeUndefined()

    const longer = shiftBornCompleteErrors(
      draft({ road_id: 'r1', location: 'מחלף שורק', treatment_detail: 'א'.repeat(80) }),
    )
    expect(longer.treatment_detail).toBeUndefined()
  })

  it('keeps the 25-character minimum when the event is cancelled', () => {
    const short = shiftBornCompleteErrors(
      draft({ road_id: 'r1', location: 'מחלף שורק', treatment_detail: 'בוטל' }),
    )
    expect(short.treatment_detail).toBe('יש להזין לפחות 25 תווים בפירוט הטיפול.')

    const exact = shiftBornCompleteErrors(
      draft({ road_id: 'r1', location: 'מחלף שורק', treatment_detail: 'א'.repeat(25) }),
    )
    expect(exact.treatment_detail).toBeUndefined()
  })

  it('accepts a complete record', () => {
    const errors = shiftBornCompleteErrors(
      draft({ road_id: 'r1', location: 'מחלף שורק', treatment_detail: 'א'.repeat(40) }),
    )
    expect(errors).toEqual({})
  })

  it('treats whitespace as empty', () => {
    const errors = shiftBornCompleteErrors(
      draft({ road_id: 'r1', location: '   ', treatment_detail: '\n\t' }),
    )
    expect(errors.location).toBeDefined()
    expect(errors.treatment_detail).toBeDefined()
    expect(errors.road_id).toBeUndefined()
  })

  it('names the problem and the action, with no exclamation mark', () => {
    const errors = shiftBornCompleteErrors(draft())
    for (const message of Object.values(errors)) {
      expect(message).not.toContain('!')
      expect(message.startsWith('יש ')).toBe(true)
    }
  })

  it('does not require the optional fields', () => {
    const errors = shiftBornCompleteErrors(
      draft({ road_id: 'r1', location: 'x', treatment_detail: 'א'.repeat(40) }),
    )
    expect(errors).toEqual({})
  })

  it('completes with no event end time and no per-responder KM', () => {
    const errors = shiftBornCompleteErrors(
      draft({ road_id: 'r1', location: 'x', treatment_detail: 'א'.repeat(40) }),
    )
    expect(errors).toEqual({})
  })
})

describe('shiftBornFillErrorMessage', () => {
  it('shows the save RPC refusals as-is, not as a connection error', () => {
    expect(shiftBornFillErrorMessage(`P0001: ${SHIFT_BORN_TOO_EARLY}`)).toBe(SHIFT_BORN_TOO_EARLY)
    expect(shiftBornFillErrorMessage(SHIFT_BORN_DONE_LOCKED)).toBe(SHIFT_BORN_DONE_LOCKED)
    expect(shiftBornFillErrorMessage(STALE_SAVE_MESSAGE)).toBe(STALE_SAVE_MESSAGE)
    expect(shiftBornFillErrorMessage('אין הרשאה')).toBe('אין הרשאה')
  })

  it('falls back to the connection message for anything else', () => {
    expect(shiftBornFillErrorMessage('fetch failed')).toBe(
      'שמירת האירוע נכשלה. בדקו את החיבור ונסו שוב.',
    )
    expect(shiftBornFillErrorMessage(undefined)).toBe(
      'שמירת האירוע נכשלה. בדקו את החיבור ונסו שוב.',
    )
  })
})

describe('bornRowsToSave', () => {
  const [row] = shiftBornEventFillRowsFrom([
    {
      id: 'ev-1',
      status: 'in_progress',
      police_event_id: null,
      treatment_detail: 'נשמר',
      treatment_notes: null,
      updated_at: 't1',
      event_type: { name: 'פנצ׳ר' },
      treated: [],
      treated_plates: [{ plate_number: '1234567', sort_order: 0 }],
    },
  ])

  it('keeps the loaded plates on the row, so saving it does not wipe them', () => {
    expect(row.draft.treated_plates.map((plate) => plate.plate_number)).toEqual(['1234567'])
  })

  it('saves only the rows edited since the last load or save', () => {
    expect(bornRowsToSave([row])).toEqual([])
    const edited = { ...row, id: 'ev-2', draft: { ...row.draft, location: 'מחלף שורק' } }
    expect(bornRowsToSave([row, edited])).toEqual([edited])
  })
})

describe('resolveShiftBornStash', () => {
  const server = { draft: draft({ location: 'שרת' }), expected_updated_at: 't2' }

  it('uses the server copy when the device holds nothing new', () => {
    expect(resolveShiftBornStash(server, null)).toEqual({
      draft: server.draft,
      restored: false,
      serverMovedOn: false,
    })
    expect(
      resolveShiftBornStash(server, { ...server.draft, base_updated_at: 't1' }).restored,
    ).toBe(false)
  })

  it('restores device edits typed over the current version without a warning', () => {
    const result = resolveShiftBornStash(server, {
      ...draft({ location: 'מכשיר' }),
      base_updated_at: 't2',
    })
    expect(result).toEqual({ draft: draft({ location: 'מכשיר' }), restored: true, serverMovedOn: false })
  })

  it('flags device edits typed over an older version, so a teammate’s save is not overwritten silently', () => {
    expect(
      resolveShiftBornStash(server, { ...draft({ location: 'מכשיר' }), base_updated_at: 't1' })
        .serverMovedOn,
    ).toBe(true)
    // A stash from before this field existed cannot prove it is current.
    expect(resolveShiftBornStash(server, draft({ location: 'מכשיר' })).serverMovedOn).toBe(true)
  })
})

describe('eventMissingLeadDoneDetails', () => {
  it('treats a missing event end time as a lead detail gap', () => {
    expect(eventMissingLeadDoneDetails(null)).toBe(true)
    expect(eventMissingLeadDoneDetails('   ')).toBe(true)
    expect(eventMissingLeadDoneDetails('2026-09-10T11:13:00')).toBe(false)
  })
})
