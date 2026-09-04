import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { EventListItem } from '../../lib/events'
import { EventsTable } from './EventsTable'

function event(partial: Partial<EventListItem> = {}): EventListItem {
  return {
    id: 'e1',
    event_date: '2026-09-04',
    police_event_id: '12345',
    patrol_callsign: 'ניידת 1',
    location: 'מחלף אייל',
    status: 'in_progress',
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

describe('EventsTable incomplete pin', () => {
  it('keeps סוג אירוע clean and lists missing fields on a meta row', () => {
    const html = renderToStaticMarkup(
      createElement(EventsTable, {
        caption: 'דורשים השלמת פרטים',
        events: [event()],
        onOpen: () => undefined,
        incompleteNoticeFor: () => ({
          fields: ['ק״מ'],
          spoken: 'חסרים: ק״מ',
        }),
      }),
    )

    expect(html).toContain('דורשים השלמת פרטים')
    expect(html).toContain('table-row--needs-completion')
    expect(html).toContain('table-row--completion-meta')
    expect(html).toContain('פרטים חסרים:')
    expect(html).toContain('ק״מ')
    expect(html).toContain('colSpan="7"')
    expect(html).not.toContain('table-row--done')
    expect(html).not.toContain('table-row--incomplete')
    expect(html.indexOf('event-card__type')).toBeLessThan(html.indexOf('incomplete-notice'))
  })

  it('keeps done tint when the row is complete', () => {
    const html = renderToStaticMarkup(
      createElement(EventsTable, {
        events: [event({ status: 'done' })],
        onOpen: () => undefined,
      }),
    )

    expect(html).toContain('table-row--done')
    expect(html).not.toContain('table-row--needs-completion')
    expect(html).not.toContain('table-row--completion-meta')
  })
})
