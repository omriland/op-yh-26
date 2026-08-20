import { describe, expect, it } from 'vitest'
import {
  assignmentIdsNewlyAssigned,
  assignmentIdsNewlySetKm,
  fillReadyNotifyIds,
} from './fillReadyNotify'

describe('assignmentIdsNewlySetKm', () => {
  it('includes rows that go from null to a number', () => {
    expect(
      assignmentIdsNewlySetKm(
        [
          { id: 'a', total_km: null },
          { id: 'b', total_km: 12 },
        ],
        [
          { assignmentId: 'a', totalKm: 5 },
          { assignmentId: 'b', totalKm: 12 },
        ],
      ),
    ).toEqual(['a'])
  })

  it('includes brand-new assignments with km', () => {
    expect(
      assignmentIdsNewlySetKm([], [{ assignmentId: 'new', totalKm: 0 }]),
    ).toEqual(['new'])
  })

  it('skips still-null km', () => {
    expect(
      assignmentIdsNewlySetKm(
        [{ id: 'a', total_km: null }],
        [{ assignmentId: 'a', totalKm: null }],
      ),
    ).toEqual([])
  })
})

describe('assignmentIdsNewlyAssigned', () => {
  it('includes brand-new assignments even when km is still empty', () => {
    expect(
      assignmentIdsNewlyAssigned([], [{ assignmentId: 'new', totalKm: null }]),
    ).toEqual(['new'])
  })

  it('skips responders who were already on the event', () => {
    expect(
      assignmentIdsNewlyAssigned(
        [{ id: 'a' }],
        [{ assignmentId: 'a', totalKm: null }],
      ),
    ).toEqual([])
  })
})

describe('fillReadyNotifyIds', () => {
  it('notifies on assignment, not only after the lead enters km', () => {
    expect(
      fillReadyNotifyIds([], [{ assignmentId: 'new', totalKm: null }]),
    ).toEqual(['new'])
  })

  it('still notifies when an existing assignment first gets km', () => {
    expect(
      fillReadyNotifyIds(
        [{ id: 'a', total_km: null }],
        [{ assignmentId: 'a', totalKm: 8 }],
      ),
    ).toEqual(['a'])
  })
})
