import { describe, expect, it } from 'vitest'
import { canMutateClosedListItem, type ClosedListItem } from './closedLists'

const systemItem: ClosedListItem = {
  id: '1',
  name: 'תחנה / אחר / משוכפל',
  active: true,
  sort_order: 1,
  code: 'station_other_duplicated',
}

const normalItem: ClosedListItem = {
  id: '2',
  name: 'צפון',
  active: true,
  sort_order: 2,
  code: null,
}

describe('canMutateClosedListItem', () => {
  it('blocks system districts', () => {
    expect(canMutateClosedListItem('districts', systemItem)).toBe(false)
  })

  it('allows normal districts and other lists', () => {
    expect(canMutateClosedListItem('districts', normalItem)).toBe(true)
    expect(
      canMutateClosedListItem('roads', { ...systemItem, code: 'station_other_duplicated' }),
    ).toBe(true)
  })
})
