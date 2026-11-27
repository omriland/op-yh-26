import { describe, expect, it } from 'vitest'
import {
  applyPendingGold,
  canSubmitEnrichment,
  enrichmentAuthorLabel,
  enrichmentsHeading,
  formatEnrichmentTimestamp,
  goldToggleLabel,
  setEnrichmentGold,
  sortEnrichmentsOldestFirst,
  validateEnrichmentBody,
  type EventEnrichment,
} from './eventEnrichments'

function makeEnrichment(overrides: Partial<EventEnrichment> = {}): EventEnrichment {
  return {
    id: 'e1',
    event_id: 'ev1',
    author_id: 'u1',
    author_name: 'דנה כהן',
    author_callsign: 'D12',
    body: 'טקסט',
    is_gold: false,
    created_at: '2026-11-20T10:00:00.000Z',
    ...overrides,
  }
}

describe('sortEnrichmentsOldestFirst', () => {
  it('orders by created_at ascending', () => {
    const sorted = sortEnrichmentsOldestFirst([
      makeEnrichment({ id: 'c', created_at: '2026-11-22T10:00:00.000Z' }),
      makeEnrichment({ id: 'a', created_at: '2026-11-20T10:00:00.000Z' }),
      makeEnrichment({ id: 'b', created_at: '2026-11-21T10:00:00.000Z' }),
    ])
    expect(sorted.map((item) => item.id)).toEqual(['a', 'b', 'c'])
  })

  it('compares real instants, not strings, when offsets differ', () => {
    // 12:00+03:00 is 09:00Z, earlier than 10:00Z although the string sorts later.
    const sorted = sortEnrichmentsOldestFirst([
      makeEnrichment({ id: 'late', created_at: '2026-11-20T10:00:00.000Z' }),
      makeEnrichment({ id: 'early', created_at: '2026-11-20T12:00:00+03:00' }),
    ])
    expect(sorted.map((item) => item.id)).toEqual(['early', 'late'])
  })

  it('keeps a stable order for identical timestamps, by id', () => {
    const sorted = sortEnrichmentsOldestFirst([
      makeEnrichment({ id: 'b' }),
      makeEnrichment({ id: 'a' }),
    ])
    expect(sorted.map((item) => item.id)).toEqual(['a', 'b'])
  })

  it('does not change the input array and handles an empty list', () => {
    const input = [
      makeEnrichment({ id: 'b', created_at: '2026-11-22T10:00:00.000Z' }),
      makeEnrichment({ id: 'a', created_at: '2026-11-20T10:00:00.000Z' }),
    ]
    sortEnrichmentsOldestFirst(input)
    expect(input.map((item) => item.id)).toEqual(['b', 'a'])
    expect(sortEnrichmentsOldestFirst([])).toEqual([])
  })
})

describe('validateEnrichmentBody', () => {
  it('rejects empty and whitespace-only text', () => {
    expect(validateEnrichmentBody('')).toEqual({ ok: false, reason: 'empty' })
    expect(validateEnrichmentBody('  \n\t \r\n ')).toEqual({ ok: false, reason: 'empty' })
  })

  it('trims the outside but keeps inner line breaks and blank lines', () => {
    expect(validateEnrichmentBody('  שורה ראשונה\n\nשורה שלישית \n')).toEqual({
      ok: true,
      body: 'שורה ראשונה\n\nשורה שלישית',
    })
  })

  it('turns Windows line breaks into plain newlines', () => {
    expect(validateEnrichmentBody('א\r\nב\rג')).toEqual({ ok: true, body: 'א\nב\nג' })
  })

  it('keeps HTML as literal text and does not strip it', () => {
    expect(validateEnrichmentBody('<b>חשוב</b> & "כן"')).toEqual({
      ok: true,
      body: '<b>חשוב</b> & "כן"',
    })
  })

  it('has no length limit', () => {
    const long = 'א'.repeat(50000)
    expect(validateEnrichmentBody(long)).toEqual({ ok: true, body: long })
  })

  it('keeps mixed Hebrew and English text unchanged', () => {
    expect(validateEnrichmentBody('הגענו ב-ETA של 10 דקות')).toEqual({
      ok: true,
      body: 'הגענו ב-ETA של 10 דקות',
    })
  })
})

describe('canSubmitEnrichment', () => {
  it('is false for empty or whitespace text', () => {
    expect(canSubmitEnrichment('', false)).toBe(false)
    expect(canSubmitEnrichment('   \n ', false)).toBe(false)
  })

  it('is false while saving, even with text', () => {
    expect(canSubmitEnrichment('שלום', true)).toBe(false)
  })

  it('is true with text and not saving', () => {
    expect(canSubmitEnrichment('שלום', false)).toBe(true)
  })
})

describe('formatEnrichmentTimestamp', () => {
  it('shows DD.MM.YYYY, HH:mm in Jerusalem winter time (UTC+2)', () => {
    expect(formatEnrichmentTimestamp('2026-11-27T12:05:00.000Z')).toBe('27.11.2026, 14:05')
  })

  it('shows Jerusalem summer time (UTC+3)', () => {
    expect(formatEnrichmentTimestamp('2026-07-01T12:05:00.000Z')).toBe('01.07.2026, 15:05')
  })

  it('moves to the next day when Jerusalem is past midnight', () => {
    expect(formatEnrichmentTimestamp('2026-11-27T22:30:00.000Z')).toBe('28.11.2026, 00:30')
  })

  it('uses a 24 hour clock', () => {
    expect(formatEnrichmentTimestamp('2026-11-27T11:30:00.000Z')).toBe('27.11.2026, 13:30')
  })

  it('pads single-digit day, month, hour and minute with zeros', () => {
    expect(formatEnrichmentTimestamp('2026-01-05T07:03:00.000Z')).toBe('05.01.2026, 09:03')
  })

  it('follows the clock change at the end of summer time (25 Oct 2026)', () => {
    expect(formatEnrichmentTimestamp('2026-10-24T20:30:00.000Z')).toBe('24.10.2026, 23:30')
    expect(formatEnrichmentTimestamp('2026-10-25T20:30:00.000Z')).toBe('25.10.2026, 22:30')
  })

  it('returns an empty string for an invalid date', () => {
    expect(formatEnrichmentTimestamp('not a date')).toBe('')
  })
})

describe('enrichmentsHeading', () => {
  it('writes the count in brackets', () => {
    expect(enrichmentsHeading(0)).toBe('העשרות (0)')
    expect(enrichmentsHeading(12)).toBe('העשרות (12)')
  })
})

describe('goldToggleLabel', () => {
  it('offers to mark a normal comment', () => {
    expect(goldToggleLabel(false)).toBe('סמנו כהעשרת זהב')
  })

  it('offers to unmark a gold comment', () => {
    expect(goldToggleLabel(true)).toBe('בטלו העשרת זהב')
  })
})

describe('enrichmentAuthorLabel', () => {
  it('shows name and callsign', () => {
    expect(enrichmentAuthorLabel(makeEnrichment())).toBe('דנה כהן (D12)')
  })

  it('shows only the name when there is no callsign', () => {
    expect(enrichmentAuthorLabel(makeEnrichment({ author_callsign: null }))).toBe('דנה כהן')
    expect(enrichmentAuthorLabel(makeEnrichment({ author_callsign: '  ' }))).toBe('דנה כהן')
  })

  it('still shows the saved name when the account was deleted (author_id null)', () => {
    expect(enrichmentAuthorLabel(makeEnrichment({ author_id: null }))).toBe('דנה כהן (D12)')
  })

  it('treats a blank name like a missing name', () => {
    expect(
      enrichmentAuthorLabel(makeEnrichment({ author_name: '   ', author_callsign: null })),
    ).toBe('משתמש שנמחק')
  })

  it('falls back to a neutral label when there is no name at all', () => {
    expect(
      enrichmentAuthorLabel(
        makeEnrichment({ author_id: null, author_name: null, author_callsign: null }),
      ),
    ).toBe('משתמש שנמחק')
  })
})

describe('setEnrichmentGold', () => {
  const list = [
    makeEnrichment({ id: 'a', body: 'ראשון' }),
    makeEnrichment({ id: 'b', is_gold: true, body: 'שני' }),
    makeEnrichment({ id: 'c', body: 'שלישי' }),
  ]

  it('marks only the chosen comment as gold', () => {
    const next = setEnrichmentGold(list, 'a', true)
    expect(next.map((item) => item.is_gold)).toEqual([true, true, false])
  })

  it('unmarks only the chosen comment', () => {
    const next = setEnrichmentGold(list, 'b', false)
    expect(next.map((item) => item.is_gold)).toEqual([false, false, false])
    const other = setEnrichmentGold([...list, makeEnrichment({ id: 'd', is_gold: true })], 'b', false)
    expect(other.map((item) => item.is_gold)).toEqual([false, false, false, true])
  })

  it('keeps order and every other field of the changed comment', () => {
    const next = setEnrichmentGold(list, 'c', true)
    expect(next.map((item) => item.id)).toEqual(['a', 'b', 'c'])
    expect(next[2]).toEqual({ ...list[2], is_gold: true })
  })

  it('does not change the input list or its items', () => {
    const next = setEnrichmentGold(list, 'a', true)
    expect(list[0].is_gold).toBe(false)
    expect(next[0]).not.toBe(list[0])
    expect(next).not.toBe(list)
  })

  it('returns an equal list for an unknown id', () => {
    expect(setEnrichmentGold(list, 'zzz', true)).toEqual(list)
  })
})

describe('applyPendingGold', () => {
  const list = [
    makeEnrichment({ id: 'a' }),
    makeEnrichment({ id: 'b', is_gold: true }),
    makeEnrichment({ id: 'c' }),
  ]

  it('keeps a star that is still being saved when an older list arrives', () => {
    const next = applyPendingGold(list, new Map([['a', true]]))
    expect(next.map((item) => item.is_gold)).toEqual([true, true, false])
  })

  it('keeps a star removal that is still being saved', () => {
    const next = applyPendingGold(list, new Map([['b', false]]))
    expect(next.map((item) => item.is_gold)).toEqual([false, false, false])
  })

  it('leaves the list as fetched when nothing is being saved', () => {
    expect(applyPendingGold(list, new Map())).toEqual(list)
  })

  it('ignores a pending change for a comment that is not in the list', () => {
    expect(applyPendingGold(list, new Map([['zzz', true]]))).toEqual(list)
  })

  it('does not change the fetched items', () => {
    applyPendingGold(list, new Map([['a', true]]))
    expect(list[0].is_gold).toBe(false)
  })
})
