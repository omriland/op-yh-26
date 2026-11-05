import { describe, expect, it } from 'vitest'
import {
  SHIFT_CREW_ERROR,
  SHIFT_ODOMETER_ORDER_ERROR,
  summarizeShiftSaveErrors,
  buildShiftUpdatePayload,
  computeTotalKm,
  shiftEventAlreadyLinkedMessage,
  validateShiftSave,
  resolveShiftFormStash,
  shiftFormStashFrom,
  type ShiftFormDraft,
} from './shiftForm'
import { emptyShiftBornFillDraft, type ShiftBornEventFillRow } from './shiftBornFill'

const baseDraft: ShiftFormDraft = {
  id: 's1',
  status: 'in_progress',
  shift_date: '2026-08-11',
  shift_kind: 'morning',
  vehicle_type: 'personal',
  personal_vehicle_id: 'v1',
  responder_ids: [],
  event_ids: [],
  odometer_start: 100,
  odometer_end: 150,
  total_km: 50,
  notes: '  hi  ',
  event_type_counts: [],
  treated_vehicle_counts: [],
  cancelled_count: 0,
}

describe('shiftEventAlreadyLinkedMessage', () => {
  it('includes the police event number when present', () => {
    expect(shiftEventAlreadyLinkedMessage('12345')).toBe(
      'אירוע 12345 כבר מקושר למשמרת אחרת',
    )
  })

  it('falls back when the event number is missing', () => {
    expect(shiftEventAlreadyLinkedMessage(null)).toBe(
      'האירוע כבר מקושר למשמרת אחרת',
    )
    expect(shiftEventAlreadyLinkedMessage('   ')).toBe(
      'האירוע כבר מקושר למשמרת אחרת',
    )
  })
})

describe('validateShiftSave crew size', () => {
  it('requires between one and three responders', () => {
    expect(validateShiftSave(baseDraft).some((row) => row.field === 'responder_ids')).toBe(
      true,
    )
    expect(
      validateShiftSave({ ...baseDraft, responder_ids: ['a'] }).some(
        (row) => row.field === 'responder_ids',
      ),
    ).toBe(false)
    expect(
      validateShiftSave({ ...baseDraft, responder_ids: ['a', 'b', 'c'] }).some(
        (row) => row.field === 'responder_ids',
      ),
    ).toBe(false)
    expect(
      validateShiftSave({ ...baseDraft, responder_ids: ['a', 'b', 'c', 'd'] }).map(
        (row) => row.message,
      ),
    ).toContain(SHIFT_CREW_ERROR)
  })
})

describe('buildShiftUpdatePayload', () => {
  it('includes identity fields when canEditIdentity', () => {
    const payload = buildShiftUpdatePayload(baseDraft, { canEditIdentity: true })
    expect(payload).toMatchObject({
      shift_date: '2026-08-11',
      shift_kind: 'morning',
      vehicle_type: 'personal',
      personal_vehicle_id: 'v1',
      odometer_start: 100,
      odometer_end: 150,
      total_km: 50,
      notes: 'hi',
    })
    expect(payload).toHaveProperty('updated_at')
  })

  it('omits identity fields when !canEditIdentity', () => {
    const payload = buildShiftUpdatePayload(baseDraft, { canEditIdentity: false })
    expect(payload).not.toHaveProperty('shift_date')
    expect(payload).not.toHaveProperty('shift_kind')
    expect(payload).not.toHaveProperty('vehicle_type')
    expect(payload).not.toHaveProperty('personal_vehicle_id')
    expect(payload).toMatchObject({
      odometer_start: 100,
      odometer_end: 150,
      total_km: 50,
      notes: 'hi',
    })
  })

  it('nulls personal_vehicle_id when vehicle is not personal (lead path)', () => {
    const payload = buildShiftUpdatePayload(
      { ...baseDraft, vehicle_type: 'patrol_north', personal_vehicle_id: 'v1' },
      { canEditIdentity: true },
    )
    expect(payload.personal_vehicle_id).toBeNull()
  })
})

function draft(over: Partial<ShiftFormDraft> = {}): ShiftFormDraft {
  // A crew of one keeps the crew rule satisfied so only odometer errors surface.
  return { ...baseDraft, responder_ids: ['u1'], ...over }
}

describe('odometer order', () => {
  it('rejects an end reading below the start', () => {
    // Assert the constant is real first: `hit?.message` against an undefined export
    // passes vacuously, which is how this rule could ship unimplemented.
    expect(typeof SHIFT_ODOMETER_ORDER_ERROR).toBe('string')
    expect(SHIFT_ODOMETER_ORDER_ERROR.length).toBeGreaterThan(0)

    const errors = validateShiftSave(draft({ odometer_start: 120000, odometer_end: 119800 }))
    const hit = errors.find((e) => e.field === 'odometer_end')
    expect(hit).toBeDefined()
    expect(hit?.message).toBe(SHIFT_ODOMETER_ORDER_ERROR)
  })

  it('allows an equal reading — a shift whose vehicle never left base is zero km', () => {
    const errors = validateShiftSave(draft({ odometer_start: 120000, odometer_end: 120000 }))
    expect(errors.some((e) => e.field === 'odometer_end')).toBe(false)
  })

  it('allows a normal ascending pair', () => {
    const errors = validateShiftSave(draft({ odometer_start: 120000, odometer_end: 120412 }))
    expect(errors.some((e) => e.field === 'odometer_end')).toBe(false)
  })

  it('stays silent while only one reading is present', () => {
    // Null the sibling explicitly — baseDraft carries both readings, so omitting one
    // from the override would leave a stale value and test the reversed case instead.
    expect(
      validateShiftSave(
        draft({ odometer_start: 120000, odometer_end: null }),
      ).some((e) => e.field === 'odometer_end'),
    ).toBe(false)
    expect(
      validateShiftSave(
        draft({ odometer_start: null, odometer_end: 120000 }),
      ).some((e) => e.field === 'odometer_end'),
    ).toBe(false)
  })

  it('names the problem without an exclamation mark', () => {
    expect(SHIFT_ODOMETER_ORDER_ERROR).not.toContain('!')
    expect(SHIFT_ODOMETER_ORDER_ERROR).toContain('מד אוץ סיום')
  })
})

describe('computeTotalKm', () => {
  it('never yields a negative distance', () => {
    expect(computeTotalKm(120000, 119800)).toBeNull()
  })

  it('yields zero for an unmoved vehicle', () => {
    expect(computeTotalKm(120000, 120000)).toBe(0)
  })

  it('yields the difference for a normal pair', () => {
    expect(computeTotalKm(120000, 120412)).toBe(412)
  })

  it('yields null when either reading is missing', () => {
    expect(computeTotalKm(null, 120412)).toBeNull()
    expect(computeTotalKm(120000, null)).toBeNull()
  })
})

describe('summarizeShiftSaveErrors', () => {
  it('names the odometer problem rather than the missing-field default', () => {
    const errors = validateShiftSave(draft({ odometer_start: 120000, odometer_end: 119800 }))
    expect(summarizeShiftSaveErrors(errors)).toBe(SHIFT_ODOMETER_ORDER_ERROR)
  })

  it('names the crew problem when that is the blocker', () => {
    const errors = validateShiftSave(draft({ responder_ids: [] }))
    expect(summarizeShiftSaveErrors(errors)).toBe(SHIFT_CREW_ERROR)
  })

  it('falls back to the missing-field summary', () => {
    const errors = validateShiftSave(draft({ shift_date: '' }))
    expect(summarizeShiftSaveErrors(errors)).toBe(
      'יש למלא תאריך, שם משמרת וסוג רכב לפני השמירה.',
    )
  })
})


describe('shift form device stash', () => {
  const server: ShiftFormDraft = { ...baseDraft, expected_updated_at: 't2', status: 'in_progress' }
  const bornRow: ShiftBornEventFillRow = {
    id: 'ev-1',
    typeName: 'פנצ׳ר',
    status: 'in_progress',
    expected_updated_at: 'e2',
    draft: emptyShiftBornFillDraft(),
    saved: emptyShiftBornFillDraft(),
  }
  const loaded = { draft: server, bornRows: [bornRow] }

  it('uses the server copy when nothing was stashed', () => {
    expect(resolveShiftFormStash(loaded, null)).toEqual({ ...loaded, restored: false, serverMovedOn: false })
  })

  it('ignores a stash that differs only in token or derived status', () => {
    const stash = shiftFormStashFrom({ ...server, expected_updated_at: 't1', status: 'closed' }, [bornRow])
    expect(resolveShiftFormStash(loaded, stash).restored).toBe(false)
  })

  it('restores typed fields onto the server token, so saving is not refused as stale', () => {
    const stash = shiftFormStashFrom({ ...server, notes: 'נכתב במכשיר' }, [bornRow])
    const result = resolveShiftFormStash(loaded, stash)
    expect(result.restored).toBe(true)
    expect(result.serverMovedOn).toBe(false)
    expect(result.draft.notes).toBe('נכתב במכשיר')
    expect(result.draft.expected_updated_at).toBe('t2')
  })

  it('says so when a teammate saved after the device copy was typed', () => {
    const stash = shiftFormStashFrom(
      { ...server, expected_updated_at: 't1', notes: 'נכתב במכשיר' },
      [bornRow],
    )
    const result = resolveShiftFormStash(loaded, stash)
    expect(result.serverMovedOn).toBe(true)
    expect(result.draft.expected_updated_at).toBe('t2')
  })

  it('stashes and restores inline born-row edits, keeping the server copy as the baseline', () => {
    const typed = { ...bornRow, draft: { ...bornRow.draft, treatment_detail: 'פירוט' } }
    const stash = shiftFormStashFrom(server, [typed])
    expect(stash.born_drafts).toEqual([
      { id: 'ev-1', base_updated_at: 'e2', draft: typed.draft },
    ])
    const result = resolveShiftFormStash(loaded, stash)
    expect(result.restored).toBe(true)
    expect(result.serverMovedOn).toBe(false)
    expect(result.bornRows[0].draft.treatment_detail).toBe('פירוט')
    expect(result.bornRows[0].saved).toEqual(bornRow.saved)
  })

  it('flags a born row a teammate saved since, and drops rows that no longer exist', () => {
    const typed = { ...bornRow, expected_updated_at: 'e1', draft: { ...bornRow.draft, location: 'צומת' } }
    const gone = { ...typed, id: 'ev-gone' }
    const result = resolveShiftFormStash(loaded, shiftFormStashFrom(server, [typed, gone]))
    expect(result.serverMovedOn).toBe(true)
    expect(result.bornRows.map((row) => row.id)).toEqual(['ev-1'])
  })
})
