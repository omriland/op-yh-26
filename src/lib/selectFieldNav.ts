/** One-step highlight move that stays inside the visible option list. */
export function nextActiveIndex(index: number, length: number, delta: number): number {
  if (length <= 0) return -1
  const current = index < 0 || index >= length ? 0 : index
  if (delta > 0) return Math.min(length - 1, current + 1)
  return Math.max(0, current - 1)
}

/** Keys the search field should steer the list with. Home/End stay with the caret. */
export function isSelectSearchNavKey(key: string): boolean {
  return key === 'ArrowDown' || key === 'ArrowUp' || key === 'Enter' || key === 'Escape'
}
