import { useEffect } from 'react'
import type { CobrowseIO as CobrowseSdk } from 'cobrowse-sdk-js'
import {
  COBROWSE_LICENSE_KEY,
  COBROWSE_REDACTED_VIEWS,
  cobrowseAgentName,
  cobrowseCustomData,
  logCobrowseAudit,
  requestCobrowseConsent,
  resetCobrowseState,
  setCobrowseSession,
  shouldRunCobrowse,
} from './cobrowse'

type CobrowseIdentity = {
  id: string
  full_name?: string | null
  callsign?: string | null
}

/**
 * Registers this device with Cobrowse.io while the user is signed in (gates passed,
 * not impersonating). The admin connects from the Cobrowse dashboard; every session
 * and remote-control request goes through the Yahpaz consent dialog.
 */
export function useCobrowse(input: {
  signedIn: boolean
  impersonating: boolean
  identity: CobrowseIdentity | null
}) {
  const run = shouldRunCobrowse({
    licenseKey: COBROWSE_LICENSE_KEY,
    signedIn: input.signedIn && Boolean(input.identity),
    impersonating: input.impersonating,
  })
  const userId = input.identity?.id
  const fullName = input.identity?.full_name
  const callsign = input.identity?.callsign

  useEffect(() => {
    if (!run || !userId || !COBROWSE_LICENSE_KEY) return
    const license = COBROWSE_LICENSE_KEY
    let cancelled = false
    let sdk: CobrowseSdk | null = null

    const agentName = () => cobrowseAgentName(sdk?.currentSession?.agent())

    const syncSession = () => {
      const session = sdk?.currentSession
      if (!session?.isActive()) return
      setCobrowseSession({
        active: true,
        remoteControl: session.remoteControl() === 'on',
        agentName: agentName(),
      })
    }

    const onEnded = (session: { activated: Date | null }) => {
      if (session.activated) logCobrowseAudit(userId, 'ended', agentName())
      setCobrowseSession(null)
    }

    void import('cobrowse-sdk-js').then(async ({ default: CobrowseIO }) => {
      if (cancelled) return
      sdk = CobrowseIO
      CobrowseIO.license = license
      CobrowseIO.customData = cobrowseCustomData({
        id: userId,
        full_name: fullName,
        callsign,
      })
      CobrowseIO.redactedViews = COBROWSE_REDACTED_VIEWS

      // Our dialog always asks, even if consent is switched off in the Cobrowse dashboard.
      CobrowseIO.confirmSession = async () => {
        const name = agentName()
        logCobrowseAudit(userId, 'requested', name)
        const approved = await requestCobrowseConsent('session', name)
        logCobrowseAudit(userId, approved ? 'approved' : 'declined', name)
        if (!approved) throw new Error('declined')
        return true
      }
      CobrowseIO.confirmRemoteControl = async () => {
        const name = agentName()
        const approved = await requestCobrowseConsent('control', name)
        logCobrowseAudit(userId, approved ? 'control_approved' : 'control_declined', name)
        if (!approved) throw new Error('declined')
        return true
      }
      CobrowseIO.showSessionControls = async () => syncSession()
      CobrowseIO.hideSessionControls = async () => setCobrowseSession(null)
      CobrowseIO.on('session.updated', syncSession)
      CobrowseIO.on('session.ended', onEnded)

      await CobrowseIO.start()
    })

    return () => {
      cancelled = true
      resetCobrowseState()
      if (!sdk) return
      sdk.off('session.updated', syncSession)
      sdk.off('session.ended', onEnded)
      const session = sdk.currentSession
      const stopping = sdk
      void (async () => {
        if (session && !session.isEnded()) await session.end().catch(() => undefined)
        await stopping.stop()
      })()
    }
  }, [run, userId, fullName, callsign])
}

/** Ends the active session from the banner's "סיום תמיכה" button. */
export async function endCobrowseSession() {
  const { default: CobrowseIO } = await import('cobrowse-sdk-js')
  await CobrowseIO.currentSession?.end()
}
