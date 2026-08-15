import { useEffect } from 'react'
import { isImpersonating } from './impersonationStash'
import { createPresenceHeartbeat, touchLastActive } from './userPresence'

export function usePresenceHeartbeat(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    const heartbeat = createPresenceHeartbeat({
      isImpersonating,
      isDocumentHidden: () => document.hidden,
      now: () => Date.now(),
      touch: touchLastActive,
      addEventListener: (type, listener, options) => {
        const target = type === 'visibilitychange' ? document : window
        target.addEventListener(type, listener, options)
      },
      removeEventListener: (type, listener, options) => {
        const target = type === 'visibilitychange' ? document : window
        target.removeEventListener(type, listener, options)
      },
    })
    return () => heartbeat.stop()
  }, [enabled])
}
