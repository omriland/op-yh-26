import { sortByRoadName } from './roadSort'
import { supabase } from './supabase'

export type ClosedListKey = 'districts' | 'event_types' | 'roads' | 'vehicle_kinds'

export type ClosedListItem = {
  id: string
  name: string
  active: boolean
  sort_order: number
}

export const CLOSED_LISTS: {
  key: ClosedListKey
  label: string
  usage: { table: 'events' | 'event_treated_vehicles'; column: string }
}[] = [
  {
    key: 'districts',
    label: 'שלוחות',
    usage: { table: 'events', column: 'district_id' },
  },
  {
    key: 'event_types',
    label: 'סוגי אירוע',
    usage: { table: 'events', column: 'event_type_id' },
  },
  {
    key: 'roads',
    label: 'כבישים',
    usage: { table: 'events', column: 'road_id' },
  },
  {
    key: 'vehicle_kinds',
    label: 'סוגי רכב לטיפול',
    usage: { table: 'event_treated_vehicles', column: 'vehicle_kind_id' },
  },
]

export function closedListMeta(key: ClosedListKey) {
  const meta = CLOSED_LISTS.find((list) => list.key === key)
  if (!meta) throw new Error(`Unknown closed list: ${key}`)
  return meta
}

export async function fetchClosedListItems(key: ClosedListKey): Promise<ClosedListItem[]> {
  const { data, error } = await supabase
    .from(key)
    .select('id, name, active, sort_order')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) throw error
  const items = (data ?? []) as ClosedListItem[]
  return key === 'roads' ? sortByRoadName(items) : items
}

export async function createClosedListItem(
  key: ClosedListKey,
  name: string,
): Promise<{ ok: true; item: ClosedListItem } | { ok: false; error: string }> {
  const trimmed = name.trim()
  if (!trimmed) return { ok: false, error: 'יש להזין שם לפריט.' }

  const existing = await fetchClosedListItems(key)
  const sortOrder = existing.reduce((max, row) => Math.max(max, row.sort_order), 0) + 1

  const { data, error } = await supabase
    .from(key)
    .insert({ name: trimmed, sort_order: sortOrder, active: true })
    .select('id, name, active, sort_order')
    .single()

  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      return { ok: false, error: 'פריט בשם זה כבר קיים ברשימה.' }
    }
    return { ok: false, error: 'הוספת הפריט נכשלה. בדקו את החיבור ונסו שוב.' }
  }

  return { ok: true, item: data as ClosedListItem }
}

export async function updateClosedListItem(
  key: ClosedListKey,
  id: string,
  name: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = name.trim()
  if (!trimmed) return { ok: false, error: 'יש להזין שם לפריט.' }

  const { error } = await supabase.from(key).update({ name: trimmed }).eq('id', id)

  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      return { ok: false, error: 'פריט בשם זה כבר קיים ברשימה.' }
    }
    return { ok: false, error: 'שמירת הפריט נכשלה. בדקו את החיבור ונסו שוב.' }
  }

  return { ok: true }
}

export async function isClosedListItemInUse(key: ClosedListKey, id: string): Promise<boolean> {
  const { usage } = closedListMeta(key)
  const { count, error } = await supabase
    .from(usage.table)
    .select('id', { count: 'exact', head: true })
    .eq(usage.column, id)

  if (error) throw error
  return (count ?? 0) > 0
}

export async function deleteClosedListItem(
  key: ClosedListKey,
  id: string,
): Promise<{ ok: true } | { ok: false; error: string; inUse?: boolean }> {
  try {
    if (await isClosedListItemInUse(key, id)) {
      return {
        ok: false,
        inUse: true,
        error: 'לא ניתן להסיר פריט שמשויך לאירועים קיימים.',
      }
    }
  } catch {
    return { ok: false, error: 'בדיקת השימוש בפריט נכשלה. נסו שוב.' }
  }

  const { error } = await supabase.from(key).delete().eq('id', id)
  if (error) {
    if (/foreign key|violates/i.test(error.message)) {
      return {
        ok: false,
        inUse: true,
        error: 'לא ניתן להסיר פריט שמשויך לאירועים קיימים.',
      }
    }
    return { ok: false, error: 'הסרת הפריט נכשלה. בדקו את החיבור ונסו שוב.' }
  }

  return { ok: true }
}
