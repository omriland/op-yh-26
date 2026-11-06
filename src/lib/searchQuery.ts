/** Standard Israeli Hebrew layout: Latin QWERTY key → Hebrew glyph. */
const EN_TO_HE: Record<string, string> = {
  q: '/',
  w: "'",
  e: 'ק',
  r: 'ר',
  t: 'א',
  y: 'ט',
  u: 'ו',
  i: 'ן',
  o: 'ם',
  p: 'פ',
  a: 'ש',
  s: 'ד',
  d: 'ג',
  f: 'כ',
  g: 'ע',
  h: 'י',
  j: 'ח',
  k: 'ל',
  l: 'ך',
  ';': 'ף',
  z: 'ז',
  x: 'ס',
  c: 'ב',
  v: 'ה',
  b: 'נ',
  n: 'מ',
  m: 'צ',
  ',': 'ת',
  '.': 'ץ',
  '/': '.',
  "'": ',',
  '[': ']',
  ']': '[',
}

export function mapEnKeysToHe(value: string): string {
  return [...value].map((ch) => EN_TO_HE[ch.toLowerCase()] ?? ch).join('')
}

export function searchQueryVariants(query: string): string[] {
  const trimmed = query.trim()
  if (!trimmed) return []
  const mapped = mapEnKeysToHe(trimmed)
  return mapped === trimmed ? [trimmed] : [trimmed, mapped]
}

export function textIncludesQuery(haystack: string, query: string): boolean {
  const variants = searchQueryVariants(query)
  if (variants.length === 0) return true
  const hay = haystack.toLowerCase()
  return variants.some((variant) => hay.includes(variant.toLowerCase()))
}

export function fieldsMatchQuery(
  fields: Array<string | number | null | undefined>,
  query: string,
): boolean {
  return fields.some((field) => field != null && textIncludesQuery(String(field), query))
}

/** A digits-only search lists callsigns numerically; other callsigns follow in their given order. */
export function sortByCallsignForNumericQuery<T extends { callsign?: string | null }>(
  people: readonly T[],
  query: string,
): T[] {
  if (!/^\d+$/.test(query.trim())) return [...people]
  const rank = (person: T) => {
    const callsign = person.callsign?.trim() ?? ''
    return /^\d+$/.test(callsign) ? Number(callsign) : Number.POSITIVE_INFINITY
  }
  return [...people].sort((a, b) => {
    const left = rank(a)
    const right = rank(b)
    return left === right ? 0 : left - right
  })
}

export function filterSelectOptions<T extends { label: string }>(
  options: readonly T[],
  query: string,
): T[] {
  if (!query.trim()) return [...options]
  return options.filter((option) => textIncludesQuery(option.label, query))
}
