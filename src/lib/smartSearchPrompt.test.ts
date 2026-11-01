import { describe, expect, it } from 'vitest'
import { LEGACY_HIT_TYPE_LABELS } from '../../supabase/functions/_shared/legacyHitTypes'
import { validateSmartSearchFilter } from '../../supabase/functions/_shared/smartSearchFilter'
import type { SmartSearchVocab } from '../../supabase/functions/_shared/smartSearchFilter'
import {
  SMART_SEARCH_EXAMPLES,
  buildSmartSearchMessages,
  jerusalemToday,
} from '../../supabase/functions/_shared/smartSearchPrompt'

const fullVocab: SmartSearchVocab = {
  eventTypes: ['חילוץ', 'גרירה', 'תאונה'],
  districts: ['מרכז', 'דרום', 'צפון'],
  hitTypes: [...LEGACY_HIT_TYPE_LABELS],
}
const vocab = fullVocab

describe('smart search prompt', () => {
  it('puts the stable instructions first and the query last, so the prefix caches', () => {
    const m = buildSmartSearchMessages('אירוע בכביש 531 בשבוע שעבר', '2026-11-01', vocab)
    expect(m[0].role).toBe('system')
    expect(m.at(-1)).toEqual({ role: 'user', content: 'אירוע בכביש 531 בשבוע שעבר' })
    expect(m[0].content).toContain('2026-11-01')
  })
  it('lists the vocab and says Sunday–Saturday weeks, day-first dates, most recent past month', () => {
    const s = buildSmartSearchMessages('x', '2026-11-01', vocab)[0].content
    for (const w of ['חילוץ', 'מרכז', 'פגוש קדמי', 'ראשון', 'DD.MM']) expect(s).toContain(w)
  })
  it('is identical across calls for the same day and vocab', () => {
    const a = buildSmartSearchMessages('א', '2026-11-01', vocab)[0].content
    const b = buildSmartSearchMessages('ב', '2026-11-01', vocab)[0].content
    expect(a).toBe(b)
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
