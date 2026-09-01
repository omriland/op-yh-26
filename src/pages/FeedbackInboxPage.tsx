import { useEffect, useMemo, useState } from 'react'
import { MessageSquarePlus } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Dialog } from '../components/ui/Dialog'
import { EmptyState } from '../components/ui/EmptyState'
import { EventListSkeleton } from '../components/ui/Skeleton'
import { StampChip } from '../components/ui/StampChip'
import { useToast } from '../components/ui/Toast'
import { formatDateTime, monoClass } from '../lib/format'
import {
  FEEDBACK_KIND_LABEL,
  FEEDBACK_STATUS_STAMP,
  deleteUserFeedback,
  listUserFeedback,
  updateUserFeedbackStatus,
  type FeedbackStatus,
  type UserFeedback,
} from '../lib/userFeedback'

const FILTERS: { id: FeedbackStatus | 'all'; label: string }[] = [
  { id: 'open', label: 'פתוח' },
  { id: 'fixed', label: 'טופל' },
  { id: 'wont_do', label: 'לא יטופל' },
  { id: 'all', label: 'הכול' },
]

export function FeedbackInboxPage() {
  const { show } = useToast()
  const [filter, setFilter] = useState<FeedbackStatus | 'all'>('open')
  const [items, setItems] = useState<UserFeedback[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<UserFeedback | null>(null)

  useEffect(() => {
    let active = true
    setItems(null)
    setFailed(false)
    listUserFeedback(filter)
      .then((rows) => {
        if (active) setItems(rows)
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
    }
  }, [filter, reloadKey])

  const emptyCaption = useMemo(() => {
    if (filter === 'open') return 'אין משוב פתוח.'
    if (filter === 'all') return 'עדיין לא התקבל משוב.'
    return 'אין פריטים במצב הזה.'
  }, [filter])

  async function setStatus(item: UserFeedback, status: FeedbackStatus) {
    setBusyId(item.id)
    const result = await updateUserFeedbackStatus(item.id, status)
    setBusyId(null)
    if (!result.ok) {
      show(result.error, 'alert')
      return
    }
    show('הסטטוס עודכן.', 'done')
    setReloadKey((key) => key + 1)
  }

  async function remove(item: UserFeedback) {
    setBusyId(item.id)
    const result = await deleteUserFeedback({
      id: item.id,
      audioStoragePath: item.audio_storage_path,
    })
    setBusyId(null)
    setConfirmDelete(null)
    if (!result.ok) {
      show(result.error, 'alert')
      return
    }
    show('המשוב נמחק.', 'done')
    setReloadKey((key) => key + 1)
  }

  return (
    <div className="stack-4">
      <div className="page-head">
        <h1 className="t-title">משוב</h1>
      </div>

      <div className="chips" role="tablist" aria-label="סינון משוב">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            className="chip"
            aria-selected={filter === item.id}
            aria-pressed={filter === item.id}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {items === null && !failed ? <EventListSkeleton /> : null}

      {failed ? (
        <EmptyState
          icon={<MessageSquarePlus size={40} strokeWidth={1.75} aria-hidden="true" />}
          title="טעינת המשוב נכשלה. בדקו את החיבור ונסו שוב."
          action={
            <Button variant="secondary" onClick={() => setReloadKey((key) => key + 1)}>
              רענון
            </Button>
          }
        />
      ) : null}

      {items && items.length === 0 && !failed ? (
        <EmptyState
          icon={<MessageSquarePlus size={40} strokeWidth={1.75} aria-hidden="true" />}
          title={emptyCaption}
        />
      ) : null}

      {items && items.length > 0 ? (
        <ul className="stack-4 feedback-inbox">
          {items.map((item) => (
            <li key={item.id} className="card feedback-inbox__card">
              <div className="feedback-inbox__head">
                <p className="t-section">{FEEDBACK_KIND_LABEL[item.kind]}</p>
                <StampChip {...FEEDBACK_STATUS_STAMP[item.status]} />
              </div>
              <p className="t-body">
                {item.author_name ?? 'משתמש'}
                {item.author_callsign ? (
                  <>
                    {' '}
                    · או״ק{' '}
                    <span className={monoClass(item.author_callsign)}>{item.author_callsign}</span>
                  </>
                ) : null}
              </p>
              <p className="t-caption text-muted">
                {formatDateTime(item.created_at)}
                {item.page_path ? ` · ${item.page_path}` : ''}
              </p>
              {item.body ? <p className="t-body feedback-inbox__body">{item.body}</p> : null}
              {item.signed_url ? (
                <audio className="feedback-record__audio" controls src={item.signed_url} />
              ) : null}
              <div className="feedback-inbox__actions">
                {item.status !== 'fixed' ? (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busyId === item.id}
                    onClick={() => void setStatus(item, 'fixed')}
                  >
                    טופל
                  </Button>
                ) : null}
                {item.status !== 'wont_do' ? (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busyId === item.id}
                    onClick={() => void setStatus(item, 'wont_do')}
                  >
                    לא יטופל
                  </Button>
                ) : null}
                {item.status !== 'open' ? (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busyId === item.id}
                    onClick={() => void setStatus(item, 'open')}
                  >
                    פתיחה מחדש
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="destructive"
                  disabled={busyId === item.id}
                  onClick={() => setConfirmDelete(item)}
                >
                  מחיקה
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <Dialog
        open={Boolean(confirmDelete)}
        title="למחוק את המשוב?"
        onClose={() => setConfirmDelete(null)}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setConfirmDelete(null)}>
              ביטול
            </Button>
            <Button
              type="button"
              variant="destructive"
              loading={Boolean(confirmDelete && busyId === confirmDelete.id)}
              loadingLabel="מוחק…"
              onClick={() => confirmDelete && void remove(confirmDelete)}
            >
              מחיקה
            </Button>
          </>
        }
      >
        <p className="t-body">הפעולה אינה ניתנת לביטול.</p>
      </Dialog>
    </div>
  )
}
