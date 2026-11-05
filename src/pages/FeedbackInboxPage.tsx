import { useEffect, useMemo, useState } from 'react'
import { MessageSquarePlus, Plus } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { AlertDialog } from '../components/ui/AlertDialog'
import { Dialog } from '../components/ui/Dialog'
import { EmptyState } from '../components/ui/EmptyState'
import { SelectField } from '../components/ui/SelectField'
import { EventListSkeleton } from '../components/ui/Skeleton'
import { StampChip } from '../components/ui/StampChip'
import { TextAreaField } from '../components/ui/TextAreaField'
import { TextField } from '../components/ui/TextField'
import { useToast } from '../components/ui/Toast'
import { formatDateTime, monoClass } from '../lib/format'
import * as userFeedbackApi from '../lib/userFeedback'
import {
  FEEDBACK_ASSIGNEE_ALL,
  FEEDBACK_ASSIGNEE_NONE,
  FEEDBACK_BODY_MAX,
  FEEDBACK_STATUS_STAMP,
  FEEDBACK_TASK_TITLE_MAX,
  feedbackHeading,
  feedbackRowsNeedingTranscript,
  feedbackTaskError,
  feedbackTreatedToast,
  filterFeedbackByAssignee,
  isFeedbackTask,
  type FeedbackAssignee,
  type FeedbackStatus,
  type UserFeedback,
} from '../lib/userFeedback'

/** The data boundary of this page. The dev harness passes a stub; the app uses the real module. */
export type FeedbackInboxApi = Pick<
  typeof userFeedbackApi,
  | 'listUserFeedback'
  | 'transcribeUserFeedback'
  | 'updateUserFeedbackStatus'
  | 'deleteUserFeedback'
  | 'listFeedbackAssignees'
  | 'setUserFeedbackAssignee'
  | 'createFeedbackTask'
>

const FILTERS: { id: FeedbackStatus | 'all'; label: string }[] = [
  { id: 'open', label: 'פתוח' },
  { id: 'in_progress', label: 'בטיפול' },
  { id: 'fixed', label: 'טופל' },
  { id: 'wont_do', label: 'לא יטופל' },
  { id: 'all', label: 'הכול' },
]

type TaskDraft = { title: string; body: string; assigneeId: string }

const EMPTY_DRAFT: TaskDraft = { title: '', body: '', assigneeId: FEEDBACK_ASSIGNEE_NONE }

export function FeedbackInboxPage({ api = userFeedbackApi }: { api?: FeedbackInboxApi } = {}) {
  const { show } = useToast()
  const [filter, setFilter] = useState<FeedbackStatus | 'all'>('open')
  const [assigneeFilter, setAssigneeFilter] = useState<string>(FEEDBACK_ASSIGNEE_ALL)
  const [assignees, setAssignees] = useState<FeedbackAssignee[]>([])
  const [items, setItems] = useState<UserFeedback[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<UserFeedback | null>(null)
  const [transcriptErrors, setTranscriptErrors] = useState<Record<string, string>>({})
  const [draft, setDraft] = useState<TaskDraft | null>(null)
  const [draftError, setDraftError] = useState<string | undefined>()
  const [savingDraft, setSavingDraft] = useState(false)

  useEffect(() => {
    let active = true
    api
      .listFeedbackAssignees()
      .then((rows) => {
        if (active) setAssignees(rows)
      })
      .catch(() => {
        if (active) setAssignees([])
      })
    return () => {
      active = false
    }
  }, [api])

  useEffect(() => {
    let active = true
    setItems(null)
    setFailed(false)
    setTranscriptErrors({})
    api
      .listUserFeedback(filter)
      .then((rows) => {
        if (!active) return
        setItems(rows)
        for (const id of feedbackRowsNeedingTranscript(rows)) {
          void api.transcribeUserFeedback(id).then((result) => {
            if (!active) return
            if (result.ok) {
              setItems((current) =>
                current?.map((item) =>
                  item.id === id ? { ...item, transcript: result.transcript } : item,
                ) ?? null,
              )
              return
            }
            setTranscriptErrors((current) => ({ ...current, [id]: result.error }))
          })
        }
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
    }
  }, [api, filter, reloadKey])

  const visibleItems = useMemo(
    () => (items ? filterFeedbackByAssignee(items, assigneeFilter) : null),
    [items, assigneeFilter],
  )

  const assigneeOptions = useMemo(
    () => [
      { value: FEEDBACK_ASSIGNEE_NONE, label: 'לא משויך' },
      ...assignees.map((person) => ({ value: person.id, label: person.full_name })),
    ],
    [assignees],
  )

  const emptyCaption = useMemo(() => {
    if (assigneeFilter !== FEEDBACK_ASSIGNEE_ALL) return 'אין פריטים שתואמים לסינון.'
    if (filter === 'open') return 'אין משוב פתוח.'
    if (filter === 'all') return 'עדיין לא התקבל משוב.'
    return 'אין פריטים במצב הזה.'
  }, [assigneeFilter, filter])

  async function setStatus(item: UserFeedback, status: FeedbackStatus) {
    setBusyId(item.id)
    const task = isFeedbackTask(item)
    const result = await api.updateUserFeedbackStatus(item.id, status, { notifyAuthor: !task })
    setBusyId(null)
    if (!result.ok) {
      show(result.error, 'alert')
      return
    }
    const toast =
      status === 'fixed' && !task
        ? feedbackTreatedToast(result.sms)
        : { message: 'הסטטוס עודכן.', tone: 'done' as const }
    show(toast.message, toast.tone)
    setReloadKey((key) => key + 1)
  }

  async function assign(item: UserFeedback, value: string) {
    const assigneeId = value === FEEDBACK_ASSIGNEE_NONE ? null : value
    if (assigneeId === item.assignee_id) return
    setBusyId(item.id)
    const result = await api.setUserFeedbackAssignee(item.id, assigneeId)
    setBusyId(null)
    if (!result.ok) {
      show(result.error, 'alert')
      return
    }
    setItems(
      (current) =>
        current?.map((row) => (row.id === item.id ? { ...row, assignee_id: assigneeId } : row)) ??
        null,
    )
    show('האחראי עודכן.', 'done')
  }

  async function remove(item: UserFeedback) {
    setBusyId(item.id)
    const result = await api.deleteUserFeedback({
      id: item.id,
      audioStoragePath: item.audio_storage_path,
      attachmentPaths: item.attachments.map((file) => file.path),
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

  function openDraft() {
    setDraftError(undefined)
    setDraft(EMPTY_DRAFT)
  }

  function closeDraft() {
    if (savingDraft) return
    setDraft(null)
  }

  async function submitDraft() {
    if (!draft) return
    const error = feedbackTaskError(draft)
    if (error) {
      setDraftError(error)
      return
    }
    setSavingDraft(true)
    const result = await api.createFeedbackTask({
      title: draft.title,
      body: draft.body,
      assigneeId: draft.assigneeId === FEEDBACK_ASSIGNEE_NONE ? null : draft.assigneeId,
    })
    setSavingDraft(false)
    if (!result.ok) {
      show(result.error, 'alert')
      return
    }
    setDraft(null)
    show('המשימה נוספה.', 'done')
    if (filter === 'open' || filter === 'all') setReloadKey((key) => key + 1)
    else setFilter('open')
  }

  return (
    <div className="stack-4">
      <div className="page-head">
        <h1 className="t-title">משוב</h1>
        <Button onClick={openDraft} icon={<Plus size={20} strokeWidth={1.75} aria-hidden="true" />}>
          משימה חדשה
        </Button>
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

      <div className="feedback-inbox__filter">
        <SelectField
          label="אחראי"
          value={assigneeFilter}
          options={[{ value: FEEDBACK_ASSIGNEE_ALL, label: 'כל האחראים' }, ...assigneeOptions]}
          onChange={(event) => setAssigneeFilter(event.target.value)}
        />
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

      {visibleItems && visibleItems.length === 0 && !failed ? (
        <EmptyState
          icon={<MessageSquarePlus size={40} strokeWidth={1.75} aria-hidden="true" />}
          title={emptyCaption}
        />
      ) : null}

      {visibleItems && visibleItems.length > 0 ? (
        <ul className="stack-4 feedback-inbox">
          {visibleItems.map((item) => (
            <li key={item.id} className="card feedback-inbox__card">
              <div className="feedback-inbox__head">
                <p className="t-section">{feedbackHeading(item)}</p>
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
              {item.audio_storage_path ? (
                <div className="feedback-inbox__transcript">
                  <p className="t-caption text-muted">תמלול</p>
                  {item.transcript ? (
                    <p className="t-body feedback-inbox__body">{item.transcript}</p>
                  ) : transcriptErrors[item.id] ? (
                    <p className="t-caption text-muted">{transcriptErrors[item.id]}</p>
                  ) : (
                    <p className="t-caption text-muted">מתמלל…</p>
                  )}
                </div>
              ) : null}
              {item.attachments.length > 0 ? (
                <ul className="feedback-inbox__files">
                  {item.attachments.map((file) => (
                    <li key={file.path}>
                      {file.kind === 'image' &&
                      file.signed_url &&
                      !file.mime.includes('heic') &&
                      !file.mime.includes('heif') ? (
                        <a href={file.signed_url} target="_blank" rel="noopener noreferrer">
                          <img className="feedback-inbox__thumb" src={file.signed_url} alt={file.name} />
                        </a>
                      ) : file.kind === 'video' && file.signed_url ? (
                        <video className="feedback-inbox__video" controls src={file.signed_url} />
                      ) : file.signed_url ? (
                        <a
                          className="t-body"
                          href={file.signed_url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <span dir="ltr">{file.name}</span>
                        </a>
                      ) : (
                        <p className="t-caption text-muted" dir="ltr">
                          {file.name}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="feedback-inbox__assignee">
                <SelectField
                  label="אחראי"
                  value={item.assignee_id ?? FEEDBACK_ASSIGNEE_NONE}
                  options={assigneeOptions}
                  disabled={busyId === item.id}
                  onChange={(event) => void assign(item, event.target.value)}
                />
              </div>
              <div className="feedback-inbox__actions">
                {item.status === 'open' ? (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busyId === item.id}
                    onClick={() => void setStatus(item, 'in_progress')}
                  >
                    בטיפול
                  </Button>
                ) : null}
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
                    {item.status === 'in_progress' ? 'החזרה לפתוח' : 'פתיחה מחדש'}
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
        open={draft !== null}
        title="משימה חדשה"
        form
        onClose={closeDraft}
        footer={
          <>
            <Button type="button" variant="secondary" disabled={savingDraft} onClick={closeDraft}>
              ביטול
            </Button>
            <Button
              type="button"
              loading={savingDraft}
              loadingLabel="מוסיף…"
              onClick={() => void submitDraft()}
            >
              הוספת משימה
            </Button>
          </>
        }
      >
        {draft ? (
          <div className="stack-6">
            <TextField
              label="כותרת"
              required
              maxLength={FEEDBACK_TASK_TITLE_MAX}
              value={draft.title}
              error={draftError}
              onChange={(event) => {
                setDraftError(undefined)
                setDraft({ ...draft, title: event.target.value })
              }}
            />
            <TextAreaField
              label="פירוט"
              rows={4}
              maxLength={FEEDBACK_BODY_MAX}
              value={draft.body}
              onChange={(event) => setDraft({ ...draft, body: event.target.value })}
            />
            <SelectField
              label="אחראי"
              value={draft.assigneeId}
              options={assigneeOptions}
              onChange={(event) => setDraft({ ...draft, assigneeId: event.target.value })}
            />
          </div>
        ) : null}
      </Dialog>

      <AlertDialog
        open={Boolean(confirmDelete)}
        status="danger"
        title="למחוק את המשוב?"
        busy={Boolean(confirmDelete && busyId === confirmDelete.id)}
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
      </AlertDialog>
    </div>
  )
}
