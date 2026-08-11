/** English brand mark — explicit exception to Hebrew-only UI (see design spec). */
export const SNYK_SECURITY_BADGE = {
  href: 'https://snyk.io',
  label: 'Protected by Snyk',
} as const

/** Hide on immersive event/shift form, fill, and detail surfaces. */
export function shouldShowSecurityBadge(immersiveSurface: boolean): boolean {
  return !immersiveSurface
}
