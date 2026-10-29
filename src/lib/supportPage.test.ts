import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SupportPage } from '../pages/SupportPage'
import { parseAppPath, readBootRoute } from './appRoute'
import { PRIVACY_POLICY } from './privacyPolicy'
import { isSupportPath, SUPPORT_PATH } from './supportPage'

describe('support route', () => {
  it('is /support, with or without a trailing slash', () => {
    expect(SUPPORT_PATH).toBe('/support')
    expect(isSupportPath('/support')).toBe(true)
    expect(isSupportPath('/support/')).toBe(true)
    expect(isSupportPath('/supports')).toBe(false)
  })

  it('boots straight into the public page, logged out or in', () => {
    expect(parseAppPath('/support')).toEqual({ kind: 'support' })
    expect(readBootRoute('/support').legalPage).toBe('support')
  })
})

describe('SupportPage', () => {
  const html = renderToStaticMarkup(createElement(SupportPage))

  it('explains what the app is and who it is for', () => {
    expect(html).toContain('תמיכה')
    expect(html).toContain('יחידה הארצית לפינוי צירים')
    expect(html).toContain('לאנשי היחידה המורשים בלבד')
  })

  it('reuses the privacy policy contact details', () => {
    expect(html).toContain(`mailto:${PRIVACY_POLICY.contact.email}`)
    expect(html).toContain(PRIVACY_POLICY.contact.address)
  })

  it('links to the privacy policy and data deletion pages', () => {
    expect(html).toContain('href="/privacy"')
    expect(html).toContain('href="/delete-data"')
  })

  it('uses short hyphens instead of em dashes', () => {
    expect(html).not.toMatch(/—/)
  })
})
