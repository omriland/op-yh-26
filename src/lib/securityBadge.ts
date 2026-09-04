/** English brand mark — explicit exception to Hebrew-only UI (see design spec). */
export const SNYK_SECURITY_BADGE = {
  href: 'https://snyk.io',
  label: 'Protected and monitored by Snyk and Cloudflare',
} as const

export const CLOUDFLARE_SECURITY_BADGE = {
  href: 'https://www.cloudflare.com',
  logoSrc: '/cloudflare-mark.svg',
} as const

/** Hide on immersive event/shift form, fill, and detail surfaces. */
export function shouldShowSecurityBadge(immersiveSurface: boolean): boolean {
  return !immersiveSurface
}
