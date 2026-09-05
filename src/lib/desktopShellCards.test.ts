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

  it('rings אירוע חדש with an animated outline border', () => {
    expect(css).toMatch(/\.create-event-btn\s*\{/)
    expect(css).toMatch(/\.create-event-btn__border-dot/)
    expect(css).toMatch(
      /background:\s*linear-gradient\(to right,\s*transparent,\s*var\(--accent\),\s*var\(--accent\)\)/,
    )
    const shell = ruleBody(css, '.sidebar__new-event-shell')
    expect(shell).toMatch(/width:\s*75%/)
    expect(shell).toMatch(/margin-inline-end:\s*auto/)
    expect(css).toMatch(/\.nav-item\s*\{[^}]*height:\s*36px/)
    expect(css).not.toMatch(/\.sidebar__create/)
    expect(css).not.toMatch(/\.new-event-btn-shell/)
    expect(ruleBody(css, '.tabbar-more .nav-item')).toMatch(/height:\s*44px/)
  })
})
