import { describe, expect, it } from 'vitest'
import {
  MISSING_KM_ALERT_THRESHOLD,
  MISSING_KM_POPUP_DISMISS_KEY,
  canSeeMissingKmAlert,
  countEventsMissingResponderKmFromList,
  missingKmAlertMessage,
  readMissingKmPopupDismissed,
  shouldShowMissingKmAlert,
  writeMissingKmPopupDismissed,
} from './missingKmAlert'

describe('missingKmAlert', () => {
  it('requires at least two events', () => {
    expect(MISSING_KM_ALERT_THRESHOLD).toBe(2)
    expect(shouldShowMissingKmAlert(0)).toBe(false)
    expect(shouldShowMissingKmAlert(1)).toBe(false)
    expect(shouldShowMissingKmAlert(2)).toBe(true)
    expect(shouldShowMissingKmAlert(5)).toBe(true)
  })

  it('builds the Hebrew message with the count', () => {
    expect(missingKmAlertMessage(3)).toBe(
      'לתשומת ליבך! לא הזנת ק"מ ב-3 אירועים. יש לעשות זאת בהקדם',
    )
  })

  it('is for shift_lead and admin only', () => {
    expect(canSeeMissingKmAlert(['responder'])).toBe(false)
    expect(canSeeMissingKmAlert(['shift_lead'])).toBe(true)
    expect(canSeeMissingKmAlert(['admin'])).toBe(true)
    expect(canSeeMissingKmAlert(['super_admin'])).toBe(true)
    expect(canSeeMissingKmAlert(['admin', 'shift_lead'])).toBe(true)
  })

  it('counts events that have any null total_km', () => {
    expect(
      countEventsMissingResponderKmFromList([
        { responders: [{ total_km: 10 }] },
        { responders: [{ total_km: null }] },
        { responders: [{ total_km: 0 }, { total_km: null }] },
        { responders: [] },
      ]),
    ).toBe(2)
  })

  it('persists popup dismiss in sessionStorage', () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value)
      },
    }
    expect(readMissingKmPopupDismissed(storage)).toBe(false)
    writeMissingKmPopupDismissed(storage)
    expect(store.get(MISSING_KM_POPUP_DISMISS_KEY)).toBe('1')
    expect(readMissingKmPopupDismissed(storage)).toBe(true)
  })
})
