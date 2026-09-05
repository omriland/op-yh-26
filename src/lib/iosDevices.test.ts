import { describe, expect, it } from 'vitest'
import {
  budgetTone,
  canEnrollAnotherDevice,
  countBudgetUsed,
  iosDevicesErrorMessage,
  volunteerIosScreen,
} from './iosDevices'
import { isIosDownloadPath } from './iosDownload'

describe('isIosDownloadPath', () => {
  it('matches enrolled callback path', () => {
    expect(isIosDownloadPath('/ios/enrolled')).toBe(true)
    expect(isIosDownloadPath('/ios/enrolled/')).toBe(true)
  })
})

describe('budget', () => {
  it('counts approved and registered only', () => {
    expect(
      countBudgetUsed(['pending', 'approved', 'registered', 'rejected', 'retired']),
    ).toBe(2)
  })
  it('tones at 80 and 95', () => {
    expect(budgetTone(79)).toBe('ok')
    expect(budgetTone(80)).toBe('warn')
    expect(budgetTone(95)).toBe('critical')
  })
  it('caps enroll at 2 active', () => {
    expect(canEnrollAnotherDevice(1)).toBe(true)
    expect(canEnrollAnotherDevice(2)).toBe(false)
  })
})

describe('volunteerIosScreen', () => {
  it('prioritizes device/browser/login before status', () => {
    expect(
      volunteerIosScreen({
        iphone: false,
        safari: false,
        signedIn: false,
        devices: [],
      }),
    ).toBe('need_iphone')
    expect(
      volunteerIosScreen({
        iphone: true,
        safari: false,
        signedIn: true,
        devices: [],
      }),
    ).toBe('need_safari')
    expect(
      volunteerIosScreen({
        iphone: true,
        safari: true,
        signedIn: false,
        devices: [],
      }),
    ).toBe('need_login')
  })
  it('maps best device status', () => {
    expect(
      volunteerIosScreen({
        iphone: true,
        safari: true,
        signedIn: true,
        devices: [{ status: 'pending' }],
      }),
    ).toBe('pending')
    expect(
      volunteerIosScreen({
        iphone: true,
        safari: true,
        signedIn: true,
        devices: [{ status: 'registered' }],
      }),
    ).toBe('install')
    expect(
      volunteerIosScreen({
        iphone: true,
        safari: true,
        signedIn: true,
        devices: [],
      }),
    ).toBe('enroll')
  })
})

describe('iosDevicesErrorMessage', () => {
  it('maps known Postgres exception names', () => {
    expect(iosDevicesErrorMessage('ios_budget_full')).toBe(
      'הגעתם למכסת 100 המכשירים לשנה זו.',
    )
    expect(iosDevicesErrorMessage('ios_device_cap')).toBe(
      'ניתן לרשום עד שני מכשירים למשתמש.',
    )
  })
})
