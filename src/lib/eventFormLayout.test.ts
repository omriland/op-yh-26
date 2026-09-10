import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../styles/components.css'),
  'utf8',
)
const eventFormSource = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../pages/EventFormPage.tsx'),
  'utf8',
)

function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`))
  if (!match) {
    throw new Error(`Missing CSS rule for ${selector}`)
  }
  return match[1]
}

describe('event form standalone layout', () => {
  it('centers the lead create/edit form in the main pane at 1.3× --form-max', () => {
    const shellChild = ruleBody('.shell__main > .event-form--standalone')
    expect(shellChild).toMatch(/width:\s*min\(100%, calc\(var\(--form-max\) \* 1\.3\)\)/)
    expect(shellChild).toMatch(/max-width:\s*calc\(var\(--form-max\) \* 1\.3\)/)
    expect(shellChild).toMatch(/align-self:\s*center/)
    expect(shellChild).toMatch(/margin-inline:\s*auto/)

    expect(ruleBody('.event-form--standalone .event-form__frame')).toMatch(/width:\s*100%/)
    expect(ruleBody('.event-form--standalone .event-form__panel')).toMatch(/width:\s*100%/)
  })

  it('keeps the shared event-form panel on the form-max token', () => {
    expect(css).toMatch(/\.event-form__panel \{\s*width:\s*min\(100%, var\(--form-max\)\)/)
  })

  it('marks required labels with the status-alert asterisk', () => {
    expect(ruleBody('.field__required')).toMatch(/color:\s*var\(--status-alert\)/)
  })

  it('binds a field note to its field: more space above than below', () => {
    const note = ruleBody('.field-note')
    expect(note).toMatch(/margin-block-start:\s*var\(--space-2\)/)
    expect(note).toMatch(/margin-block-end:\s*var\(--space-1\)/)
    expect(ruleBody('.time-field__label-row')).toMatch(/margin-block-end:\s*var\(--space-1\)/)
    expect(ruleBody('.time-field__now')).toMatch(/margin-block:\s*calc\(\(18px - 44px\) \/ 2\)/)
  })

  it('splits the form into leads, event details, and responders sections', () => {
    const leads = eventFormSource.indexOf('{EVENT_FORM_LEADS_SECTION}')
    const details = eventFormSource.indexOf('פרטי האירוע')
    const responders = eventFormSource.indexOf('>מתנדבים<')
    expect(leads).toBeGreaterThan(-1)
    expect(details).toBeGreaterThan(leads)
    expect(responders).toBeGreaterThan(details)
    expect(eventFormSource).not.toContain('חלק א׳')
    expect(eventFormSource).not.toContain('חלק ב׳')
  })

  it('keeps FieldNote tips and time-now helpers out of the tab order', () => {
    const fieldNote = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '../components/ui/FieldNote.tsx'),
      'utf8',
    )
    const timeField = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '../components/ui/TimeField.tsx'),
      'utf8',
    )
    expect(fieldNote).toContain('tabIndex={-1}')
    expect(timeField).toMatch(/className="time-field__now"[\s\S]*tabIndex=\{-1\}/)
  })

  it('wires FieldNote from the event-form field-notes registry', () => {
    expect(eventFormSource).toContain('<FieldNote field="event_times"')
    expect(eventFormSource).toContain('<FieldNote field="started_at"')
    expect(eventFormSource).toContain('<FieldNote field="ended_at"')
    expect(eventFormSource).toContain('<FieldNote field="police_event_id"')
    expect(eventFormSource).toContain('<FieldNote field="patrol_callsign"')
    expect(eventFormSource).toContain('<FieldNote field="location"')
    expect(eventFormSource).toContain('event-form__f-type-id')
    expect(eventFormSource).toContain('event-form__f-callsign')
    expect(eventFormSource).toContain('event-form__f-date')
    expect(eventFormSource).toContain('event-form__f-times-note')
    expect(eventFormSource).toContain('event-form__f-times')
    expect(eventFormSource).toContain('event-form__f-district-place')
    expect(eventFormSource).toContain('יצירת אירוע')
    expect(eventFormSource).toContain('שמירה כטיוטה')
  })

  it('orders identity rows: type+id, callsign, date, times, district+place+road', () => {
    const typeRow = eventFormSource.indexOf('event-form__f-type-id')
    const typeField = eventFormSource.indexOf('label="סוג אירוע"')
    const policeField = eventFormSource.indexOf('label="מספר אירוע"')
    const callsignRow = eventFormSource.indexOf('event-form__f-callsign')
    const dateField = eventFormSource.indexOf('label="תאריך"')
    const timesNote = eventFormSource.indexOf('event-form__f-times-note')
    const times = eventFormSource.indexOf('className="event-form__f-times"')
    const districtPlace = eventFormSource.indexOf('event-form__f-district-place')
    const locationField = eventFormSource.indexOf("placesLocation ? 'event-form__f-places' : 'event-form__f-location'")
    const roadField = eventFormSource.indexOf('<div className="event-form__f-road">')

    expect(typeRow).toBeGreaterThan(-1)
    expect(typeField).toBeGreaterThan(typeRow)
    expect(policeField).toBeGreaterThan(typeField)
    expect(callsignRow).toBeGreaterThan(policeField)
    expect(timesNote).toBeGreaterThan(callsignRow)
    expect(dateField).toBeGreaterThan(timesNote)
    expect(times).toBeGreaterThan(dateField)
    expect(districtPlace).toBeGreaterThan(times)
    expect(locationField).toBeGreaterThan(districtPlace)
    expect(roadField).toBeGreaterThan(locationField)

    const identityGrid = ruleBody('.event-form__grid.event-form__identity')
    expect(identityGrid).toMatch(/grid-template-columns:\s*1fr/)
    expect(identityGrid).toMatch(/'date'/)
    expect(identityGrid).toMatch(/'typeId'/)
    expect(identityGrid).toMatch(/'callsign'/)
    expect(identityGrid).toMatch(/'timesNote'/)
    expect(identityGrid).toMatch(/'times'/)
    expect(identityGrid).toMatch(/'districtPlace'/)
    expect(css).toMatch(
      /\.event-type-id__fields,\s*\.event-callsign__fields,\s*\.event-date-times__fields \{\s*display:\s*grid;\s*width:\s*100%;\s*grid-template-columns:\s*1fr 1fr/,
    )
    expect(css).toMatch(
      /grid-template-areas:\s*'typeId typeId typeId'\s*'callsign callsign callsign'\s*'timesNote timesNote timesNote'\s*'date times times'/,
    )
    expect(css).toMatch(
      /\.event-district-place \{\s*grid-template-columns:\s*minmax\(0, 0\.7fr\) minmax\(0, 1\.6fr\) minmax\(0, 0\.7fr\)/,
    )
  })
})
