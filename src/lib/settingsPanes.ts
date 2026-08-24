import { CLOSED_LISTS, type ClosedListKey } from './closedLists'

export const SETTINGS_BROADCAST_KEY = 'unit_broadcast' as const
export const SETTINGS_BOT_KEY = 'partner_bot' as const

export type SettingsPaneKey =
  | ClosedListKey
  | typeof SETTINGS_BROADCAST_KEY
  | typeof SETTINGS_BOT_KEY

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

export const SETTINGS_BOT = {
  key: SETTINGS_BOT_KEY,
  label: 'רישום בוט',
} as const

export const SETTINGS_BOT_GROUP = {
  label: 'בוט',
  items: [SETTINGS_BOT],
} as const

export const SETTINGS_MENU_GROUPS = [
  SETTINGS_LIST_GROUP,
  SETTINGS_BROADCAST_GROUP,
  SETTINGS_BOT_GROUP,
] as const

export function isClosedListPane(key: SettingsPaneKey): key is ClosedListKey {
  return CLOSED_LISTS.some((item) => item.key === key)
}
