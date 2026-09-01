import { describe, expect, it } from 'vitest'
import { androidInstallHoverTip, canShowAndroidInstallMark } from './androidInstall'

describe('canShowAndroidInstallMark', () => {
  it('shows only for super_admin, not impersonating, with a stamp', () => {
    expect(
      canShowAndroidInstallMark({
        roles: ['admin', 'super_admin'],
        impersonating: false,
        lastAndroidSeenAt: '2026-09-01T10:00:00Z',
      }),
    ).toBe(true)
  })

  it('hides for regular admin', () => {
    expect(
      canShowAndroidInstallMark({
        roles: ['admin'],
        impersonating: false,
        lastAndroidSeenAt: '2026-09-01T10:00:00Z',
      }),
    ).toBe(false)
  })

  it('hides while impersonating', () => {
    expect(
      canShowAndroidInstallMark({
        roles: ['admin', 'super_admin'],
        impersonating: true,
        lastAndroidSeenAt: '2026-09-01T10:00:00Z',
      }),
    ).toBe(false)
  })

  it('hides when never opened Android', () => {
    expect(
      canShowAndroidInstallMark({
        roles: ['admin', 'super_admin'],
        impersonating: false,
        lastAndroidSeenAt: null,
      }),
    ).toBe(false)
  })
})

describe('androidInstallHoverTip', () => {
  it('appends עדכני when codes match', () => {
    expect(
      androidInstallHoverTip({
        versionName: '0.3.6',
        versionCode: 17,
        latestVersionCode: 17,
      }),
    ).toBe('0.3.6 · עדכני')
  })

  it('shows only the name when older', () => {
    expect(
      androidInstallHoverTip({
        versionName: '0.3.5',
        versionCode: 16,
        latestVersionCode: 17,
      }),
    ).toBe('0.3.5')
  })

  it('shows only the name when latestVersionCode is unknown', () => {
    expect(
      androidInstallHoverTip({
        versionName: '0.3.6',
        versionCode: 17,
        latestVersionCode: null,
      }),
    ).toBe('0.3.6')
  })

  it('falls back to version code when name is missing', () => {
    expect(
      androidInstallHoverTip({
        versionName: null,
        versionCode: 17,
        latestVersionCode: 16,
      }),
    ).toBe('17')
  })
})
