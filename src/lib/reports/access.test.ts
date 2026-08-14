import { describe, expect, it } from 'vitest'
import { reportsNavPlacement, visibleReportKinds } from './access'
import type { ReportKind } from './types'

const kinds: Pick<ReportKind, 'id' | 'audience'>[] = [
  { id: 'km_summary', audience: 'admin' },
  { id: 'km_detail', audience: 'admin' },
  { id: 'km_exceptions', audience: 'admin_and_shift_lead' },
  { id: 'duplicate_events', audience: 'admin_and_shift_lead' },
]

describe('reportsNavPlacement', () => {
  it('puts admins on the ניהול door even when they are also אחמ״ש', () => {
    expect(reportsNavPlacement(['admin', 'shift_lead'])).toBe('admin')
    expect(reportsNavPlacement(['admin'])).toBe('admin')
  })

  it('puts אחמ״ש-only on the כלים לאחמ״ש door', () => {
    expect(reportsNavPlacement(['shift_lead', 'responder'])).toBe('shift_lead')
  })

  it('hides reports from responders', () => {
    expect(reportsNavPlacement(['responder'])).toBe('none')
    expect(reportsNavPlacement([])).toBe('none')
  })
})

describe('visibleReportKinds', () => {
  it('shows all kinds to admin', () => {
    expect(visibleReportKinds(kinds, ['admin']).map((kind) => kind.id)).toEqual([
      'km_summary',
      'km_detail',
      'km_exceptions',
      'duplicate_events',
    ])
  })

  it('shows only אחמ״ש kinds to shift_lead', () => {
    expect(visibleReportKinds(kinds, ['shift_lead']).map((kind) => kind.id)).toEqual([
      'km_exceptions',
      'duplicate_events',
    ])
  })

  it('shows none to responder', () => {
    expect(visibleReportKinds(kinds, ['responder'])).toEqual([])
  })
})
