import { describe, expect, it } from 'vitest'
import { otpGateLede } from './otpGateCopy'

describe('otpGateLede', () => {
  it('explains security step-up for users page and exposes phone for LTR', () => {
    const copy = otpGateLede({
      purpose: 'users_page',
      maskedPhone: '050-***-4567',
      sentOnce: true,
    })
    expect(copy.securityNote).toMatch(/אבטחה/)
    expect(copy.deliveryNote).toMatch(/90/)
    expect(copy.phonePrefix).toBe('נשלח קוד ל־')
    expect(copy.maskedPhone).toBe('050-***-4567')
    expect(copy.fallbackLine).toBeNull()
  })

  it('omits security note for login device OTP but keeps delivery wait hint', () => {
    const copy = otpGateLede({
      purpose: 'login_device',
      maskedPhone: '050-***-4567',
      sentOnce: true,
    })
    expect(copy.securityNote).toBeNull()
    expect(copy.deliveryNote).toMatch(/90/)
    expect(copy.maskedPhone).toBe('050-***-4567')
  })

  it('shows sending state when phone unknown and not yet sent', () => {
    const copy = otpGateLede({
      purpose: 'users_page',
      maskedPhone: null,
      sentOnce: false,
    })
    expect(copy.fallbackLine).toBe('שולחים קוד לנייד שלכם…')
    expect(copy.maskedPhone).toBeNull()
  })
})
