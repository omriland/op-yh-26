import { describe, expect, it } from 'vitest'
import { CLOSED_LISTS } from './closedLists'
import {
  SETTINGS_BROADCAST,
  SETTINGS_BROADCAST_GROUP,
  SETTINGS_LIST_GROUP,
  isClosedListPane,
} from './settingsPanes'

describe('settings panes', () => {
  it('keeps closed lists as the first settings menu', () => {
    expect(SETTINGS_LIST_GROUP.items.map((item) => item.key)).toEqual(
      CLOSED_LISTS.map((item) => item.key),
    )
  })

  it('adds unit broadcast as a second settings menu', () => {
    expect(SETTINGS_BROADCAST_GROUP.items.map((item) => item.key)).toEqual([
      'unit_broadcast',
    ])
    expect(SETTINGS_BROADCAST.label).toBe('תפוצה לכלל היחידה')
  })

  it('tells closed-list panes from broadcast', () => {
    expect(isClosedListPane('roads')).toBe(true)
    expect(isClosedListPane('unit_broadcast')).toBe(false)
  })
})
