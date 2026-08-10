/**
 * Build a first-party invite URL so the email CTA stays on yahpz.com
 * (not *.supabase.co) — critical for inbox placement.
 */
export function buildBrandedInviteUrl(options: {
  redirectBase: string
  hashedToken: string
}): string {
  const url = new URL(options.redirectBase)
  url.searchParams.set('set_password', '1')
  url.searchParams.set('type', 'invite')
  url.searchParams.set('token_hash', options.hashedToken)
  return url.toString()
}
