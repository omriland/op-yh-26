import { expect, it } from 'vitest'
import { LEGACY_HIT_TYPE_LABELS } from '../../supabase/functions/_shared/legacyHitTypes'
import { HIT_TYPES } from './reports/legacyReport'

it('matches the report HIT_TYPES labels in order', () => {
  expect(LEGACY_HIT_TYPE_LABELS).toHaveLength(17)
  expect([...LEGACY_HIT_TYPE_LABELS]).toEqual(HIT_TYPES.map((h) => h.label))
})
