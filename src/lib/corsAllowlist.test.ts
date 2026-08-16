import { describe, expect, it } from 'vitest'
import { isAllowedOrigin } from '../../supabase/functions/_shared/cors.allowlist.ts'

describe('Edge CORS allowlist', () => {
  it('allows production and local Vite origins', () => {
    expect(isAllowedOrigin('https://yahpz.com')).toBe(true)
    expect(isAllowedOrigin('https://www.yahpz.com')).toBe(true)
    expect(isAllowedOrigin('https://yahpaz-2026.netlify.app')).toBe(true)
    expect(isAllowedOrigin('http://localhost:5173')).toBe(true)
    expect(isAllowedOrigin('http://127.0.0.1:5173')).toBe(true)
  })

  it('allows Netlify preview/branch hosts for this site', () => {
    expect(isAllowedOrigin('https://deploy-preview-12--yahpaz-2026.netlify.app')).toBe(
      true,
    )
    expect(isAllowedOrigin('https://infra-bootstrap--yahpaz-2026.netlify.app')).toBe(
      true,
    )
  })

  it('rejects unrelated origins', () => {
    expect(isAllowedOrigin('https://evil.example')).toBe(false)
    expect(isAllowedOrigin('http://localhost:3000')).toBe(false)
    expect(isAllowedOrigin('https://yahpaz-2026.netlify.app.evil.com')).toBe(false)
    expect(isAllowedOrigin('https://other--someone.netlify.app')).toBe(false)
  })
})
