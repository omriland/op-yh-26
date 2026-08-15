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
