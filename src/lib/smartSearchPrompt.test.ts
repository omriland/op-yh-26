import { describe, expect, it } from 'vitest'
import { LEGACY_HIT_TYPE_LABELS } from '../../supabase/functions/_shared/legacyHitTypes'
import { validateSmartSearchFilter } from '../../supabase/functions/_shared/smartSearchFilter'
import type { SmartSearchVocab } from '../../supabase/functions/_shared/smartSearchFilter'
import {
  SMART_SEARCH_EXAMPLES,
  buildSmartSearchPrompt,
  jerusalemToday,
} from '../../supabase/functions/_shared/smartSearchPrompt'

const fullVocab: SmartSearchVocab = {
  eventTypes: ['חילוץ', 'גרירה', 'תאונה'],
  districts: ['מרכז', 'דרום', 'צפון'],
  hitTypes: [...LEGACY_HIT_TYPE_LABELS],
}
const vocab = fullVocab

describe('smart search prompt', () => {
  it('keeps the date and the query in the user turn, so the system prompt never changes', () => {
    const p = buildSmartSearchPrompt('אירוע בכביש 531 בשבוע שעבר', '2026-11-08', vocab)
    expect(p.user).toContain('2026-11-08')
    expect(p.user).toContain('אירוע בכביש 531 בשבוע שעבר')
    expect(p.system).not.toContain('2026-11-08')
    expect(buildSmartSearchPrompt('א', '2026-11-09', vocab).system).toBe(p.system)
  })
  it('lists the vocab and says Sunday–Saturday weeks, day-first dates and the new people keys', () => {
    const s = buildSmartSearchPrompt('x', '2026-11-01', vocab).system
    for (const w of ['חילוץ', 'מרכז', 'פגוש קדמי', 'ראשון', 'DD.MM', 'volunteer_status', 'no_shift_from']) expect(s).toContain(w)
  })
  it('has at least 12 Hebrew examples and at most 3 non-Hebrew ones', () => {
    const he = SMART_SEARCH_EXAMPLES.filter((e) => /[֐-׿]/.test(e.q))
    expect(he.length).toBeGreaterThanOrEqual(12)
    expect(SMART_SEARCH_EXAMPLES.length - he.length).toBeLessThanOrEqual(3)
  })
  it('every example filter survives validation unchanged', () => {
    for (const e of SMART_SEARCH_EXAMPLES)
      expect(validateSmartSearchFilter(e.filter, fullVocab)).toMatchObject(e.filter)
  })
  it('jerusalemToday rolls over at Jerusalem midnight, not UTC', () => {
    expect(jerusalemToday(new Date('2026-10-31T22:30:00Z'))).toBe('2026-11-01')
  })
})
