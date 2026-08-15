import { searchQueryVariants } from '../searchQuery'

export function normalizeReportQuery(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0591-\u05C7]/g, '')
    .replace(/[״"׳'`]/g, '')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > 1) return 2
  const rows = a.length + 1
  const cols = b.length + 1
  const prev = new Array<number>(cols)
  const curr = new Array<number>(cols)
  for (let j = 0; j < cols; j++) prev[j] = j
  for (let i = 1; i < rows; i++) {
    curr[0] = i
    let best = curr[0]
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
      if (curr[j] < best) best = curr[j]
    }
    if (best > 1) return 2
    for (let j = 0; j < cols; j++) prev[j] = curr[j]
  }
  return prev[b.length]
}

function isSubsequence(haystack: string, needle: string): boolean {
  let i = 0
  for (const ch of haystack) {
    if (ch === needle[i]) i++
    if (i === needle.length) return true
  }
  return false
}

function tokenMatches(haystack: string, token: string): boolean {
  const compact = haystack.replace(/\s+/g, '')
  if (haystack.includes(token) || compact.includes(token)) return true
  const words = haystack.split(' ').filter(Boolean)
  if (words.some((word) => isSubsequence(word, token))) return true
  if (token.length < 3) return false
  return words.some((word) => levenshtein(word, token) <= 1)
}

function tokensOf(query: string): string[] {
  return normalizeReportQuery(query).split(' ').filter(Boolean)
}

function tokensMatchHaystack(haystack: string, tokens: string[]): boolean {
  return tokens.every((token) => tokenMatches(haystack, token))
}

export function queryMatchesText(haystack: string, query: string): boolean {
  const variants = searchQueryVariants(query)
  if (variants.length === 0) return true
  const normalized = normalizeReportQuery(haystack)
  return variants.some((variant) => {
    const tokens = tokensOf(variant)
    return tokens.length === 0 || tokensMatchHaystack(normalized, tokens)
  })
}

export function filterReportCatalog<T extends { title: string; includes: string }>(
  kinds: readonly T[],
  query: string,
): T[] {
  const variants = searchQueryVariants(query)
  if (variants.length === 0) return [...kinds]

  const scored: { kind: T; rank: number }[] = []
  for (const kind of kinds) {
    const title = normalizeReportQuery(kind.title)
    const includes = normalizeReportQuery(kind.includes)
    const haystack = `${title} ${includes}`
    if (!queryMatchesText(haystack, query)) continue
    scored.push({
      kind,
      rank: variants.some((variant) => tokensMatchHaystack(title, tokensOf(variant))) ? 0 : 1,
    })
  }

  scored.sort((a, b) => a.rank - b.rank)
  return scored.map((item) => item.kind)
}
