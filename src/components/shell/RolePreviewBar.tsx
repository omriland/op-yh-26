import { useEffect, useState } from 'react'
import { rolePreviewLabel } from '../../lib/rolePreview'
import {
  ROLE_PREVIEW_CHANGE_EVENT,
  clearRolePreviewStash,
  readRolePreviewStash,
  type RolePreviewStash,
} from '../../lib/rolePreviewStash'
import { Button } from '../ui/Button'
import { useToast } from '../ui/Toast'

type RolePreviewBarProps = {
  onRestored: () => void
}

export function RolePreviewBar({ onRestored }: RolePreviewBarProps) {
  const { show } = useToast()
  const [stash, setStash] = useState<RolePreviewStash | null>(() => readRolePreviewStash())

  useEffect(() => {
    const sync = () => setStash(readRolePreviewStash())
    window.addEventListener(ROLE_PREVIEW_CHANGE_EVENT, sync)
    return () => window.removeEventListener(ROLE_PREVIEW_CHANGE_EVENT, sync)
  }, [])

  if (!stash) return null

  function onStop() {
    clearRolePreviewStash()
    setStash(null)
    show('חזרתם לתפקידים שלכם.', 'done')
    onRestored()
  }

  return (
    <div className="impersonation-bar" role="status" data-theme="field">
      <p className="impersonation-bar__text t-caption">
        צופה כתפקיד {rolePreviewLabel(stash.role)}
      </p>
      <Button variant="secondary" onClick={onStop}>
        חזרה לתפקיד שלי
      </Button>
    </div>
  )
}
