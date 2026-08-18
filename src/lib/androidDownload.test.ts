import { describe, expect, it } from 'vitest'
import {
  ANDROID_DOWNLOAD_PATH,
  ANDROID_FOOTER_LINK,
  isAndroidDownloadPath,
  isAndroidMobile,
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
