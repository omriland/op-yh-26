import { describe, expect, it } from 'vitest'
import { shouldShowSecurityBadge, SNYK_SECURITY_BADGE } from './securityBadge'

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
    expect(SNYK_SECURITY_BADGE.label).toBe('Protected by Snyk')
  })
})
