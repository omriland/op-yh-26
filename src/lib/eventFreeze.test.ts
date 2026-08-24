import { describe, expect, it } from 'vitest'
import {
  computeFreezeFlags,
  eventCountsTowardFuelRefund,
  freezeTooltipHe,
  hasPendingOver60km,
  isEventFrozen, freezeNoticeHe, FREEZE_OVER_KM_HINT, FREEZE_OVER_KM_THRESHOLD, over60kmHint } from './eventFreeze'

describe('computeFreezeFlags', () => {
  it('freezes an event that matches the 60km report and is not approved', () => {
    expect(
      computeFreezeFlags({
        matchesOver60km: true,
        matchesSuspiciousDuplicate: false,
        approvedOver60km: false,
        approvedSuspiciousDuplicate: false,
      }),
    ).toEqual({
      frozen_over_60km: true,
      frozen_suspicious_duplicate: false,
    })
  })

  it('freezes an event that matches the suspicious-duplicate report and is not approved', () => {
    expect(
      computeFreezeFlags({
        matchesOver60km: false,
        matchesSuspiciousDuplicate: true,
        approvedOver60km: false,
        approvedSuspiciousDuplicate: false,
      }),
    ).toEqual({
      frozen_over_60km: false,
      frozen_suspicious_duplicate: true,
    })
  })

  it('allows both freeze reasons at once', () => {
    const flags = computeFreezeFlags({
      matchesOver60km: true,
      matchesSuspiciousDuplicate: true,
      approvedOver60km: false,
      approvedSuspiciousDuplicate: false,
    })
    expect(flags).toEqual({
      frozen_over_60km: true,
      frozen_suspicious_duplicate: true,
    })
    expect(isEventFrozen(flags)).toBe(true)
    expect(eventCountsTowardFuelRefund(flags)).toBe(false)
  })

  it('clears only the approved reason when both match', () => {
    const afterKmApprove = computeFreezeFlags({
      matchesOver60km: true,
      matchesSuspiciousDuplicate: true,
      approvedOver60km: true,
      approvedSuspiciousDuplicate: false,
    })
    expect(afterKmApprove).toEqual({
      frozen_over_60km: false,
      frozen_suspicious_duplicate: true,
    })
    expect(eventCountsTowardFuelRefund(afterKmApprove)).toBe(false)

    const afterBothApprove = computeFreezeFlags({
      matchesOver60km: true,
      matchesSuspiciousDuplicate: true,
      approvedOver60km: true,
      approvedSuspiciousDuplicate: true,
    })
    expect(afterBothApprove).toEqual({
      frozen_over_60km: false,
      frozen_suspicious_duplicate: false,
    })
    expect(isEventFrozen(afterBothApprove)).toBe(false)
    expect(eventCountsTowardFuelRefund(afterBothApprove)).toBe(true)
  })

  it('does not freeze after approve even if the event still matches the report', () => {
    expect(
      computeFreezeFlags({
        matchesOver60km: true,
        matchesSuspiciousDuplicate: false,
        approvedOver60km: true,
        approvedSuspiciousDuplicate: false,
      }),
    ).toEqual({
      frozen_over_60km: false,
      frozen_suspicious_duplicate: false,
    })
  })

  it('unfreezes a reason when the event leaves that report', () => {
    expect(
      computeFreezeFlags({
        matchesOver60km: false,
        matchesSuspiciousDuplicate: false,
        approvedOver60km: false,
        approvedSuspiciousDuplicate: false,
      }),
    ).toEqual({
      frozen_over_60km: false,
      frozen_suspicious_duplicate: false,
    })
  })
})

describe('freezeTooltipHe', () => {
  it('explains 60km freeze pending admin review', () => {
    expect(freezeTooltipHe({ frozen_over_60km: true, frozen_suspicious_duplicate: false })).toBe(
      'האירוע מוקפא בגלל חריגת קילומטרים (מעל 60 ק״מ) וממתין לאישור מנהל.',
    )
  })

  it('explains suspicious-duplicate freeze pending admin review', () => {
    expect(freezeTooltipHe({ frozen_over_60km: false, frozen_suspicious_duplicate: true })).toBe(
      'האירוע מוקפא בגלל חשד לאירוע כפול וממתין לאישור מנהל.',
    )
  })

  it('explains both reasons together', () => {
    expect(freezeTooltipHe({ frozen_over_60km: true, frozen_suspicious_duplicate: true })).toBe(
      'האירוע מוקפא בגלל חריגת קילומטרים (מעל 60 ק״מ) ובגלל חשד לאירוע כפול, וממתין לאישור מנהל.',
    )
  })

  it('returns null when the event is not frozen', () => {
    expect(freezeTooltipHe({ frozen_over_60km: false, frozen_suspicious_duplicate: false })).toBeNull()
  })
})

describe('hasPendingOver60km', () => {
  it('is false when every current over-60km responder was already approved', () => {
    expect(hasPendingOver60km(['r-a'], ['r-a'])).toBe(false)
    expect(hasPendingOver60km(['r-a'], ['r-a', 'r-old'])).toBe(false)
  })

  it('is true when another responder now exceeds 60km', () => {
    expect(hasPendingOver60km(['r-a', 'r-b'], ['r-a'])).toBe(true)
    expect(hasPendingOver60km(['r-b'], ['r-a'])).toBe(true)
  })

  it('is true before any over-60km approval', () => {
    expect(hasPendingOver60km(['r-a'], [])).toBe(true)
  })
})

describe('isEventFrozen', () => {
  it('is false when neither reason is active', () => {
    expect(isEventFrozen({ frozen_over_60km: false, frozen_suspicious_duplicate: false })).toBe(false)
  })

  it('is true for either reason', () => {
    expect(isEventFrozen({ frozen_over_60km: true, frozen_suspicious_duplicate: false })).toBe(true)
    expect(isEventFrozen({ frozen_over_60km: false, frozen_suspicious_duplicate: true })).toBe(true)
  })
})

describe('freezeNoticeHe', () => {
  it('names the km reason and the pending approval', () => {
    expect(freezeNoticeHe({ frozen_over_60km: true, frozen_suspicious_duplicate: false })).toBe(
      'מוקפא · חריגת ק״מ · ממתין לאישור מנהל',
    )
  })

  it('names the duplicate reason', () => {
    expect(freezeNoticeHe({ frozen_over_60km: false, frozen_suspicious_duplicate: true })).toBe(
      'מוקפא · חשד לאירוע כפול · ממתין לאישור מנהל',
    )
  })

  it('combines both reasons on one line', () => {
    expect(freezeNoticeHe({ frozen_over_60km: true, frozen_suspicious_duplicate: true })).toBe(
      'מוקפא · חריגת ק״מ וחשד לכפילות · ממתין לאישור מנהל',
    )
  })

  it('returns nothing when the event is not frozen', () => {
    expect(freezeNoticeHe({ frozen_over_60km: false, frozen_suspicious_duplicate: false })).toBeNull()
    expect(freezeNoticeHe(null)).toBeNull()
    expect(freezeNoticeHe(undefined)).toBeNull()
  })

  it('never uses an exclamation mark', () => {
    const all = [
      freezeNoticeHe({ frozen_over_60km: true }),
      freezeNoticeHe({ frozen_suspicious_duplicate: true }),
      freezeNoticeHe({ frozen_over_60km: true, frozen_suspicious_duplicate: true }),
    ]
    for (const line of all) expect(line).not.toContain('!')
  })
})

describe('over60kmHint', () => {
  it('warns at and above the freeze threshold', () => {
    expect(over60kmHint('60')).toBe(FREEZE_OVER_KM_HINT)
    expect(over60kmHint('62')).toBe(FREEZE_OVER_KM_HINT)
    expect(over60kmHint('140.5')).toBe(FREEZE_OVER_KM_HINT)
  })

  it('stays silent below it', () => {
    expect(over60kmHint('59')).toBeUndefined()
    expect(over60kmHint('59.9')).toBeUndefined()
    expect(over60kmHint('0')).toBeUndefined()
  })

  it('stays silent for non-numeric or empty input', () => {
    expect(over60kmHint('')).toBeUndefined()
    expect(over60kmHint('מתנדב ללא רכב')).toBeUndefined()
  })

  it('mirrors the database threshold and does not shout', () => {
    expect(FREEZE_OVER_KM_THRESHOLD).toBe(60)
    expect(FREEZE_OVER_KM_HINT).not.toContain('!')
  })
})
