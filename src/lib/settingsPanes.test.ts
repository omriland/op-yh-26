import { describe, expect, it } from 'vitest'
import { CLOSED_LISTS } from './closedLists'
import {
  SETTINGS_BOT,
  SETTINGS_BOT_GROUP,
  SETTINGS_BROADCAST,
  SETTINGS_BROADCAST_GROUP,
  SETTINGS_LIST_GROUP,
  SETTINGS_MENU_GROUPS,
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

  it('adds bot registration as a third settings menu', () => {
    expect(SETTINGS_BOT_GROUP.items.map((item) => item.key)).toEqual(['partner_bot'])
    expect(SETTINGS_BOT.label).toBe('רישום בוט')
    expect(SETTINGS_MENU_GROUPS.map((group) => group.label)).toEqual(['רשימות', 'תפוצה', 'בוט'])
  })

  it('tells closed-list panes from broadcast and bot registration', () => {
    expect(isClosedListPane('roads')).toBe(true)
    expect(isClosedListPane('unit_broadcast')).toBe(false)
    expect(isClosedListPane('partner_bot')).toBe(false)
  })
})
