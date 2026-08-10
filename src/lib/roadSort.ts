/**
 * Sort road names: pure numbers ascending first; names that contain
 * any letter (Hebrew/Latin) last, then by Hebrew locale name.
 */
export function compareRoadNames(a: string, b: string): number {
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
