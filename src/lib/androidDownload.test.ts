import { describe, expect, it, vi } from 'vitest'
import {
  ANDROID_DOWNLOAD_PATH,
  ANDROID_FOOTER_LINK,
  apkHrefFromManifest,
  fetchAndroidApkHref,
  isAndroidDownloadPath,
  isAndroidMobile,
  supportsInAppUpdate,
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

  it('still resolves when the manifest carries OTA fields', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        minVersionCode: 25,
        latestVersionCode: 25,
        apkUrl: 'https://yahpz.com/android/yahpaz-0.3.14.apk',
        apkSha256: 'a'.repeat(64),
        apkSizeBytes: 18_432_000,
      }),
    )
    await expect(fetchAndroidApkHref(fetchImpl as unknown as typeof fetch)).resolves.toBe(
      '/android/yahpaz-0.3.14.apk',
    )
  })
})

describe('supportsInAppUpdate', () => {
  it('requires a 64 character hex digest', () => {
    expect(supportsInAppUpdate({ apkSha256: 'A'.repeat(64) })).toBe(true)
    expect(supportsInAppUpdate({ apkSha256: `  ${'f'.repeat(64)}  ` })).toBe(true)
  })

  it('rejects missing or malformed digests', () => {
    expect(supportsInAppUpdate({})).toBe(false)
    expect(supportsInAppUpdate({ apkSha256: '' })).toBe(false)
    expect(supportsInAppUpdate({ apkSha256: 'abc' })).toBe(false)
    expect(supportsInAppUpdate({ apkSha256: 'z'.repeat(64) })).toBe(false)
  })
})
