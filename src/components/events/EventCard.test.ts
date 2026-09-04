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

const stamp = { label: 'ממתין לתיעוד', tone: 'pending' as const }

describe('EventCard inbox mode', () => {
  it('keeps the fill CTA and opens detail from the card body', () => {
    const opened: string[] = []
    const filled: string[] = []
    const html = renderToStaticMarkup(
      createElement(EventCard, {
        event: event(),
        stamp,
        onOpen: (id) => opened.push(id),
        onFill: (id) => filled.push(id),
        fillLabel: 'השלמת התיעוד שלי',
        mode: 'inbox',
      }),
    )

    expect(html).toContain('השלמת התיעוד שלי')
    expect(html).toContain('event-card')
    expect(html).not.toContain('פרטי האירוע')
    expect(opened).toEqual([])
    expect(filled).toEqual([])
  })

  it('marks regular inbox cards with a record-blue rail', () => {
    const html = renderToStaticMarkup(
      createElement(EventCard, {
        event: event(),
        stamp,
        onOpen: () => undefined,
        onFill: () => undefined,
        fillLabel: 'השלמת התיעוד שלי',
        mode: 'inbox',
      }),
    )

    expect(html).toContain('event-card-shell--manual')
  })

  it('does not mark shift-born inbox cards', () => {
    const html = renderToStaticMarkup(
      createElement(EventCard, {
        event: event({ origin: 'shift', shift_id: 's1' }),
        stamp,
        onOpen: () => undefined,
        onFill: () => undefined,
        fillLabel: 'השלמת התיעוד שלי',
        mode: 'inbox',
      }),
    )

    expect(html).not.toContain('event-card-shell--manual')
  })

  it('paints overdue inbox cards red instead of the origin rail', () => {
    const html = renderToStaticMarkup(
      createElement(EventCard, {
        event: event(),
        stamp,
        onOpen: () => undefined,
        onFill: () => undefined,
        fillLabel: 'השלמת התיעוד שלי',
        mode: 'inbox',
        overdue: true,
      }),
    )

    expect(html).toContain('event-card-shell--overdue')
    expect(html).not.toContain('event-card-shell--manual')
    expect(html).toContain('event-card__overdue-mark')
    expect(html).toContain('אירוע ממתין לתיעוד מעל ל־48 שעות')
    const markAt = html.indexOf('event-card__overdue-mark')
    const titleAt = html.indexOf('פינוי רכב')
    expect(markAt).toBeGreaterThan(-1)
    expect(titleAt).toBeGreaterThan(markAt)
  })

  it('paints overdue shift-born inbox cards red', () => {
    const html = renderToStaticMarkup(
      createElement(EventCard, {
        event: event({ origin: 'shift', shift_id: 's1' }),
        stamp,
        onOpen: () => undefined,
        onFill: () => undefined,
        fillLabel: 'השלמת התיעוד שלי',
        mode: 'inbox',
        overdue: true,
      }),
    )

    expect(html).toContain('event-card-shell--overdue')
    expect(html).not.toContain('event-card-shell--manual')
    expect(html).toContain('event-card__overdue-mark')
  })

  it('hides the sand watch when the card is not overdue', () => {
    const html = renderToStaticMarkup(
      createElement(EventCard, {
        event: event(),
        stamp,
        onOpen: () => undefined,
        onFill: () => undefined,
        fillLabel: 'השלמת התיעוד שלי',
        mode: 'inbox',
      }),
    )

    expect(html).not.toContain('event-card__overdue-mark')
    expect(html).not.toContain('אירוע ממתין לתיעוד מעל ל־48 שעות')
  })

  it('drops district from the inbox meta line', () => {
    const html = renderToStaticMarkup(
      createElement(EventCard, {
        event: event(),
        stamp,
        onOpen: () => undefined,
        onFill: () => undefined,
        fillLabel: 'השלמת התיעוד שלי',
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
    expect(html).not.toContain('event-card-shell--manual')
  })

  it('shows the missing-fields notice on the unit list', () => {
    const html = renderToStaticMarkup(
      createElement(EventCard, {
        event: event(),
        stamp,
        onOpen: () => undefined,
        incompleteFields: ['ק״מ'],
        incompleteSpoken: 'חסרים: ק״מ',
      }),
    )

    expect(html).toContain('event-card-shell--incomplete')
    expect(html).toContain('incomplete-notice')
    expect(html).toContain('פרטים חסרים:')
    expect(html).toContain('ק״מ')
    expect(html).toContain('חסרים: ק״מ')
    expect(html).not.toContain('role="alert"')
  })

  it('shows a snowflake on frozen unit-list cards', () => {
    const html = renderToStaticMarkup(
      createElement(EventCard, {
        event: event({ frozen_over_60km: true }),
        stamp,
        onOpen: () => undefined,
      }),
    )

    expect(html).toContain('event-frozen-mark')
    expect(html).toContain('האירוע מוקפא בגלל חריגת קילומטרים (מעל 60 ק״מ) וממתין לאישור מנהל.')
  })
})
