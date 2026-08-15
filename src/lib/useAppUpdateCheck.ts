import { useCallback, useEffect, useState } from 'react'
import {
  PREVIEW_UPDATE_VERSION_ID,
  UPDATE_POLL_MS,
  currentAppVersion,
  fetchRemoteVersionId,
  readDismissedVersion,
  shouldForceUpdatePreview,
  shouldShowUpdateNotice,
  writeDismissedVersion,
} from './appVersion'

export function useAppUpdateCheck(enabled: boolean) {
  const [remoteId, setRemoteId] = useState<string | null>(null)
  const [available, setAvailable] = useState(false)

  useEffect(() => {
    if (!enabled) {
      setAvailable(false)
      setRemoteId(null)
      return
    }

    let active = true

    async function run() {
      const remote = shouldForceUpdatePreview(window.location.search, import.meta.env.DEV)
        ? PREVIEW_UPDATE_VERSION_ID
        : await fetchRemoteVersionId()
      if (!active) return
      setRemoteId(remote)
      setAvailable(shouldShowUpdateNotice(currentAppVersion(), remote, readDismissedVersion()))
    }

    void run()
    const timer = window.setInterval(() => void run(), UPDATE_POLL_MS)
    const onVis = () => {
      if (document.visibilityState === 'visible') void run()
    }
    document.addEventListener('visibilitychange', onVis)

    return () => {
      active = false
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [enabled])

  const dismiss = useCallback(() => {
    if (remoteId) writeDismissedVersion(remoteId)
    setAvailable(false)
  }, [remoteId])

  const refresh = useCallback(() => {
    window.location.reload()
  }, [])

  return { available, dismiss, refresh }
}
