import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { EventListItem, EventResponderSummary } from '../../lib/events'
import { AssignedRespondersTip, EventsTable, responderDisplayName } from './EventsTable'

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

function responder(
  partial: Partial<EventResponderSummary> & Pick<EventResponderSummary, 'id'>,
): EventResponderSummary {
  return {
    responder_id: partial.id,
    status: 'pending',
    total_km: null,
    started_at: null,
    ended_at: null,
    profile: { full_name: 'מתנדב', callsign: '1' },
    ...partial,
  }
}

describe('AssignedRespondersTip', () => {
  it('uses the display name, then the callsign', () => {
    expect(responderDisplayName({ full_name: 'אלכסנדר', callsign: '738' })).toBe('אלכסנדר')
    expect(responderDisplayName({ full_name: null, callsign: '12' })).toBe('12')
    expect(responderDisplayName(null)).toBe('מתנדב')
  })

  it('lists assigned responders and says when nobody is assigned', () => {
    const filled = renderToStaticMarkup(
      createElement(AssignedRespondersTip, {
        responders: [
          responder({
            id: 'r1',
            status: 'done',
            profile: { full_name: 'אלכסנדר', callsign: '738' },
          }),
          responder({
            id: 'r2',
            profile: { full_name: 'דנה', callsign: '14' },
          }),
        ],
      }),
    )
    const empty = renderToStaticMarkup(
      createElement(AssignedRespondersTip, { responders: [] }),
    )

    expect(filled).toContain('אלכסנדר')
    expect(filled).toContain('דנה')
    expect(filled).not.toContain('738')
    expect(empty).toContain('אין מתנדבים משובצים')
    expect(empty).toContain('hover-tip__empty')
  })
})

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

  it('puts a done-but-KM-missing event on פרטים חסרים, the second of five steps', () => {
    const html = renderToStaticMarkup(
      createElement(EventsTable, {
        events: [
          event({
            status: 'done',
            shift_lead_id: 'lead',
            responders: [
              {
                id: 'r1',
                responder_id: 'u1',
                status: 'done',
                total_km: null,
                started_at: '2026-09-03T06:00:00+03:00',
                ended_at: '2026-09-03T07:00:00+03:00',
                profile: { full_name: 'אלכסנדר', callsign: '738' },
              },
            ],
          }),
        ],
        onOpen: () => undefined,
        incompleteNoticeFor: () => ({
          fields: ['ק״מ'],
          spoken: 'חסרים: ק״מ',
        }),
      }),
    )

    expect(html).toContain('event-status-trail__label--alert">פרטים חסרים<')
    expect(html.match(/event-status-trail__step /g)).toHaveLength(5)
    expect(html).toContain('event-status-trail__step--past"><span')
    expect(html).not.toContain('event-status-trail__label--done')
    expect(html).not.toContain('table-row--done')
  })

  it('reads פרטים חסרים whoever leads the event: admins see the אחמ״ש view', () => {
    const html = renderToStaticMarkup(
      createElement(EventsTable, {
        events: [
          event({
            status: 'done',
            shift_lead_id: 'other-lead',
            lead_km_owed: true,
            responders: [
              {
                id: 'r1',
                responder_id: 'u1',
                status: 'done',
                total_km: null,
                started_at: '2026-09-03T06:00:00+03:00',
                ended_at: '2026-09-03T07:00:00+03:00',
                profile: { full_name: 'אלכסנדר', callsign: '738' },
              },
            ],
          }),
        ],
        onOpen: () => undefined,
      }),
    )

    expect(html).toContain('פרטים חסרים')
    expect(html).not.toContain('>תועד<')
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

  it('keeps the done/assigned fraction and makes it a focusable hover target', () => {
    const html = renderToStaticMarkup(
      createElement(EventsTable, {
        events: [
          event({
            responders: [
              responder({ id: 'r1', status: 'done' }),
              responder({ id: 'r2', status: 'pending' }),
            ],
          }),
          event({ id: 'empty' }),
        ],
        onOpen: () => undefined,
      }),
    )

    expect(html).toContain('events-table__responders')
    expect(html).toContain('tabindex="0"')
    expect(html).toContain('>1/2<')
    expect(html).toContain('>0/0<')
  })

  it('shows an attachment mark only when the event has an image', () => {
    const withImage = renderToStaticMarkup(
      createElement(EventsTable, {
        events: [event({ status: 'done', has_image: true })],
        onOpen: () => undefined,
      }),
    )
    const without = renderToStaticMarkup(
      createElement(EventsTable, {
        events: [event({ status: 'done' })],
        onOpen: () => undefined,
      }),
    )

    expect(withImage).toContain('יש תמונה מצורפת')
    expect(withImage).toContain('>תועד<')
    expect(without).not.toContain('יש תמונה מצורפת')
  })
})
