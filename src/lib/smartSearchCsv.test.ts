import { describe, expect, it } from 'vitest'
import type { EventListItem } from './events'
import { archiveCsv, eventsCsv, searchCsvFilename } from './smartSearchCsv'
import type { ArchiveRow } from './smartSearchApi'

const event = {
  id: 'e1',
  event_date: '2026-10-05',
  police_event_id: '12345',
  location: 'ק״מ 12',
  road: { name: '90' },
  event_type: { name: 'תקלה' },
  shift_lead: { full_name: 'דנה לוי', callsign: 'א1' },
  origin: 'event',
  status: 'done',
  treatment_detail: 'החלפת גלגל',
  shared_plates: [{ plate_number: '1234567', manufacturer: 'סוזוקי', model: 'סוויפט', sort_order: 0 }],
  responders: [
    { id: 'r1', status: 'done', total_km: 12, profile: { full_name: 'אבי כהן', callsign: 'ב2' } },
    { id: 'r2', status: 'done', total_km: null, profile: { full_name: 'רון בר', callsign: 'ב3' } },
  ],
  found_by: 'לוחית 12-345-67',
} as unknown as EventListItem & { found_by: string }

describe('eventsCsv', () => {
  it('header is the events-table headers plus the export columns', () => {
    const header = eventsCsv([event]).split('\r\n')[0]
    expect(header).toBe(
      'תאריך,מספר אירוע,סוג אירוע,כביש / מיקום,אחמ״ש,מתנדבים,סטטוס תיעוד,נמצא לפי,לוחיות,יצרן ודגם,כוננים,ק״מ,פירוט הטיפול',
    )
  })

  it('maps a row', () => {
    const line = eventsCsv([event]).split('\r\n')[1]
    expect(line).toContain('05.10.2026')
    expect(line).toContain('12-345-67')
    expect(line).toContain('סוזוקי סוויפט')
    expect(line).toContain('אבי כהן; רון בר')
    expect(line).toContain('החלפת גלגל')
  })

  it('adds responder-owned plates after the event plates, once per plate number', () => {
    const fillBorn = {
      ...event,
      shared_plates: [{ plate_number: '1234567', manufacturer: 'סוזוקי', model: 'סוויפט', sort_order: 0 }],
      responders: [
        {
          ...event.responders[0],
          treated_plates: [
            { plate_number: '7654321', manufacturer: 'מאזדה', model: '3', sort_order: 1 },
            { plate_number: '1234567', manufacturer: 'סוזוקי', model: 'סוויפט', sort_order: 0 },
          ],
        },
        { ...event.responders[1], treated_plates: [{ plate_number: '11122233', manufacturer: 'טויוטה', model: null, sort_order: 0 }] },
      ],
    } as unknown as typeof event
    const line = eventsCsv([fillBorn]).split('\r\n')[1]
    expect(line).toContain('12-345-67; 76-543-21; 111-22-233')
    expect(line).toContain('סוזוקי סוויפט; מאזדה 3; טויוטה')
  })

  it('lists responder-owned plates when the event owns none', () => {
    const fillBorn = {
      ...event,
      shared_plates: [],
      responders: [{ ...event.responders[0], treated_plates: [{ plate_number: '7654321', manufacturer: 'מאזדה', model: '3', sort_order: 0 }] }],
    } as unknown as typeof event
    const line = eventsCsv([fillBorn]).split('\r\n')[1]
    expect(line).toContain('76-543-21')
    expect(line).toContain('מאזדה 3')
  })
})

describe('archiveCsv', () => {
  const row: ArchiveRow = {
    event_fk: 'x',
    event_date: '2019-03-02',
    event_number: '555',
    road: '1',
    location: 'צומת',
    people: 'דני',
    cars: 'סוזוקי',
    damage: 'פגוש',
    found_by: 'כביש 1',
    actions: 'החלפת גלגל',
  }

  it('has the spec header and no 9-digit run', () => {
    const csv = archiveCsv([row])
    expect(csv.split('\r\n')[0]).toBe(
      'תאריך,מספר אירוע,כביש / מיקום,כוננים,רכבים,נזק,נמצא לפי,פעולות שבוצעו',
    )
    expect(csv).not.toMatch(/\d{9}/)
    expect(csv).toContain('02.03.2019')
    expect(csv.split('\r\n')[1].endsWith(',החלפת גלגל')).toBe(true)
  })
})

describe('searchCsvFilename', () => {
  it('matches the spec', () => {
    expect(searchCsvFilename('events', '2026-11-01')).toBe('חיפוש-אירועים-2026-11-01.csv')
    expect(searchCsvFilename('archive', '2026-11-01')).toBe('חיפוש-ארכיון-2026-11-01.csv')
  })
})
