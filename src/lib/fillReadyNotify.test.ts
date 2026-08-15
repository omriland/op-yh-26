import { describe, expect, it } from 'vitest'
import { assignmentIdsNewlySetKm } from './fillReadyNotify'

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
