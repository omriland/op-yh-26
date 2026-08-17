import { CLOSED_LISTS, type ClosedListKey } from './closedLists'

export const SETTINGS_BROADCAST_KEY = 'unit_broadcast' as const

export type SettingsPaneKey = ClosedListKey | typeof SETTINGS_BROADCAST_KEY

export const SETTINGS_LIST_GROUP = {
  label: 'רשימות',
  items: CLOSED_LISTS,
} as const

export const SETTINGS_BROADCAST = {
  key: SETTINGS_BROADCAST_KEY,
  label: 'תפוצה לכלל היחידה',
  description: 'שליחת הודעה למנהלים, לאחמ״שים או לכלל המשתמשים הפעילים.',
} as const

export const SETTINGS_BROADCAST_GROUP = {
  label: 'תפוצה',
  items: [SETTINGS_BROADCAST],
} as const

export function isClosedListPane(key: SettingsPaneKey): key is ClosedListKey {
  return key !== SETTINGS_BROADCAST_KEY
}
