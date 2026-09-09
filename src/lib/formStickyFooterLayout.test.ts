import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../styles/components.css'),
  'utf8',
)

function ruleBodies(selector: string): string[] {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const matches = [...css.matchAll(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`, 'g'))]
  if (matches.length === 0) {
    throw new Error(`Missing CSS rule for ${selector}`)
  }
  return matches.map((match) => match[1])
}

describe('form sticky footer layout', () => {
  it('cancels shell main block-end padding so the footer meets the scrollport', () => {
    expect(ruleBodies('.shell__main:has(.event-form__footer)').join('\n')).toMatch(
      /padding-block-end:\s*0/,
    )
  })

  it('keeps the action bar sticky against the scrollport bottom', () => {
    const bodies = ruleBodies('.event-form__footer')
    expect(bodies.some((body) => /position:\s*sticky/.test(body))).toBe(true)
    expect(bodies.some((body) => /inset-block-end:\s*0/.test(body))).toBe(true)
  })
})
