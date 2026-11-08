import type { SmartSearchFilter } from '../../../supabase/functions/_shared/smartSearchFilter.ts'
import { canUseArchive, type SearchRole } from './searchRole'

/**
 * The rules lane: phrases the app turns into a filter without the model. When the
 * rules cover every word, Enter runs the filter at once and nothing leaves the app.
 * Weeks are Sunday to Saturday, numeric dates are day first, and a month or date
 * without a year is its most recent past occurrence (same rules as the model).
 */

export type RulesVocab = { eventTypes: readonly string[]; districts: readonly string[] }

export type RulesResult = {
  filter: SmartSearchFilter
  /** Every word was understood, and at least one rule matched. */
  covered: boolean
  /** Words no rule took. */
  leftovers: string[]
}

const MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
]
/** Filler that narrows nothing on its own. */
const FILLER = new Set(['אירוע', 'אירועים', 'האירועים', 'כל', 'את', 'מה', 'קרה', 'היו', 'עם'])
const PREFIXES = /^[בהוכלמש]{1,2}/

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function parseIso(day: string): Date {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function addDays(day: string, n: number): string {
  const d = parseIso(day)
  d.setUTCDate(d.getUTCDate() + n)
  return iso(d)
}

function monthRange(year: number, month0: number): [string, string] {
  return [iso(new Date(Date.UTC(year, month0, 1))), iso(new Date(Date.UTC(year, month0 + 1, 0)))]
}

function weekStart(day: string): string {
  return addDays(day, -parseIso(day).getUTCDay())
}

/** The word, and the word without one or two glued prefix letters (בצפון → צפון). */
function forms(word: string): string[] {
  const clean = word.replace(/["״׳']/g, '')
  const stripped = clean.replace(PREFIXES, '')
  const one = clean.length > 2 ? clean.slice(1) : clean
  return [...new Set([clean, one, stripped])]
}

function stripGlue(word: string, value: string): boolean {
  return forms(word).includes(value)
}

type Match = { length: number; apply: (f: SmartSearchFilter) => void }

function setDates(f: SmartSearchFilter, from: string, to: string) {
  f.date_from = from
  f.date_to = to
}

function dateMatch(words: string[], i: number, today: string): Match | null {
  const w = words[i].replace(/["״׳']/g, '')
  const next = words[i + 1]?.replace(/["״׳']/g, '')
  const [ty, tm] = today.split('-').map(Number)

  if (['אתמול', 'מאתמול'].includes(w)) {
    const d = addDays(today, -1)
    return { length: 1, apply: (f) => setDates(f, d, d) }
  }
  if (['שלשום', 'משלשום'].includes(w)) {
    const d = addDays(today, -2)
    return { length: 1, apply: (f) => setDates(f, d, d) }
  }
  if (['היום', 'מהיום'].includes(w)) return { length: 1, apply: (f) => setDates(f, today, today) }
  if (['השבוע', 'מהשבוע'].includes(w)) {
    const start = weekStart(today)
    return { length: 1, apply: (f) => setDates(f, start, addDays(start, 6)) }
  }
  if (['בשבוע', 'שבוע', 'מהשבוע'].includes(w) && (next === 'שעבר' || next === 'הקודם' || next === 'האחרון')) {
    const start = addDays(weekStart(today), -7)
    return { length: 2, apply: (f) => setDates(f, start, addDays(start, 6)) }
  }
  if (['החודש', 'מהחודש'].includes(w)) {
    const [from, to] = monthRange(ty, tm - 1)
    return { length: 1, apply: (f) => setDates(f, from, to) }
  }
  if (['בחודש', 'חודש', 'מהחודש'].includes(w) && (next === 'שעבר' || next === 'הקודם')) {
    const [from, to] = monthRange(ty, tm - 2)
    return { length: 2, apply: (f) => setDates(f, from, to) }
  }

  const month = MONTHS.findIndex((m) => stripGlue(w, m))
  if (month >= 0) {
    const explicitYear = next && /^(19|20)\d{2}$/.test(next) ? Number(next) : null
    const year = explicitYear ?? (month + 1 <= tm ? ty : ty - 1)
    const [from, to] = monthRange(year, month)
    return { length: explicitYear ? 2 : 1, apply: (f) => setDates(f, from, to) }
  }

  // 14.1, 14/1, 14.1.26, ב-14.10
  const numeric = /^(?:[בהמל]-?)?(\d{1,2})[./](\d{1,2})(?:[./](\d{2}|\d{4}))?$/.exec(w)
  if (numeric) {
    const day = Number(numeric[1])
    const month0 = Number(numeric[2]) - 1
    let year = numeric[3] ? Number(numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3]) : ty
    let d = new Date(Date.UTC(year, month0, day))
    if (d.getUTCMonth() !== month0 || d.getUTCDate() !== day) return null
    if (!numeric[3] && iso(d) > today) {
      year -= 1
      d = new Date(Date.UTC(year, month0, day))
    }
    const value = iso(d)
    return { length: 1, apply: (f) => setDates(f, value, value) }
  }
  return null
}

function roadMatch(words: string[], i: number): Match | null {
  if (!stripGlue(words[i], 'כביש')) return null
  const n = words[i + 1]
  if (!n || !/^\d{1,4}$/.test(n)) return null
  return { length: 2, apply: (f) => (f.road = n) }
}

/** 12-345-67 or 123-45-678: a plate typed with its dashes. */
function plateMatch(words: string[], i: number): Match | null {
  const w = words[i]
  if (!/^\d{2,3}-\d{2,3}-\d{2,3}$/.test(w)) return null
  const digits = w.replace(/\D/g, '')
  if (digits.length < 7 || digits.length > 8) return null
  return { length: 1, apply: (f) => (f.plate = digits) }
}

function phraseMatch(words: string[], i: number, values: readonly string[], set: (f: SmartSearchFilter, v: string) => void): Match | null {
  // Longest name first, so "גרירה כבדה" wins over "גרירה".
  const sorted = [...values].sort((a, b) => b.split(/\s+/).length - a.split(/\s+/).length)
  for (const value of sorted) {
    const parts = value.split(/\s+/)
    if (i + parts.length > words.length) continue
    const ok = parts.every((part, k) => (k === 0 ? stripGlue(words[i], part) : words[i + k] === part))
    if (ok) return { length: parts.length, apply: (f) => set(f, value) }
  }
  return null
}

function archiveMatch(words: string[], i: number): Match | null {
  const w = words[i]
  if (stripGlue(w, 'ארכיון') || stripGlue(w, 'הארכיון')) {
    return { length: 1, apply: (f) => (f.source = 'archive') }
  }
  if ((stripGlue(w, 'אתר') || stripGlue(w, 'האתר')) && words[i + 1] === 'הישן') {
    return { length: 2, apply: (f) => (f.source = 'archive') }
  }
  return null
}

export function parseRules(q: string, today: string, vocab: RulesVocab, role: SearchRole): RulesResult {
  const words = q.trim().split(/\s+/).filter(Boolean)
  const filter: SmartSearchFilter = { intent: 'find', entity: 'both', source: 'both' }
  const leftovers: string[] = []
  let matched = 0

  for (let i = 0; i < words.length; ) {
    const match =
      dateMatch(words, i, today) ??
      roadMatch(words, i) ??
      plateMatch(words, i) ??
      phraseMatch(words, i, vocab.districts, (f, v) => (f.district = v)) ??
      phraseMatch(words, i, vocab.eventTypes, (f, v) => (f.event_type = v)) ??
      (canUseArchive(role) ? archiveMatch(words, i) : null)
    if (match) {
      match.apply(filter)
      matched += 1
      i += match.length
      continue
    }
    if (!forms(words[i]).some((form) => FILLER.has(form))) leftovers.push(words[i])
    i += 1
  }

  if (matched > 0 && filter.entity === 'both') filter.entity = 'events'
  return { filter, covered: matched > 0 && leftovers.length === 0, leftovers }
}
