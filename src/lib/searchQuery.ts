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

/** A callsign or event id: the whole value, not a digit sequence inside a longer one. */
export function isExactNumberQuery(query: string): boolean {
  return /^\d+$/.test(query.trim())
}

export type ListSearchFields = {
  policeEventId?: string | null
  roadName?: string | null
  location?: string | null
  patrolNumber?: string | null
  names?: readonly (string | null | undefined)[]
  callsigns?: readonly (string | null | undefined)[]
}

function sameNumber(value: string | null | undefined, needle: string): boolean {
  return (value ?? '').trim() === needle
}

/** Text stays a substring. A query of only digits matches an id or callsign exactly. */
export function listSearchMatches(fields: ListSearchFields, query: string): boolean {
  const needle = query.trim()
  if (!needle) return true
  if (isExactNumberQuery(needle)) {
    return [fields.policeEventId, fields.patrolNumber, ...(fields.callsigns ?? [])].some((value) =>
      sameNumber(value, needle),
    )
  }
  return [fields.policeEventId, fields.roadName, fields.location, ...(fields.names ?? []), ...(fields.callsigns ?? [])].some(
    (value) => value != null && value !== '' && textIncludesQuery(value, needle),
  )
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

export function filterSelectOptions<T extends { label: string }>(
  options: readonly T[],
  query: string,
): T[] {
  if (!query.trim()) return [...options]
  return options.filter((option) => textIncludesQuery(option.label, query))
}
