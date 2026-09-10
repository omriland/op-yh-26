import { describe, expect, it } from 'vitest'
import {
  computeFreezeFlags,
  participationCountsTowardFuelRefund,
  freezeTooltipHe,
  freezeViewFor,
  hasPendingOver60km,
  isFreezeAdminRole,
  participationFreezeView,
  isEventFrozen, freezeNoticeHe, FREEZE_OVER_KM_HINT, FREEZE_OVER_KM_THRESHOLD, over60kmHint } from './eventFreeze'

describe('computeFreezeFlags', () => {
  it('freezes an event that matches the high-km report and is not approved', () => {
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
    expect(participationCountsTowardFuelRefund(flags)).toBe(false)
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
    expect(participationCountsTowardFuelRefund(afterKmApprove)).toBe(false)

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
    expect(participationCountsTowardFuelRefund(afterBothApprove)).toBe(true)
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
  it('tells an admin the event holds a frozen record, not that the event is frozen', () => {
    expect(freezeTooltipHe({ frozen_over_60km: true, frozen_suspicious_duplicate: false })).toBe(
      'באירוע קיימת הקפאה בגלל חריגת קילומטרים (מעל 80 ק״מ), הממתינה לאישור מנהל.',
    )
  })

  it('explains suspicious-duplicate freeze pending admin review', () => {
    expect(freezeTooltipHe({ frozen_over_60km: false, frozen_suspicious_duplicate: true })).toBe(
      'באירוע קיימת הקפאה בגלל חשד לאירוע כפול, הממתינה לאישור מנהל.',
    )
  })

  it('explains both reasons together', () => {
    expect(freezeTooltipHe({ frozen_over_60km: true, frozen_suspicious_duplicate: true })).toBe(
      'באירוע קיימת הקפאה בגלל חריגת קילומטרים (מעל 80 ק״מ) ובגלל חשד לאירוע כפול, הממתינה לאישור מנהל.',
    )
  })

  it('speaks about the reader own record on the mine scope', () => {
    expect(freezeTooltipHe({ frozen_over_60km: true }, 'mine')).toBe(
      'הדיווח שלך מוקפא בגלל חריגת קילומטרים (מעל 80 ק״מ) וממתין לאישור מנהל.',
    )
  })

  it('speaks about one volunteer record on the participation scope', () => {
    expect(freezeTooltipHe({ frozen_suspicious_duplicate: true }, 'participation')).toBe(
      'הדיווח מוקפא בגלל חשד לאירוע כפול וממתין לאישור מנהל.',
    )
  })

  it('returns null when nothing is frozen', () => {
    expect(freezeTooltipHe({ frozen_over_60km: false, frozen_suspicious_duplicate: false })).toBeNull()
  })
})

describe('hasPendingOver60km', () => {
  it('is false when every current over-threshold responder was already approved', () => {
    expect(hasPendingOver60km(['r-a'], ['r-a'])).toBe(false)
    expect(hasPendingOver60km(['r-a'], ['r-a', 'r-old'])).toBe(false)
  })

  it('is true when another responder now exceeds the km threshold', () => {
    expect(hasPendingOver60km(['r-a', 'r-b'], ['r-a'])).toBe(true)
    expect(hasPendingOver60km(['r-b'], ['r-a'])).toBe(true)
  })

  it('is true before any over-threshold km approval', () => {
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

  it('marks the reader own record on the mine scope', () => {
    expect(freezeNoticeHe({ frozen_over_60km: true }, 'mine')).toBe(
      'הדיווח שלך מוקפא · חריגת ק״מ · ממתין לאישור מנהל',
    )
  })

  it('returns nothing when nothing is frozen', () => {
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
    expect(over60kmHint('80')).toBe(FREEZE_OVER_KM_HINT)
    expect(over60kmHint('82')).toBe(FREEZE_OVER_KM_HINT)
    expect(over60kmHint('140.5')).toBe(FREEZE_OVER_KM_HINT)
  })

  it('stays silent below it', () => {
    expect(over60kmHint('79')).toBeUndefined()
    expect(over60kmHint('79.9')).toBeUndefined()
    expect(over60kmHint('60')).toBeUndefined()
    expect(over60kmHint('0')).toBeUndefined()
  })

  it('stays silent for non-numeric or empty input', () => {
    expect(over60kmHint('')).toBeUndefined()
    expect(over60kmHint('מתנדב ללא רכב')).toBeUndefined()
  })

  it('mirrors the database threshold and does not shout', () => {
    expect(FREEZE_OVER_KM_THRESHOLD).toBe(80)
    expect(FREEZE_OVER_KM_HINT).not.toContain('!')
  })
})

describe('freezeViewFor', () => {
  // The case that started this: one volunteer over the km threshold, one well
  // under it, same event.
  const mixedEvent = {
    frozen_over_60km: true,
    frozen_suspicious_duplicate: false,
    responders: [
      { responder_id: 'over', frozen_over_60km: true, frozen_suspicious_duplicate: false },
      { responder_id: 'under', frozen_over_60km: false, frozen_suspicious_duplicate: false },
    ],
  }

  it('shows an admin the event whenever any participation is frozen', () => {
    const view = freezeViewFor({ userId: 'boss', isAdmin: true }, mixedEvent)
    expect(view).toEqual({
      flags: { frozen_over_60km: true, frozen_suspicious_duplicate: false },
      scope: 'event',
    })
  })

  it('shows the over-threshold responder their own freeze', () => {
    expect(freezeViewFor({ userId: 'over', isAdmin: false }, mixedEvent)?.scope).toBe('mine')
  })

  it('shows nothing to the responder whose km is under the threshold', () => {
    expect(freezeViewFor({ userId: 'under', isAdmin: false }, mixedEvent)).toBeNull()
  })

  it('shows nothing to a shift-lead who is not assigned', () => {
    expect(freezeViewFor({ userId: 'lead', isAdmin: false }, mixedEvent)).toBeNull()
  })

  it('never falls back to the event aggregate for a non-admin', () => {
    const noParticipations = { frozen_over_60km: true, frozen_suspicious_duplicate: true }
    expect(freezeViewFor({ userId: 'lead', isAdmin: false }, noParticipations)).toBeNull()
    expect(freezeViewFor({ userId: 'lead', isAdmin: true }, noParticipations)?.scope).toBe('event')
  })

  it('lets an admin see a freeze carried only on the participations', () => {
    const view = freezeViewFor(
      { userId: 'boss', isAdmin: true },
      {
        responders: [
          { responder_id: 'over', frozen_suspicious_duplicate: true },
        ],
      },
    )
    expect(view).toEqual({
      flags: { frozen_over_60km: false, frozen_suspicious_duplicate: true },
      scope: 'event',
    })
  })

  it('shows nothing without a viewer or a source', () => {
    expect(freezeViewFor(null, mixedEvent)).toBeNull()
    expect(freezeViewFor({ userId: 'boss', isAdmin: true }, null)).toBeNull()
  })
})

describe('participationFreezeView', () => {
  const frozen = { responder_id: 'over', frozen_over_60km: true }

  it('reads as the reader own record for the owner', () => {
    expect(participationFreezeView({ userId: 'over', isAdmin: false }, frozen)?.scope).toBe('mine')
  })

  it('reads as one volunteer record for an admin', () => {
    expect(participationFreezeView({ userId: 'boss', isAdmin: true }, frozen)?.scope).toBe(
      'participation',
    )
  })

  it('is hidden from a shift-lead and from other volunteers', () => {
    expect(participationFreezeView({ userId: 'lead', isAdmin: false }, frozen)).toBeNull()
    expect(participationFreezeView({ userId: 'other', isAdmin: false }, frozen)).toBeNull()
  })

  it('is hidden when that participation is not frozen', () => {
    expect(
      participationFreezeView({ userId: 'boss', isAdmin: true }, { responder_id: 'x' }),
    ).toBeNull()
  })
})

describe('isFreezeAdminRole', () => {
  it('is true for admin and super admin only', () => {
    expect(isFreezeAdminRole(['admin'])).toBe(true)
    expect(isFreezeAdminRole(['super_admin'])).toBe(true)
    expect(isFreezeAdminRole(['shift_lead', 'responder'])).toBe(false)
    expect(isFreezeAdminRole([])).toBe(false)
  })
})
