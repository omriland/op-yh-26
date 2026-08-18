/** Android sideload download helpers for yahpz.com */

export const ANDROID_DOWNLOAD_PATH = '/android'
export const ANDROID_VERSION_PATH = '/android/version.json'

export const ANDROID_FOOTER_LINK = {
  label: 'הורדת אפליקציית אנדרואיד',
  href: ANDROID_DOWNLOAD_PATH,
} as const

export type AndroidVersionManifest = {
  minVersionCode: number
  latestVersionCode?: number
  latestVersionName?: string
  apkUrl: string
  messageHe?: string
}

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

/** Prefer a same-origin path when the manifest points at yahpz.com. */
export function apkHrefFromManifest(manifest: Pick<AndroidVersionManifest, 'apkUrl'>): string | null {
  const raw = manifest.apkUrl?.trim()
  if (!raw) return null
  try {
    const url = new URL(raw, 'https://yahpz.com')
    if (!url.pathname.startsWith('/android/') || !url.pathname.endsWith('.apk')) {
      return null
    }
    return url.pathname
  } catch {
    return null
  }
}

export async function fetchAndroidApkHref(
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const res = await fetchImpl(`${ANDROID_VERSION_PATH}?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return null
    const manifest = (await res.json()) as AndroidVersionManifest
    return apkHrefFromManifest(manifest)
  } catch {
    return null
  }
}
