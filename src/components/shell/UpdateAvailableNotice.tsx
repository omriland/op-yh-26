import { Info, X } from 'lucide-react'
import { useAppUpdateCheck } from '../../lib/useAppUpdateCheck'
import { Button } from '../ui/Button'

export function UpdateAvailableNotice() {
  const { available, dismiss, refresh } = useAppUpdateCheck(true)

  if (!available) return null

  return (
    <div className="update-notice-stack" data-theme="command">
      <div className="toast toast--info" role="status">
        <Info className="toast__icon" size={20} strokeWidth={1.75} aria-hidden="true" />
        <div className="toast__body">
          <p className="toast__message">יצאה גרסה חדשה. רעננו כדי לעדכן.</p>
          <Button type="button" variant="ghost" onClick={refresh}>
            רענון
          </Button>
        </div>
        <button type="button" className="toast__close" aria-label="סגירה" onClick={dismiss}>
          <X size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
