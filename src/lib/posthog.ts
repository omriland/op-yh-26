import posthog from 'posthog-js'
import { readImpersonationStash } from './impersonationStash'

export { posthog }

export const POSTHOG_TOKEN = import.meta.env.VITE_POSTHOG_PROJECT_TOKEN as string | undefined
export const POSTHOG_HOST =
  (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || 'https://us.i.posthog.com'

export const posthogOptions = {
  api_host: POSTHOG_HOST,
  defaults: '2026-05-30' as const,
  person_profiles: 'identified_only' as const,
  // SPA has no real routes — we emit virtual $pageview paths instead.
  capture_pageview: false,
}

function ready() {
  return Boolean(POSTHOG_TOKEN)
}

export function identifyPosthogUser(input: {
  userId: string
  email?: string | null
  name?: string | null
  callsign?: string | null
  roles: string[]
}) {
  if (!ready()) return
  const stash = readImpersonationStash()
  if (stash) {
    posthog.identify(stash.actorUserId, {
      impersonating: true,
      impersonated_user_id: stash.targetUserId,
    })
    return
  }
  posthog.identify(input.userId, {
    email: input.email ?? undefined,
    name: input.name ?? undefined,
    callsign: input.callsign ?? undefined,
    roles: input.roles,
    impersonating: false,
  })
}

export function resetPosthogUser() {
  if (!ready()) return
  posthog.reset()
}

export function captureEvent(event: string, properties?: Record<string, unknown>) {
  if (!ready()) return
  posthog.capture(event, properties)
}

export function captureAppPageview(path: string) {
  if (!ready()) return
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  posthog.capture('$pageview', {
    $current_url: `${origin}${path}`,
    path,
  })
}
