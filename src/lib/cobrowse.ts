import { supabase } from './supabase'

/** Cobrowse.io support takeover: run rules, identity, and the consent store the UI reads. */

export const COBROWSE_LICENSE_KEY = import.meta.env.VITE_COBROWSE_LICENSE_KEY as
  | string
  | undefined

/**
 * Never leaves the device. The admin already sees unit data via impersonation;
 * this hides what they can't: secrets, plus fields tagged `data-cobrowse-redact`.
 */
export const COBROWSE_REDACTED_VIEWS = [
  'input[type="password"]',
  'input[autocomplete="one-time-code"]',
  '[data-cobrowse-redact]',
]

export function shouldRunCobrowse(input: {
  licenseKey: string | undefined
  /** Signed in, password-setup and phone OTP gates passed. */
  signedIn: boolean
  impersonating: boolean
}): boolean {
  if (!input.licenseKey?.trim()) return false
  if (!input.signedIn) return false
  if (input.impersonating) return false
  return true
}

/** What the agent dashboard can search by. No email, no phone. */
export function cobrowseCustomData(profile: {
  id: string
  full_name?: string | null
  callsign?: string | null
}): Record<string, string> {
  const data: Record<string, string> = { user_id: profile.id }
  if (profile.full_name) data.user_name = profile.full_name
  if (profile.callsign) data.callsign = profile.callsign
  return data
}

/** Agent dashboard link that connects to this user's device; they still have to approve. */
export function cobrowseConnectUrl(userId: string): string {
  return `https://cobrowse.io/connect?${new URLSearchParams({ filter_user_id: userId })}`
}

export function cobrowseAgentName(agent: Record<string, unknown> | false | undefined): string {
  return agent && typeof agent.name === 'string' ? agent.name.trim() : ''
}

/** "התמיכה (עמרי)" — gender-neutral subject for the dialog and bar copy. */
export function cobrowseSupportLabel(agentName: string): string {
  return agentName ? `התמיכה (${agentName})` : 'התמיכה'
}

export type CobrowseConsentKind = 'session' | 'control'

export type CobrowseState = {
  pending: { kind: CobrowseConsentKind; agentName: string } | null
  session: { active: boolean; remoteControl: boolean; agentName: string } | null
}

let state: CobrowseState = { pending: null, session: null }
let resolvePending: ((approved: boolean) => void) | null = null
const listeners = new Set<() => void>()

function setState(next: CobrowseState) {
  state = next
  for (const listener of listeners) listener()
}

export function getCobrowseState(): CobrowseState {
  return state
}

export function subscribeCobrowse(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Opens the Yahpaz consent dialog; resolves when the user answers. */
export function requestCobrowseConsent(
  kind: CobrowseConsentKind,
  agentName: string,
): Promise<boolean> {
  resolvePending?.(false)
  return new Promise((resolve) => {
    resolvePending = resolve
    setState({ ...state, pending: { kind, agentName } })
  })
}

export function answerCobrowseConsent(approved: boolean) {
  const resolve = resolvePending
  if (!resolve) return
  resolvePending = null
  setState({ ...state, pending: null })
  resolve(approved)
}

export function setCobrowseSession(session: CobrowseState['session']) {
  setState({ ...state, session })
}

/** Declines anything pending and clears the banner (SDK stopped / signed out). */
export function resetCobrowseState() {
  const resolve = resolvePending
  resolvePending = null
  setState({ pending: null, session: null })
  resolve?.(false)
}

export type CobrowseAuditAction =
  | 'requested'
  | 'approved'
  | 'declined'
  | 'control_approved'
  | 'control_declined'
  | 'ended'

/** Best effort — a failed insert never blocks the session or the user's answer. */
export function logCobrowseAudit(userId: string, action: CobrowseAuditAction, agentName: string) {
  void supabase
    .from('cobrowse_audit')
    .insert({ user_id: userId, action, agent_name: agentName })
    .then(({ error }) => {
      if (error) console.error('cobrowse_audit', error.message)
    })
}
