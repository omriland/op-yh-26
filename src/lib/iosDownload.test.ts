import { describe, expect, it, vi } from 'vitest'
import {
  IOS_DOWNLOAD_PATH,
  IOS_FOOTER_LINK,
  fetchIosInstallHref,
  isIosDevice,
  isIosDownloadPath,
  isIosSafari,
  itmsInstallHref,
} from './iosDownload'

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1'
const IPHONE_WEBVIEW =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
const IPHONE_GOOGLE_APP =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/300.0.000000000 Mobile/15E148 Safari/604.1'
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
const MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'

describe('isIosDevice', () => {
  it('detects iPhone regardless of browser', () => {
    expect(isIosDevice(IPHONE_SAFARI)).toBe(true)
    expect(isIosDevice(IPHONE_CHROME)).toBe(true)
  })

  it('rejects Android, macOS and empty strings', () => {
    expect(isIosDevice(ANDROID)).toBe(false)
    expect(isIosDevice(MAC)).toBe(false)
    expect(isIosDevice('')).toBe(false)
  })
})

describe('isIosSafari', () => {
  it('accepts real mobile Safari', () => {
    expect(isIosSafari(IPHONE_SAFARI)).toBe(true)
  })

  it('rejects Chrome on iOS, which fails itms-services silently', () => {
    expect(isIosSafari(IPHONE_CHROME)).toBe(false)
  })

  it('rejects a bare in-app WKWebView', () => {
    expect(isIosSafari(IPHONE_WEBVIEW)).toBe(false)
  })

  it('rejects desktop Safari', () => {
    expect(isIosSafari(MAC)).toBe(false)
  })

  it('rejects the Google app in-app browser, which fakes Safari without Version/', () => {
    expect(isIosSafari(IPHONE_GOOGLE_APP)).toBe(false)
  })
})

describe('ios download paths', () => {
  it('matches /ios with or without a trailing slash', () => {
    expect(isIosDownloadPath('/ios')).toBe(true)
    expect(isIosDownloadPath('/ios/')).toBe(true)
    expect(isIosDownloadPath('/android')).toBe(false)
  })

  it('exposes footer copy', () => {
    expect(IOS_FOOTER_LINK.href).toBe(IOS_DOWNLOAD_PATH)
    expect(IOS_FOOTER_LINK.label).toBe('הורדת אפליקציית אייפון')
  })
})

describe('itmsInstallHref', () => {
  it('wraps a yahpz.com manifest url', () => {
    expect(itmsInstallHref('https://yahpz.com/ios/manifest.plist')).toBe(
      'itms-services://?action=download-manifest&url=https%3A%2F%2Fyahpz.com%2Fios%2Fmanifest.plist',
    )
  })

  it('accepts www.yahpz.com manifest urls', () => {
    expect(itmsInstallHref('https://www.yahpz.com/ios/manifest.plist')).toBe(
      'itms-services://?action=download-manifest&url=https%3A%2F%2Fwww.yahpz.com%2Fios%2Fmanifest.plist',
    )
  })

  it('rejects http, foreign hosts, non-plist paths and empties', () => {
    expect(itmsInstallHref('http://yahpz.com/ios/manifest.plist')).toBeNull()
    expect(itmsInstallHref('https://evil.example/ios/manifest.plist')).toBeNull()
    expect(itmsInstallHref('https://yahpz.com/ios/Yahpaz.ipa')).toBeNull()
    expect(itmsInstallHref('')).toBeNull()
  })
})

describe('fetchIosInstallHref', () => {
  it('reads manifestUrl from version.json', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        minBuild: 5,
        latestBuild: 5,
        manifestUrl: 'https://yahpz.com/ios/manifest.plist',
      }),
    )
    await expect(fetchIosInstallHref(fetchImpl as unknown as typeof fetch)).resolves.toBe(
      'itms-services://?action=download-manifest&url=https%3A%2F%2Fyahpz.com%2Fios%2Fmanifest.plist',
    )
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('returns null when version.json is missing', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 404 }))
    await expect(
      fetchIosInstallHref(fetchImpl as unknown as typeof fetch),
    ).resolves.toBeNull()
  })
})
