import { describe, expect, it } from 'vitest'
import {
  SUPPORT_FEEDBACK_MENU_LABEL,
  SUPPORT_WHATSAPP_DISPLAY,
  SUPPORT_WHATSAPP_HREF,
  SUPPORT_WHATSAPP_MENU_LABEL,
} from './supportWhatsapp'

describe('support WhatsApp', () => {
  it('publishes the Israeli number and the wa.me link', () => {
    expect(SUPPORT_WHATSAPP_DISPLAY).toBe('054-865-4223')
    expect(SUPPORT_WHATSAPP_HREF).toBe('https://wa.me/972548654223')
    expect(SUPPORT_WHATSAPP_MENU_LABEL).toBe('לתמיכה ישירה בוואטסאפ')
    expect(SUPPORT_FEEDBACK_MENU_LABEL).toBe('לשליחת פידבק או דיווח על תקלה')
  })
})
