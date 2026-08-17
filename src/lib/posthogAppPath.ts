export type AnalyticsPathInput = {
  loading?: boolean
  signedIn: boolean
  passwordSetup?: boolean
  tokenFill?: 'idle' | 'checking' | 'ready' | 'blocked'
  tokenEventId?: string
  tracking?: boolean
  otp?: 'idle' | 'checking' | 'required' | 'ok'
  legalPage?: 'privacy' | null
  view: string
  eventKind?: 'list' | 'detail' | 'form' | 'fill'
  eventId?: string
  shiftKind?: 'list' | 'detail' | 'form'
  shiftId?: string
}

/** Virtual path for analytics. Cockpit is also a real URL (`/cockpit`, `/cockpit/:id`). */
export function appAnalyticsPath(input: AnalyticsPathInput): string | null {
  if (input.tracking) return '/track'
  if (input.loading || input.tokenFill === 'checking') return null
  if (input.legalPage === 'privacy') return '/privacy'
  if (input.passwordSetup) return '/login/set-password'
  if (!input.signedIn && input.tokenFill === 'ready') {
    return input.tokenEventId ? `/fill/${input.tokenEventId}` : '/fill'
  }
  if (!input.signedIn && input.tokenFill === 'blocked') return '/login/fill-link'
  if (!input.signedIn) return '/login'
  if (input.otp === 'required') return '/login/otp'
  if (input.otp === 'checking' || input.otp === 'idle') return null

  if (input.view === 'events' || input.view === 'mine' || input.view === 'reports') {
    const root = input.view === 'mine' ? '/mine' : input.view === 'reports' ? '/reports' : '/events'
    if (input.eventKind === 'form') {
      return input.eventId ? `${root}/${input.eventId}/edit` : `${root}/new`
    }
    if (input.eventKind === 'fill' && input.eventId) return `${root}/${input.eventId}/fill`
    if (input.eventKind === 'detail' && input.eventId) return `${root}/${input.eventId}`
    return root
  }

  if (input.view === 'shifts' || input.view === 'my_shifts') {
    const root = input.view === 'my_shifts' ? '/my-shifts' : '/shifts'
    if (input.shiftKind === 'form') {
      return input.shiftId ? `${root}/${input.shiftId}/edit` : `${root}/new`
    }
    if (input.shiftKind === 'detail' && input.shiftId) return `${root}/${input.shiftId}`
    return root
  }

  if (input.view === 'cockpit') {
    return input.eventId ? `/cockpit/${input.eventId}` : '/cockpit'
  }

  if (input.view === 'contacts') return '/contacts'
  if (input.view === 'lists') return '/lists'
  if (input.view === 'fuel_quarter') return '/fuel-quarter'
  if (input.view === 'profile') return '/profile'
  return `/${input.view}`
}
