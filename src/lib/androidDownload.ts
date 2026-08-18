/** Android sideload download helpers for yahpz.com */

export const ANDROID_DOWNLOAD_PATH = '/android'
export const ANDROID_APK_PATH = '/android/yahpaz.apk'
export const ANDROID_VERSION_PATH = '/android/version.json'

export const ANDROID_FOOTER_LINK = {
  label: 'הורדת אפליקציית אנדרואיד',
  href: ANDROID_DOWNLOAD_PATH,
} as const

/**
 * True for Android phones/tablets in a browser.
 * Excludes desktop OSes even if the string somehow mentions Android.
 */
export function isAndroidMobile(userAgent: string): boolean {
  const ua = userAgent.trim()
  if (!ua) return false
  if (!/Android/i.test(ua)) return false
  if (/Windows NT|Macintosh|CrOS/i.test(ua)) return false
  return true
}

export function isAndroidDownloadPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/'
  return path === ANDROID_DOWNLOAD_PATH
}
