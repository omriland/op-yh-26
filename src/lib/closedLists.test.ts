import { describe, expect, it } from 'vitest'
import {
  canMutateClosedListItem,
  canReorderClosedList,
  moveClosedListItem,
  type ClosedListItem,
} from './closedLists'

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

describe('district reorder', () => {
  const south: ClosedListItem = {
    id: 'south',
    name: 'דרום',
    active: true,
    sort_order: 1,
  }
  const north: ClosedListItem = {
    id: 'north',
    name: 'צפון',
    active: true,
    sort_order: 2,
  }
  const system: ClosedListItem = {
    ...systemItem,
    id: 'sys',
    sort_order: 3,
  }

  it('is only enabled for שלוחות', () => {
    expect(canReorderClosedList('districts')).toBe(true)
    expect(canReorderClosedList('event_types')).toBe(false)
    expect(canReorderClosedList('roads')).toBe(false)
    expect(canReorderClosedList('vehicle_kinds')).toBe(false)
  })

  it('moves an item up and renumbers sort_order', () => {
    const next = moveClosedListItem([south, north, system], 'north', 'up')
    expect(next?.map((row) => row.id)).toEqual(['north', 'south', 'sys'])
    expect(next?.map((row) => row.sort_order)).toEqual([1, 2, 3])
  })

  it('moves the system שלוחה without renaming it', () => {
    const next = moveClosedListItem([south, north, system], 'sys', 'up')
    expect(next?.map((row) => row.id)).toEqual(['south', 'sys', 'north'])
    expect(next?.find((row) => row.id === 'sys')?.name).toBe('תחנה / אחר / משוכפל')
  })

  it('does not move the first item up or the last item down', () => {
    const items = [south, north, system]
    expect(moveClosedListItem(items, 'south', 'up')).toBeNull()
    expect(moveClosedListItem(items, 'sys', 'down')).toBeNull()
    expect(moveClosedListItem(items, 'missing', 'down')).toBeNull()
  })
})
