import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../styles/components.css'),
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
})
