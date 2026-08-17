import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { EventListItem } from '../../lib/events'
import { EventCard } from './EventCard'

function event(partial: Partial<EventListItem> = {}): EventListItem {
  return {
    id: 'e1',
    event_date: '2026-08-17',
    police_event_id: '12345',
    patrol_callsign: null,
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

const stamp = { label: 'ממתין למילוי פרטים', tone: 'pending' as const }

describe('EventCard inbox mode', () => {
  it('keeps the fill CTA and no path to event detail', () => {
    const html = renderToStaticMarkup(
      createElement(EventCard, {
        event: event(),
        stamp,
        onOpen: () => undefined,
        onFill: () => undefined,
        fillLabel: 'השלמת הפרטים שלי',
        mode: 'inbox',
      }),
    )

    expect(html).toContain('השלמת הפרטים שלי')
    expect(html).not.toContain('פרטי האירוע')
    expect(html).not.toContain('btn--ghost')
  })

  it('drops district from the inbox meta line', () => {
    const html = renderToStaticMarkup(
      createElement(EventCard, {
        event: event(),
        stamp,
        onOpen: () => undefined,
        onFill: () => undefined,
        fillLabel: 'השלמת הפרטים שלי',
        mode: 'inbox',
      }),
    )

    expect(html).toContain('12345')
    expect(html).toContain('כביש 6')
    expect(html).not.toContain('שלוחה צפון')
  })
})

describe('EventCard default (unit list)', () => {
  it('keeps district and has no inbox detail ghost', () => {
    const html = renderToStaticMarkup(
      createElement(EventCard, {
        event: event(),
        stamp,
        onOpen: () => undefined,
      }),
    )

    expect(html).toContain('שלוחה צפון')
    expect(html).not.toContain('פרטי האירוע')
  })
})
