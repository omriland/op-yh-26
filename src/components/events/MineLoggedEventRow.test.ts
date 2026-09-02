import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { EventListItem } from '../../lib/events'
import { MineLoggedEventRow } from './MineLoggedEventRow'

function event(partial: Partial<EventListItem> = {}): EventListItem {
  return {
    id: 'e1',
    event_date: '2026-08-17',
    police_event_id: '12345',
    patrol_callsign: null,
    location: 'מחלף אייל',
    status: 'done',
    is_cancelled: false,
    origin: 'manual',
    shift_id: null,
    treatment_detail: null,
    treatment_notes: null,
    emergency_means: false,
    district: { name: 'שלוחה צפון' },
    event_type: { name: 'פינוי רכב' },
    road: { name: 'כביש 6' },
    shift_lead: null,
    last_saved: null,
    shift: null,
    shared_treated: [],
    responders: [],
    ...partial,
  }
}

describe('MineLoggedEventRow', () => {
  it('is a stacked archive row without a fill CTA', () => {
    const html = renderToStaticMarkup(
      createElement(MineLoggedEventRow, {
        event: event(),
        stamp: { label: 'הושלם', tone: 'done' },
        onOpen: () => undefined,
      }),
    )

    expect(html).toContain('פינוי רכב')
    expect(html).toContain('כביש 6 · מחלף אייל')
    expect(html).toContain('הושלם')
    expect(html).toContain('12345')
    expect(html).not.toContain('השלמת התיעוד שלי')
    expect(html).not.toContain('פרטי האירוע')
    expect(html).toContain('list-rows__item')
  })
})
