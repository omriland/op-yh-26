import { useEffect, useMemo, useState } from 'react'
import {
  fetchImpersonationCandidates,
  startImpersonation,
  type ImpersonationCandidate,
} from '../../lib/impersonation'
import { isImpersonating } from '../../lib/impersonationStash'
import { monoClass } from '../../lib/format'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { TextField } from '../ui/TextField'
import { useToast } from '../ui/Toast'
import { fieldsMatchQuery } from '../../lib/searchQuery'

type ImpersonationPickerDialogProps = {
  open: boolean
  actorUserId: string
  onClose: () => void
  onStarted: () => void
  /** When set, skip search and confirm this user only. */
  presetTargetId?: string | null
}

export function ImpersonationPickerDialog({
  open,
  actorUserId,
  onClose,
  onStarted,
  presetTargetId = null,
}: ImpersonationPickerDialogProps) {
  const { show } = useToast()
  const [candidates, setCandidates] = useState<ImpersonationCandidate[] | null>(null)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(presetTargetId)
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let active = true
    setCandidates(null)
    setLoadError(null)
    setQuery('')
    setSelectedId(presetTargetId)
    fetchImpersonationCandidates(actorUserId)
      .then((rows) => {
        if (active) setCandidates(rows)
      })
      .catch(() => {
        if (active) setLoadError('טעינת המשתמשים נכשלה.')
      })
    return () => {
      active = false
    }
  }, [open, actorUserId, presetTargetId])

  const filtered = useMemo(() => {
    if (!candidates) return []
    const base = presetTargetId
      ? candidates.filter((row) => row.id === presetTargetId)
      : candidates
    const q = query.trim()
    if (!q || presetTargetId) return base
    return base.filter((row) => fieldsMatchQuery([row.full_name, row.callsign, row.email], q))
  }, [candidates, query, presetTargetId])

  const selected = filtered.find((row) => row.id === selectedId) ??
    candidates?.find((row) => row.id === selectedId) ??
    null

  async function onConfirm() {
    if (!selected || isImpersonating()) return
    setBusy(true)
    const result = await startImpersonation(selected.id)
    setBusy(false)
    if (result.error) {
      show(result.error, 'alert')
      return
    }
    onClose()
    onStarted()
  }

  return (
    <Dialog
      open={open}
      title="צפייה כמשתמש"
      onClose={() => !busy && onClose()}
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            ביטול
          </Button>
          <Button
            loading={busy}
            disabled={!selected}
            onClick={() => void onConfirm()}
          >
            {selected ? `המשך כ־${selected.full_name}` : 'המשך'}
          </Button>
        </>
      }
    >
      <div className="stack-4">
        <p className="t-caption text-muted">
          תראו את המערכת בדיוק כמו המשתמש שנבחר — כולל שמירות. לחצו «חזרה לחשבון שלי» כדי
          לשוב.
        </p>
        {!presetTargetId ? (
          <TextField
            label="חיפוש"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="שם, או״ק או דוא״ל"
          />
        ) : null}
        {loadError ? (
          <p className="t-body text-alert" role="alert">
            {loadError}
          </p>
        ) : null}
        {candidates === null && !loadError ? (
          <p className="t-caption text-muted">טוען…</p>
        ) : null}
        {candidates && filtered.length === 0 ? (
          <p className="t-caption text-muted">לא נמצאו משתמשים תואמים.</p>
        ) : null}
        {filtered.length > 0 ? (
          <ul className="impersonation-picker__list">
            {filtered.map((row) => {
              const checked = row.id === selectedId
              return (
                <li key={row.id}>
                  <label className={['impersonation-picker__row', checked ? 'is-selected' : ''].join(' ')}>
                    <input
                      type="radio"
                      name="impersonation-target"
                      checked={checked}
                      onChange={() => setSelectedId(row.id)}
                    />
                    <span>
                      <span className="t-body-strong">{row.full_name}</span>
                      <span className="t-caption text-muted">
                        {' '}
                        או״ק <span className={monoClass(row.callsign)}>{row.callsign}</span>
                        {' · '}
                        <span className="ltr">{row.email}</span>
                      </span>
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        ) : null}
      </div>
    </Dialog>
  )
}
