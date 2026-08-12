import type { OtpPurpose } from './phoneOtp'

export function otpGateLede(input: {
  purpose: OtpPurpose
  maskedPhone: string | null
  sentOnce: boolean
}): {
  securityNote: string | null
  deliveryNote: string
  /** Full fallback line when no masked phone is available. */
  fallbackLine: string | null
  /** Hebrew prefix before the LTR phone span. */
  phonePrefix: string | null
  maskedPhone: string | null
} {
  const securityNote =
    input.purpose === 'users_page'
      ? 'מטעמי אבטחה נדרש אימות ב-SMS לפני גישה לעמוד זה.'
      : null
  const deliveryNote = 'ההודעה עשויה להגיע תוך עד 90 שניות.'

  if (input.maskedPhone) {
    return {
      securityNote,
      deliveryNote,
      fallbackLine: null,
      phonePrefix: 'נשלח קוד ל־',
      maskedPhone: input.maskedPhone,
    }
  }

  return {
    securityNote,
    deliveryNote,
    fallbackLine: input.sentOnce ? 'נשלח קוד לנייד שלכם' : 'שולחים קוד לנייד שלכם…',
    phonePrefix: null,
    maskedPhone: null,
  }
}
