import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../styles/components.css'),
  'utf8',
)
const tokens = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../styles/tokens.css'),
  'utf8',
)

function ruleBody(source: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = source.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`))
  if (!match) {
    throw new Error(`Missing CSS rule for ${selector}`)
  }
  return match[1]
}

describe('desktop shell cards', () => {
  it('defines the shell-card radius token', () => {
    expect(tokens).toMatch(/--radius-lg:\s*16px/)
  })

  it('floats the sidebar and main as rounded cards on desktop', () => {
    expect(ruleBody(css, '.shell--cards .sidebar')).toMatch(/border-radius:\s*var\(--radius-lg\)/)
    expect(ruleBody(css, '.shell--cards .shell__main')).toMatch(/border-radius:\s*var\(--radius-lg\)/)
    expect(ruleBody(css, '.shell--cards .shell__main')).toMatch(
      /background:\s*var\(--surface-page\)/,
    )
  })

  it('keeps the wordmark in the sidebar, not a full-width desktop bar', () => {
    expect(css).toMatch(/\.sidebar__brand\s*\{/)
    expect(ruleBody(css, '.shell--cards')).toMatch(/background:\s*var\(--surface-sunken\)/)
  })

  it('opens the sidebar user menu toward the content card', () => {
    const body = ruleBody(css, '.menu--rise')
    expect(body).toMatch(/inset-inline-start:\s*0/)
    expect(body).toMatch(/inset-inline-end:\s*auto/)
  })

  it('outlines אירוע חדש like a nav row, not a filled primary', () => {
    const body = ruleBody(css, '.nav-item.sidebar__new-event')
    expect(body).toMatch(/border:\s*1px solid var\(--stroke-strong\)/)
    expect(body).not.toMatch(/accent-fill/)
    expect(css).toMatch(/\.nav-item\s*\{[^}]*height:\s*40px/)
  })
})
