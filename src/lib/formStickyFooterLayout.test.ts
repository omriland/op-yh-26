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

describe('form sticky footer layout', () => {
  it('cancels shell main block-end padding so the footer meets the scrollport', () => {
    expect(ruleBody('.shell__main:has(.event-form__footer)')).toMatch(
      /padding-block-end:\s*0/,
    )
  })

  it('keeps the action bar sticky against the scrollport bottom', () => {
    const body = ruleBody('.event-form__footer')
    expect(body).toMatch(/position:\s*sticky/)
    expect(body).toMatch(/inset-block-end:\s*0/)
  })
})
