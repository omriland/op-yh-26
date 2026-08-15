import { describe, expect, it } from 'vitest'
import {
  PRIVACY_FOOTER_LINK,
  PRIVACY_POLICY,
  privacyPolicyPlainText,
} from './privacyPolicy'

describe('PRIVACY_FOOTER_LINK', () => {
  it('uses the Hebrew label next to the Snyk badge', () => {
    expect(PRIVACY_FOOTER_LINK.label).toBe('מדיניות פרטיות')
  })
})

describe('PRIVACY_POLICY', () => {
  it('names the service and an effective date', () => {
    expect(PRIVACY_POLICY.title).toBe('מדיניות פרטיות')
    expect(PRIVACY_POLICY.productLine).toContain('אבן דרך')
    expect(PRIVACY_POLICY.effectiveDate).toMatch(/^\d{2}\.\d{2}\.\d{4}$/)
  })

  it('keeps the volunteer / non-commercial disclaimer', () => {
    expect(PRIVACY_POLICY.disclaimer).toMatch(/התנדבות/)
    expect(PRIVACY_POLICY.disclaimer).toMatch(/ללא תמורה/)
  })

  it('covers identity, contact, operational, and vehicle data — not leftover Responders fields', () => {
    const text = privacyPolicyPlainText()
    expect(text).toMatch(/שם מלא/)
    expect(text).toMatch(/או״ק|אות קריאה/)
    expect(text).toMatch(/דוא״ל|אימייל/)
    expect(text).toMatch(/טלפון/)
    expect(text).toMatch(/אירוע/)
    expect(text).toMatch(/משמרת/)
    expect(text).toMatch(/לוחית/)
    expect(text).not.toMatch(/בגד|חולצה|נשק|רישיון נשק/)
  })

  it('describes first-tier providers without naming each vendor', () => {
    const text = privacyPolicyPlainText()
    expect(text).toMatch(/ספקי שירות מהשורה הראשונה/)
    expect(text).toMatch(/נהלי אבטחה מחמירים/)
    expect(text).toMatch(/פעילות הבסיסית של המערכת/)
    expect(text).toMatch(/פגיעות סייבר/)
    expect(text).not.toMatch(/Supabase|Netlify|Resend|Soprano|PostHog|Google Analytics/)
  })

  it('states reasonable safeguards without promising absolute security', () => {
    const text = privacyPolicyPlainText()
    expect(text).not.toMatch(/TLS|AES-256/)
    expect(text).toMatch(/אנו נוקטים את כל האמצעים המקובלים והסבירים/)
    expect(text).toMatch(/אין אמצעי אבטחה המבטיח הגנה מוחלטת/)
  })

  it('uses short hyphens instead of em dashes', () => {
    expect(privacyPolicyPlainText()).not.toMatch(/—/)
    expect(PRIVACY_POLICY.productLine).toContain(' - ')
  })

  it('cites Israeli privacy law and a contact path', () => {
    const text = privacyPolicyPlainText()
    expect(text).toMatch(/חוק הגנת הפרטיות/)
    expect(PRIVACY_POLICY.contact.email).toBe('omriland@gmail.com')
    expect(PRIVACY_POLICY.contact.address).toMatch(/כפר סבא/)
  })
})
