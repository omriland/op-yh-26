/** iOS Ad Hoc OTA install helpers for yahpz.com */

export const IOS_DOWNLOAD_PATH = '/ios'
export const IOS_VERSION_PATH = '/ios/version.json'

export const IOS_FOOTER_LINK = {
  label: 'הורדת אפליקציית אייפון',
  href: IOS_DOWNLOAD_PATH,
} as const

export type IosVersionManifest = {
  minBuild: number
  latestBuild?: number
  latestVersionName?: string
  manifestUrl: string
  messageHe?: string
}

/** True for iPhone / iPod. iPad is out of scope (TARGETED_DEVICE_FAMILY "1"). */
export function isIosDevice(userAgent: string): boolean {
  const ua = userAgent.trim()
  if (!ua) return false
  return /iPhone|iPod/i.test(ua)
}

/**
 * True only for real mobile Safari. Chrome (CriOS), Firefox (FxiOS), Edge
 * (EdgiOS), Opera and bare in-app WKWebViews all drop `itms-services://`
 * links on the floor with no error, so the page must warn instead.
 */
export function isIosSafari(userAgent: string): boolean {
  if (!isIosDevice(userAgent)) return false
  if (/CriOS|FxiOS|EdgiOS|OPiOS|OPT\//i.test(userAgent)) return false
  return /Safari/i.test(userAgent)
}

export function isIosDownloadPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/'
  return path === IOS_DOWNLOAD_PATH
}

/** Build the OTA install URL, but only for an https yahpz.com .plist. */
export function itmsInstallHref(manifestUrl: string): string | null {
  const raw = manifestUrl?.trim()
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:') return null
    if (url.hostname !== 'yahpz.com') return null
    if (!url.pathname.endsWith('.plist')) return null
    return `itms-services://?action=download-manifest&url=${encodeURIComponent(url.toString())}`
  } catch {
    return null
  }
}

export async function fetchIosInstallHref(
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const res = await fetchImpl(`${IOS_VERSION_PATH}?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return null
    const manifest = (await res.json()) as IosVersionManifest
    return itmsInstallHref(manifest.manifestUrl)
  } catch {
    return null
  }
}
