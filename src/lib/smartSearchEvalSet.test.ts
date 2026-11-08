import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  validateSmartSearchFilter,
  type SmartSearchFilter,
  type SmartSearchVocab,
} from '../../supabase/functions/_shared/smartSearchFilter'

const set = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../scripts/smart-search/eval/queries.json'), 'utf8'),
) as { vocab: SmartSearchVocab; cases: { q: string; today: string; expect: Partial<SmartSearchFilter> }[] }

describe('parser eval set', () => {
  it('has at least 50 queries, mostly Hebrew, none repeated', () => {
    expect(set.cases.length).toBeGreaterThanOrEqual(50)
    expect(set.cases.filter((c) => /[֐-׿]/.test(c.q)).length).toBeGreaterThanOrEqual(45)
    expect(new Set(set.cases.map((c) => c.q)).size).toBe(set.cases.length)
  })
  it('expects only what the validator would keep', () => {
    for (const c of set.cases) expect(validateSmartSearchFilter(c.expect, set.vocab), c.q).toMatchObject(c.expect)
  })
  it('covers people, shift coverage, the archive and counting questions', () => {
    const keys = new Set(set.cases.flatMap((c) => Object.keys(c.expect)))
    for (const k of ['volunteer_status', 'no_shift_from', 'person_role', 'source', 'intent', 'damage_location'])
      expect(keys.has(k), k).toBe(true)
  })
})
