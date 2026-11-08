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

const shellCss = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../styles/desktop-shell.css'),
  'utf8',
)

describe('desktop shell', () => {
  it('keeps the warm palette in tokens, scoped to the desktop shell', () => {
    for (const hex of ['#faf6f1', '#f4eee6', '#ebe5dc', '#d7d2ca', '#1b1918', '#544e48', '#726c66']) {
      expect(tokens).toContain(hex)
    }
    expect(ruleBody(tokens, '.shell--desktop')).toMatch(/--dshell-bg:\s*var\(--warm-50\)/)
    // No raw hex in the shell stylesheet: colors come from tokens.
    expect(shellCss).not.toMatch(/#[0-9a-f]{3,8}\b/i)
  })

  it('sits the page in a white card with rounded top corners and an inline-end gap', () => {
    const card = ruleBody(shellCss, '.dshell__card')
    expect(card).toMatch(/background:\s*var\(--dshell-card\)/)
    expect(card).toMatch(/border-start-start-radius:\s*var\(--dshell-card-radius\)/)
    expect(card).toMatch(/margin-inline-end:\s*var\(--space-3\)/)
    expect(tokens).toMatch(/--dshell-card-radius:\s*24px/)
  })

  it('collapses the nav from 240px to a 64px rail', () => {
    expect(tokens).toMatch(/--dshell-nav-open:\s*240px/)
    expect(tokens).toMatch(/--dshell-nav-rail:\s*64px/)
    expect(ruleBody(shellCss, '.dnav--rail')).toMatch(/width:\s*var\(--dshell-nav-rail\)/)
  })

  it('animates sections open and closed with grid rows', () => {
    expect(ruleBody(shellCss, '.dnav-section__body')).toMatch(/grid-template-rows:\s*0fr/)
    expect(ruleBody(shellCss, '.dnav-section__body.is-open')).toMatch(/grid-template-rows:\s*1fr/)
  })

  it('rings אירוע חדש with an animated outline border', () => {
    expect(css).toMatch(/\.create-event-btn\s*\{/)
    expect(css).toMatch(/\.create-event-btn__border-dot/)
    expect(css).toMatch(
      /background:\s*linear-gradient\(to right,\s*transparent,\s*var\(--accent\),\s*var\(--accent\)\)/,
    )
    expect(css).toMatch(/\.sidebar__new-event-shell\s*\{[^}]*width:\s*75%/)
    expect(css).toMatch(/\.sidebar__new-event-shell\s*\{[^}]*margin-inline-end:\s*auto/)
    expect(css).toMatch(/\.nav-item\s*\{[^}]*height:\s*36px/)
    expect(css).not.toMatch(/\.sidebar__create/)
    expect(css).not.toMatch(/\.new-event-btn-shell/)
    expect(ruleBody(css, '.tabbar-more .nav-item')).toMatch(/height:\s*44px/)
  })
})
