import { describe, expect, it, vi } from 'vitest'
import {
  ANDROID_DOWNLOAD_PATH,
  ANDROID_FOOTER_LINK,
  apkHrefFromManifest,
  fetchAndroidApkHref,
  isAndroidDownloadPath,
  isAndroidMobile,
  showLoginAndroidDownload,
} from './androidDownload'

describe('isAndroidMobile', () => {
  it('detects Android Chrome phone', () => {
    expect(
      isAndroidMobile(
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      ),
    ).toBe(true)
  })

  it('detects Android tablet without Mobile token', () => {
    expect(
      isAndroidMobile(
        'Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ),
    ).toBe(true)
  })

  it('rejects iPhone and desktop', () => {
    expect(
      isAndroidMobile(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      ),
    ).toBe(false)
    expect(
      isAndroidMobile(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ),
    ).toBe(false)
    expect(
      isAndroidMobile(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ),
    ).toBe(false)
  })
})

describe('showLoginAndroidDownload', () => {
  const iphone =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
  const ipad =
    'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
  const ipadOsDesktop =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'
  const androidPhone =
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
  const androidTablet =
    'Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  const windows =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  const mac =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  const linux =
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

  it('hides on iPhone, iPad, and iPadOS desktop-mode', () => {
    expect(showLoginAndroidDownload({ userAgent: iphone, platform: 'iPhone', maxTouchPoints: 5 })).toBe(
      false,
    )
    expect(showLoginAndroidDownload({ userAgent: ipad, platform: 'iPad', maxTouchPoints: 5 })).toBe(
      false,
    )
    expect(
      showLoginAndroidDownload({
        userAgent: ipadOsDesktop,
        platform: 'MacIntel',
        maxTouchPoints: 5,
      }),
    ).toBe(false)
    expect(
      showLoginAndroidDownload({ userAgent: mac, platform: 'iPad', maxTouchPoints: 0 }),
    ).toBe(false)
  })

  it('shows on Android phones and tablets', () => {
    expect(
      showLoginAndroidDownload({ userAgent: androidPhone, platform: 'Linux armv8l', maxTouchPoints: 5 }),
    ).toBe(true)
    expect(
      showLoginAndroidDownload({ userAgent: androidTablet, platform: 'Linux armv8l', maxTouchPoints: 5 }),
    ).toBe(true)
  })

  it('shows on Windows, Mac, and Linux desktops', () => {
    expect(showLoginAndroidDownload({ userAgent: windows, platform: 'Win32', maxTouchPoints: 0 })).toBe(
      true,
    )
    expect(showLoginAndroidDownload({ userAgent: mac, platform: 'MacIntel', maxTouchPoints: 0 })).toBe(
      true,
    )
    expect(showLoginAndroidDownload({ userAgent: linux, platform: 'Linux x86_64', maxTouchPoints: 0 })).toBe(
      true,
    )
  })
})

describe('android download paths', () => {
  it('matches /android', () => {
    expect(isAndroidDownloadPath('/android')).toBe(true)
    expect(isAndroidDownloadPath('/android/')).toBe(true)
    expect(isAndroidDownloadPath('/privacy')).toBe(false)
  })

  it('exposes footer copy', () => {
    expect(ANDROID_FOOTER_LINK.href).toBe(ANDROID_DOWNLOAD_PATH)
    expect(ANDROID_FOOTER_LINK.label).toBe('הורדת אפליקציית אנדרואיד')
  })
})

describe('apkHrefFromManifest', () => {
  it('returns a same-origin path for yahpz.com versioned APKs', () => {
    expect(
      apkHrefFromManifest({
        apkUrl: 'https://yahpz.com/android/yahpaz-0.1.2.apk',
      }),
    ).toBe('/android/yahpaz-0.1.2.apk')
  })

  it('rejects empty or non-apk urls', () => {
    expect(apkHrefFromManifest({ apkUrl: '' })).toBeNull()
    expect(apkHrefFromManifest({ apkUrl: 'https://yahpz.com/android/version.json' })).toBeNull()
  })
})

describe('fetchAndroidApkHref', () => {
  it('reads apkUrl from version.json', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        minVersionCode: 3,
        apkUrl: 'https://yahpz.com/android/yahpaz-0.1.2.apk',
      }),
    )
    await expect(fetchAndroidApkHref(fetchImpl as unknown as typeof fetch)).resolves.toBe(
      '/android/yahpaz-0.1.2.apk',
    )
    expect(fetchImpl).toHaveBeenCalledOnce()
  })
})
