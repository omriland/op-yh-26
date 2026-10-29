import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  shouldShowSecurityBadge,
  SNYK_SECURITY_BADGE,
  CLOUDFLARE_SECURITY_BADGE,
} from './securityBadge'

const css = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../styles/components.css'),
  'utf8',
)

function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = css.match(new RegExp(`^${escaped}\\s*\\{([^}]+)\\}`, 'm'))
  if (!match) {
    throw new Error(`Missing CSS rule for ${selector}`)
  }
  return match[1]
}

describe('shouldShowSecurityBadge', () => {
  it('shows on list/admin surfaces', () => {
    expect(shouldShowSecurityBadge(false)).toBe(true)
  })

  it('hides on immersive form/fill/detail surfaces', () => {
    expect(shouldShowSecurityBadge(true)).toBe(false)
  })
})

describe('SNYK_SECURITY_BADGE', () => {
  it('links to snyk.io with the English brand line', () => {
    expect(SNYK_SECURITY_BADGE.href).toBe('https://snyk.io')
    expect(SNYK_SECURITY_BADGE.label).toBe(
      'This website is protected by Snyk and Cloudflare',
    )
  })
})

describe('CLOUDFLARE_SECURITY_BADGE', () => {
  it('links to cloudflare.com with a local mark', () => {
    expect(CLOUDFLARE_SECURITY_BADGE.href).toBe('https://www.cloudflare.com')
    expect(CLOUDFLARE_SECURITY_BADGE.logoSrc).toBe('/cloudflare-mark.svg')
  })
})

describe('app-footer full-width layout', () => {
  it('removes content-max and form-max caps from .app-footer in .shell__main', () => {
    const body = ruleBody(
      '.shell__main > .app-footer,\n.shell__main--narrow > .app-footer,\n.shell__main:has(.event-groups) > .app-footer',
    )
    expect(body).toMatch(/max-width:\s*none/)
  })

  it('stretches .app-footer across the full page width with a top hairline and space-between alignment', () => {
    const body = ruleBody('.app-footer')
    expect(body).toMatch(/width:\s*100%/)
    expect(body).toMatch(/justify-content:\s*space-between/)
    expect(body).toMatch(/border-block-start:\s*1px solid var\(--stroke-hairline\)/)
  })

  it('pins the login footer to the bottom of the full-height portal without center-clumping', () => {
    const portal = ruleBody('.login__portal')
    expect(portal).toMatch(/width:\s*100%/)
    expect(portal).toMatch(/min-height:\s*100%/)
    expect(portal).toMatch(/z-index:\s*1/)
    expect(css).not.toMatch(/\.login\s+\.app-footer__line\s*\{\s*justify-content:\s*center/)
  })
})
