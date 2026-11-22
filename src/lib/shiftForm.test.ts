import { describe, expect, it } from 'vitest'
import {
  SHIFT_CREW_ERROR,
  SHIFT_ODOMETER_ORDER_ERROR,
  summarizeShiftSaveErrors,
  buildShiftUpdatePayload,
  computeTotalKm,
  shiftEventAlreadyLinkedMessage,
  validateShiftSave,
  SHIFT_HOURS_REQUIRED_ERROR,
  SHIFT_OVERLAP_GENERAL_MESSAGE,
  buildShiftWindowTimestamps,
  fillDefaultShiftHours,
  mapShiftOverlapError,
  findCrewOverlapMessage,
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
  start_time: '07:00',
  end_time: '15:00',
  is_legacy: false,
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

  it('names the hours when they are the only thing missing', () => {
    const errors = validateShiftSave(draft({ start_time: '', end_time: '' }))
    expect(errors.map((row) => row.field).sort()).toEqual(['end_time', 'start_time'])
    expect(summarizeShiftSaveErrors(errors)).toBe(SHIFT_HOURS_REQUIRED_ERROR)
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

describe('shift hours validation', () => {
  const newShift: ShiftFormDraft = {
    ...baseDraft,
    id: undefined,
    responder_ids: ['a'],
    start_time: '',
    end_time: '',
  }

  it('refuses a new shift without start or end time, in Hebrew', () => {
    const errors = validateShiftSave(newShift)
    expect(errors.find((row) => row.field === 'start_time')?.message).toBe(
      SHIFT_HOURS_REQUIRED_ERROR,
    )
    expect(errors.find((row) => row.field === 'end_time')?.message).toBe(
      SHIFT_HOURS_REQUIRED_ERROR,
    )
    expect(SHIFT_HOURS_REQUIRED_ERROR).toMatch(/[א-ת]/)
  })

  it('refuses a new shift that has only one of the two times', () => {
    const onlyStart = validateShiftSave({ ...newShift, start_time: '07:00' })
    expect(onlyStart.some((row) => row.field === 'end_time')).toBe(true)
    expect(onlyStart.some((row) => row.field === 'start_time')).toBe(false)
  })

  it('accepts a new shift with both times', () => {
    const errors = validateShiftSave({ ...newShift, start_time: '07:00', end_time: '15:00' })
    expect(errors.some((row) => row.field === 'start_time' || row.field === 'end_time')).toBe(
      false,
    )
  })

  it('refuses an existing shift that is not legacy and has no hours', () => {
    const existing: ShiftFormDraft = { ...newShift, id: 's1', is_legacy: false }
    const errors = validateShiftSave(existing)
    expect(errors.find((row) => row.field === 'start_time')?.message).toBe(
      SHIFT_HOURS_REQUIRED_ERROR,
    )
    expect(errors.find((row) => row.field === 'end_time')?.message).toBe(
      SHIFT_HOURS_REQUIRED_ERROR,
    )
    const { is_legacy: _omitted, ...withoutLegacyFlag } = existing
    expect(
      validateShiftSave(withoutLegacyFlag).some((row) => row.field === 'start_time'),
    ).toBe(true)
  })

  it('still saves a legacy shift that has no hours', () => {
    const legacy: ShiftFormDraft = { ...newShift, id: 's1', is_legacy: true }
    expect(validateShiftSave(legacy)).toEqual([])
  })
})

describe('buildShiftWindowTimestamps', () => {
  it('builds Asia/Jerusalem summer time (UTC+3) on the shift date', () => {
    expect(buildShiftWindowTimestamps('2026-08-11', '07:00', '15:00')).toEqual({
      starts_at: '2026-08-11T04:00:00.000Z',
      ends_at: '2026-08-11T12:00:00.000Z',
    })
  })

  it('builds Asia/Jerusalem winter time (UTC+2)', () => {
    expect(buildShiftWindowTimestamps('2026-12-01', '07:00', '15:00')).toEqual({
      starts_at: '2026-12-01T05:00:00.000Z',
      ends_at: '2026-12-01T13:00:00.000Z',
    })
  })

  it('ends the next day when the end time is earlier than the start time', () => {
    expect(buildShiftWindowTimestamps('2026-08-11', '23:00', '07:00')).toEqual({
      starts_at: '2026-08-11T20:00:00.000Z',
      ends_at: '2026-08-12T04:00:00.000Z',
    })
  })

  it('rolls the next day over a month end', () => {
    expect(buildShiftWindowTimestamps('2026-08-31', '22:00', '06:00').ends_at).toBe(
      '2026-09-01T03:00:00.000Z',
    )
  })
})

describe('fillDefaultShiftHours', () => {
  it('fills empty fields from the kind defaults', () => {
    expect(fillDefaultShiftHours({ start_time: '', end_time: '' }, 'morning')).toEqual({
      start_time: '07:00',
      end_time: '15:00',
    })
    expect(fillDefaultShiftHours({ start_time: '', end_time: '' }, 'midday')).toEqual({
      start_time: '15:00',
      end_time: '23:00',
    })
  })

  it('never overwrites a time the lead already typed', () => {
    expect(fillDefaultShiftHours({ start_time: '08:30', end_time: '' }, 'morning')).toEqual({
      start_time: '08:30',
      end_time: '15:00',
    })
    expect(fillDefaultShiftHours({ start_time: '08:30', end_time: '16:45' }, 'midday')).toEqual({
      start_time: '08:30',
      end_time: '16:45',
    })
  })

  it('leaves the fields empty for a kind without default hours', () => {
    expect(fillDefaultShiftHours({ start_time: '', end_time: '' }, 'escort')).toEqual({
      start_time: '',
      end_time: '',
    })
  })
})

describe('mapShiftOverlapError', () => {
  const dbMessage = 'המשמרת חופפת למשמרת אחרת של אחד מאנשי הצוות.'
  const other = {
    id: 'other-1',
    shift_kind: 'midday' as const,
    starts_at: '2026-08-11T12:00:00.000Z',
    ends_at: '2026-08-11T20:00:00.000Z',
  }

  it('names the other shift type and hours when the form knows that shift', () => {
    const text = mapShiftOverlapError({ message: dbMessage, details: 'other-1' }, [other])
    expect(text).toContain('צהריים')
    expect(text).toContain('15:00–23:00')
  })

  it('falls back to the general sentence when the other shift is unknown', () => {
    expect(mapShiftOverlapError({ message: dbMessage, details: 'unknown' }, [other])).toBe(
      SHIFT_OVERLAP_GENERAL_MESSAGE,
    )
    expect(mapShiftOverlapError({ message: dbMessage }, [])).toBe(SHIFT_OVERLAP_GENERAL_MESSAGE)
  })

  it('does not leak raw database text', () => {
    const text = mapShiftOverlapError({ message: dbMessage, details: 'other-1' }, [other])
    expect(text).not.toContain('other-1')
    expect(text).not.toContain(dbMessage)
    expect(SHIFT_OVERLAP_GENERAL_MESSAGE).toMatch(/[א-ת]/)
  })
})

describe('findCrewOverlapMessage', () => {
  const crew = [
    { id: 'r1', name: 'דנה' },
    { id: 'r2', name: 'יוסי' },
  ]
  const window = { starts_at: '2026-08-11T04:00:00.000Z', ends_at: '2026-08-11T12:00:00.000Z' }
  const clashing = {
    id: 'o1',
    shift_kind: 'reinforcement' as const,
    starts_at: '2026-08-11T10:00:00.000Z',
    ends_at: '2026-08-11T14:00:00.000Z',
    responder_ids: ['r2'],
  }

  it('names the responder, the clashing shift type and its hours', () => {
    expect(findCrewOverlapMessage({ window, crew, others: [clashing] })).toBe(
      'לא ניתן לשבץ את יוסי: כבר משובץ במשמרת תגבור באותן שעות (13:00–17:00).',
    )
  })

  it('allows shifts that only touch at the edge', () => {
    const touching = { ...clashing, starts_at: window.ends_at, ends_at: '2026-08-11T20:00:00.000Z' }
    expect(findCrewOverlapMessage({ window, crew, others: [touching] })).toBeNull()
  })

  it('ignores overlapping shifts of people who are not on this crew', () => {
    expect(
      findCrewOverlapMessage({ window, crew, others: [{ ...clashing, responder_ids: ['x'] }] }),
    ).toBeNull()
  })

  it('ignores the shift being edited but still reports a different clashing shift', () => {
    expect(
      findCrewOverlapMessage({ window, crew, others: [clashing], ignoreShiftId: 'o1' }),
    ).toBeNull()
    const otherClash = { ...clashing, id: 'o2' }
    expect(
      findCrewOverlapMessage({
        window,
        crew,
        others: [clashing, otherClash],
        ignoreShiftId: 'o1',
      }),
    ).toBe('לא ניתן לשבץ את יוסי: כבר משובץ במשמרת תגבור באותן שעות (13:00–17:00).')
  })
})
