/** Card-number list stored in `card_numbers` as newline-separated values. */

export function parseCardNumbers(raw: string): string[] {
  if (!raw.trim()) return []
  return raw
    .split(/[\n,]+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

export function serializeCardNumbers(numbers: string[]): string {
  return numbers.join('\n')
}

export function cardNumbersMatchCount(numbers: string[], cards: number): boolean {
  return numbers.length === cards
}

/** Whether Enter can append this draft value. */
export function canAddCardNumber(
  existing: string[],
  cards: number,
  draft: string,
): boolean {
  const value = draft.trim()
  if (!value) return false
  if (existing.length >= cards) return false
  return true
}
