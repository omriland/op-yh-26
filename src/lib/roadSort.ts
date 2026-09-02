import { isUrbanRoadName } from './systemDistricts'

/**
 * Sort road names: urban road (`עירוני`, including legacy `עירוני (101)`)
 * pinned first; then pure numbers ascending; then names that contain any
 * letter (Hebrew/Latin) by Hebrew locale.
 */
export function compareRoadNames(a: string, b: string): number {
  const aUrban = isUrbanRoadName(a)
  const bUrban = isUrbanRoadName(b)
  if (aUrban !== bUrban) return aUrban ? -1 : 1
  const aNumeric = isPureNumber(a)
  const bNumeric = isPureNumber(b)
  if (aNumeric && bNumeric) return Number(a.trim()) - Number(b.trim())
  if (aNumeric !== bNumeric) return aNumeric ? -1 : 1
  return a.trim().localeCompare(b.trim(), 'he')
}

export function sortByRoadName<T extends { name: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => compareRoadNames(left.name, right.name))
}

function isPureNumber(value: string): boolean {
  return /^\d+$/.test(value.trim())
}
