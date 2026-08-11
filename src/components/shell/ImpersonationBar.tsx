import { useEffect, useState } from 'react'
import { stopImpersonation } from '../../lib/impersonation'
import {
  clearImpersonationStash,
  IMPERSONATION_CHANGE_EVENT,
  readImpersonationStash,
  type ImpersonationStash,
} from '../../lib/impersonationStash'
import { monoClass } from '../../lib/format'
import { Button } from '../ui/Button'
import { useToast } from '../ui/Toast'

type ImpersonationBarProps = {
  onRestored: () => void
}

export function ImpersonationBar({ onRestored }: ImpersonationBarProps) {
  const { show } = useToast()
  const [stash, setStash] = useState<ImpersonationStash | null>(() => readImpersonationStash())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const sync = () => setStash(readImpersonationStash())
    window.addEventListener(IMPERSONATION_CHANGE_EVENT, sync)
    return () => window.removeEventListener(IMPERSONATION_CHANGE_EVENT, sync)
  }, [])

  if (!stash) return null

  async function onStop() {
    setBusy(true)
    const result = await stopImpersonation()
    setBusy(false)
    setStash(readImpersonationStash())
    if (result.error) {
      show(result.error, 'alert')
      if (result.error.includes('התחברו')) {
        clearImpersonationStash()
        setStash(null)
      }
      return
    }
    show('חזרתם לחשבון שלכם.', 'done')
    onRestored()
  }

  return (
    <div className="impersonation-bar" role="status" data-theme="field">
      <p className="impersonation-bar__text t-caption">
        צופה כ־{stash.targetFullName} · או״ק{' '}
        <span className={monoClass(stash.targetCallsign)}>{stash.targetCallsign}</span>
      </p>
      <Button variant="secondary" loading={busy} onClick={() => void onStop()}>
        חזרה לחשבון שלי
      </Button>
    </div>
  )
}
