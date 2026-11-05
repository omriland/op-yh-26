import { describe, expect, it } from 'vitest'
import { SUPPORT_WHATSAPP_HREF } from './supportWhatsapp'
import {
  clearPersonalVehiclePromptDismissed,
  needsPersonalVehiclePrompt,
  personalVehicleWhatsAppHref,
  personalVehicleWhatsAppMessage,
  readPersonalVehiclePromptDismissed,
  writePersonalVehiclePromptDismissed,
} from './personalVehiclePrompt'

describe('needsPersonalVehiclePrompt', () => {
  it('asks only מתנדב פעיל and חניכה ברכב פרטי who have no active vehicle', () => {
    expect(needsPersonalVehiclePrompt('active_volunteer', 0)).toBe(true)
    expect(needsPersonalVehiclePrompt('personal_vehicle_training', 0)).toBe(true)
    expect(needsPersonalVehiclePrompt('active_volunteer', 1)).toBe(false)
    expect(needsPersonalVehiclePrompt('administration', 0)).toBe(false)
    expect(needsPersonalVehiclePrompt('shifts_only', 0)).toBe(false)
    expect(needsPersonalVehiclePrompt('phone_training', 0)).toBe(false)
    expect(needsPersonalVehiclePrompt('basic_training', 0)).toBe(false)
    expect(needsPersonalVehiclePrompt(null, 0)).toBe(false)
  })
})

describe('personalVehicleWhatsAppHref', () => {
  it('opens the support thread with the typed number and nothing else', () => {
    const href = personalVehicleWhatsAppHref(' 12-345-67 ')
    expect(personalVehicleWhatsAppMessage('12-345-67')).toBe(
      'היי, אבקש להוסיף לפרופיל שלי את הרכב שלי מספר: 12-345-67',
    )
    expect(href).toBe(
      `${SUPPORT_WHATSAPP_HREF}?text=${encodeURIComponent(
        'היי, אבקש להוסיף לפרופיל שלי את הרכב שלי מספר: 12-345-67',
      )}`,
    )
    expect(personalVehicleWhatsAppHref('   ')).toBeNull()
  })
})

describe('personal vehicle prompt session', () => {
  it('dismisses for this session and clears on sign-out', () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value)
      },
      removeItem: (key: string) => {
        store.delete(key)
      },
    }
    expect(readPersonalVehiclePromptDismissed(storage)).toBe(false)
    writePersonalVehiclePromptDismissed(storage)
    expect(readPersonalVehiclePromptDismissed(storage)).toBe(true)
    clearPersonalVehiclePromptDismissed(storage)
    expect(readPersonalVehiclePromptDismissed(storage)).toBe(false)
  })
})
