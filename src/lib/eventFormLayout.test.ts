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

  it('places location before road in DOM and responsive grid order', () => {
    const locationField = eventFormSource.indexOf(
      "<div className={placesLocation ? 'event-form__f-places' : 'event-form__f-location'}>",
    )
    const roadField = eventFormSource.indexOf('<div className="event-form__f-road">')
    expect(locationField).toBeGreaterThan(-1)
    expect(roadField).toBeGreaterThan(locationField)

    const identityGrid = ruleBody('.event-form__identity')
    expect(identityGrid.indexOf("'loc loc'")).toBeLessThan(identityGrid.indexOf("'road road'"))
    expect(identityGrid.indexOf("'places places'")).toBeLessThan(
      identityGrid.indexOf("'road road'"),
    )
  })
})
