import { useEffect, useId, useMemo, useRef, useState } from 'react'
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
  FEEDBACK_TASK_TITLE_LEN_ERROR,
  FEEDBACK_TASK_TITLE_MAX,
  feedbackAssigneeFilterOptions,
  feedbackAssigneeOptions,
  feedbackHeading,
  feedbackMatchesFilter,
  feedbackRowsNeedingTranscript,
  feedbackTaskError,
  feedbackTreatedToast,
  filterFeedbackByAssignee,
  isFeedbackTask,
  type FeedbackAssignee,
  type FeedbackListFilter,
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
  | 'updateFeedbackTask'
>

const FILTERS: { id: FeedbackListFilter; label: string }[] = [
  { id: 'active', label: 'פעיל' },
  { id: 'open', label: 'פתוח' },
  { id: 'in_progress', label: 'בטיפול' },
  { id: 'fixed', label: 'טופל' },
  { id: 'wont_do', label: 'לא יטופל' },
  { id: 'all', label: 'הכול' },
]

/** `id` is null for a new task. */
type TaskDraft = { id: string | null; title: string; body: string; assigneeId: string }

const HEADING = 'heading'

export function FeedbackInboxPage({ api = userFeedbackApi }: { api?: FeedbackInboxApi } = {}) {
  const { show } = useToast()
  const formId = useId()
  const [filter, setFilter] = useState<FeedbackListFilter>('active')
  const [assigneeFilter, setAssigneeFilter] = useState<string>(FEEDBACK_ASSIGNEE_ALL)
  const [assignees, setAssignees] = useState<FeedbackAssignee[]>([])
  const [items, setItems] = useState<UserFeedback[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(() => new Set())
  const [confirmDelete, setConfirmDelete] = useState<UserFeedback | null>(null)
  const [transcriptErrors, setTranscriptErrors] = useState<Record<string, string>>({})
  const [draft, setDraft] = useState<TaskDraft | null>(null)
  const [draftError, setDraftError] = useState<string | undefined>()
  const [draftSaveError, setDraftSaveError] = useState<string | undefined>()
  const [savingDraft, setSavingDraft] = useState(false)
  const [pendingFocus, setPendingFocus] = useState<string | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const assigneeFilterRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef(new Map<string, HTMLLIElement>())
  /** Saving rows, read synchronously so a second click on the same card is ignored. */
  const busyRef = useRef(new Set<string>())
  /** Bumped on every full load, so a slower silent refresh for an older filter is dropped. */
  const loadGeneration = useRef(0)
  const draftOpen = draft !== null

  function setBusy(id: string, busy: boolean) {
    if (busy) busyRef.current.add(id)
    else busyRef.current.delete(id)
    setBusyIds(new Set(busyRef.current))
  }

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
    loadGeneration.current += 1
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

  // Runs after the Dialog's own effect, which focuses its first control (the X).
  useEffect(() => {
    if (draftOpen) titleRef.current?.focus()
  }, [draftOpen])

  useEffect(() => {
    if (!pendingFocus) return
    const card = pendingFocus === HEADING ? null : cardRefs.current.get(pendingFocus)
    ;(card ?? headingRef.current)?.focus()
    setPendingFocus(null)
  }, [pendingFocus])

  const visibleItems = useMemo(
    () => (items ? filterFeedbackByAssignee(items, assigneeFilter) : null),
    [items, assigneeFilter],
  )

  const filterOptions = useMemo(() => feedbackAssigneeFilterOptions(assignees), [assignees])

  const emptyCaption = useMemo(() => {
    if (assigneeFilter !== FEEDBACK_ASSIGNEE_ALL) return 'אין פריטים שתואמים לסינון.'
    if (filter === 'active') return 'אין משוב פעיל.'
    if (filter === 'open') return 'אין משוב פתוח.'
    if (filter === 'all') return 'עדיין לא התקבל משוב.'
    return 'אין פריטים במצב הזה.'
  }, [assigneeFilter, filter])

  /**
   * Patches one saved row into the current list (`patch` null removes it) without
   * re-sorting, so the card stays where it was until the next load. Moves focus off a
   * control that may have just disappeared. A save that outlived a reload changes nothing.
   */
  function settle(
    id: string,
    patch: Partial<UserFeedback> | null,
    generation: number,
    keepFocus = false,
  ) {
    if (generation !== loadGeneration.current) return
    const keep = (row: UserFeedback) =>
      feedbackMatchesFilter(row.status, filter) &&
      filterFeedbackByAssignee([row], assigneeFilter).length > 0
    setItems(
      (current) =>
        current?.flatMap((row) => {
          if (row.id !== id) return [row]
          if (!patch) return []
          const next = { ...row, ...patch }
          return feedbackMatchesFilter(next.status, filter) ? [next] : []
        }) ?? null,
    )
    const before = visibleItems ?? []
    const saved = before.find((row) => row.id === id)
    const stillShown = Boolean(saved && patch && keep({ ...saved, ...patch }))
    if (stillShown) {
      if (!keepFocus) setPendingFocus(id)
      return
    }
    const index = before.findIndex((row) => row.id === id)
    const neighbour = index < 0 ? undefined : (before[index + 1] ?? before[index - 1])
    setPendingFocus(neighbour?.id ?? HEADING)
  }

  async function setStatus(item: UserFeedback, status: FeedbackStatus) {
    if (busyRef.current.has(item.id)) return
    const generation = loadGeneration.current
    setBusy(item.id, true)
    const task = isFeedbackTask(item)
    const result = await api.updateUserFeedbackStatus(item.id, status, { notifyAuthor: !task })
    setBusy(item.id, false)
    if (!result.ok) {
      show(result.error, 'alert')
      return
    }
    const toast =
      status === 'fixed' && !task
        ? feedbackTreatedToast(result.sms)
        : { message: 'הסטטוס עודכן.', tone: 'done' as const }
    show(toast.message, toast.tone)
    settle(item.id, { status }, generation)
  }

  async function assign(item: UserFeedback, value: string) {
    const assigneeId = value === FEEDBACK_ASSIGNEE_NONE ? null : value
    if (busyRef.current.has(item.id) || assigneeId === item.assignee_id) return
    const generation = loadGeneration.current
    setBusy(item.id, true)
    const result = await api.setUserFeedbackAssignee(item.id, assigneeId)
    setBusy(item.id, false)
    if (!result.ok) {
      show(result.error, 'alert')
      return
    }
    show('האחראי עודכן.', 'done')
    settle(item.id, { assignee_id: assigneeId }, generation, true)
  }

  async function remove(item: UserFeedback) {
    if (busyRef.current.has(item.id)) return
    const generation = loadGeneration.current
    setBusy(item.id, true)
    const result = await api.deleteUserFeedback({
      id: item.id,
      audioStoragePath: item.audio_storage_path,
      attachmentPaths: item.attachments.map((file) => file.path),
    })
    setBusy(item.id, false)
    setConfirmDelete(null)
    if (!result.ok) {
      show(result.error, 'alert')
      return
    }
    show(isFeedbackTask(item) ? 'המשימה נמחקה.' : 'המשוב נמחק.', 'done')
    settle(item.id, null, generation)
  }

  async function refreshSilently() {
    const generation = loadGeneration.current
    try {
      const rows = await api.listUserFeedback(filter)
      if (generation === loadGeneration.current) setItems(rows)
    } catch {
      if (generation === loadGeneration.current) setReloadKey((key) => key + 1)
    }
  }

  function clearAssigneeFilter() {
    setAssigneeFilter(FEEDBACK_ASSIGNEE_ALL)
    assigneeFilterRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
  }

  function openDraft(item?: UserFeedback) {
    setDraftError(undefined)
    setDraftSaveError(undefined)
    setDraft(
      item
        ? { id: item.id, title: item.title ?? '', body: item.body ?? '', assigneeId: FEEDBACK_ASSIGNEE_NONE }
        : { id: null, title: '', body: '', assigneeId: FEEDBACK_ASSIGNEE_NONE },
    )
  }

  function closeDraft() {
    if (savingDraft) return
    setDraft(null)
  }

  async function submitDraft() {
    if (!draft || savingDraft) return
    const error = feedbackTaskError(draft)
    if (error) {
      setDraftError(error)
      titleRef.current?.focus()
      return
    }
    setDraftSaveError(undefined)
    setSavingDraft(true)
    const result = draft.id
      ? await api.updateFeedbackTask(draft.id, { title: draft.title, body: draft.body })
      : await api.createFeedbackTask({
          title: draft.title,
          body: draft.body,
          assigneeId: draft.assigneeId === FEEDBACK_ASSIGNEE_NONE ? null : draft.assigneeId,
        })
    setSavingDraft(false)
    if (!result.ok) {
      setDraftSaveError(result.error)
      titleRef.current?.focus()
      return
    }
    const editedId = draft.id
    setDraft(null)
    if (editedId) {
      show('המשימה עודכנה.', 'done')
      setItems(
        (current) =>
          current?.map((row) =>
            row.id === editedId
              ? { ...row, title: draft.title.trim(), body: draft.body.trim() || null }
              : row,
          ) ?? null,
      )
      return
    }
    show('המשימה נוספה.', 'done')
    setAssigneeFilter(FEEDBACK_ASSIGNEE_ALL)
    if (feedbackMatchesFilter('open', filter)) void refreshSilently()
    else setFilter('active')
  }

  return (
    <div className="stack-4">
      <div className="page-head">
        <h1 className="t-title" ref={headingRef} tabIndex={-1}>
          משוב
        </h1>
        <Button
          onClick={() => openDraft()}
          icon={<Plus size={20} strokeWidth={1.75} aria-hidden="true" />}
        >
          משימה חדשה
        </Button>
      </div>

      <div className="feedback-inbox__filters">
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
        <div className="feedback-inbox__filter" ref={assigneeFilterRef}>
          <SelectField
            label="אחראי"
            value={assigneeFilter}
            options={filterOptions}
            onChange={(event) => setAssigneeFilter(event.target.value)}
          />
        </div>
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
          action={
            assigneeFilter !== FEEDBACK_ASSIGNEE_ALL ? (
              <Button variant="secondary" onClick={clearAssigneeFilter}>
                ניקוי סינון
              </Button>
            ) : undefined
          }
        />
      ) : null}

      {visibleItems && visibleItems.length > 0 ? (
        <ul className="stack-4 feedback-inbox">
          {visibleItems.map((item) => {
            const task = isFeedbackTask(item)
            const busy = busyIds.has(item.id)
            return (
              <li
                key={item.id}
                ref={(node) => {
                  if (node) cardRefs.current.set(item.id, node)
                  else cardRefs.current.delete(item.id)
                }}
                tabIndex={-1}
                aria-busy={busy}
                className={busy ? 'card feedback-inbox__card feedback-inbox__card--saving' : 'card feedback-inbox__card'}
              >
                <div className="feedback-inbox__head">
                  <p className="t-section">{feedbackHeading(item)}</p>
                  <StampChip {...FEEDBACK_STATUS_STAMP[item.status]} />
                </div>
                {task ? (
                  <p className="t-body">נפתחה ע״י {item.author_name ?? 'משתמש'}</p>
                ) : (
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
                )}
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
                    options={feedbackAssigneeOptions(assignees, item.assignee_id)}
                    onChange={(event) => void assign(item, event.target.value)}
                  />
                </div>
                <div className="feedback-inbox__actions">
                  {item.status !== 'in_progress' ? (
                    <Button
                      type="button"
                      variant="secondary"
                      aria-disabled={busy}
                      onClick={() => void setStatus(item, 'in_progress')}
                    >
                      בטיפול
                    </Button>
                  ) : null}
                  {item.status !== 'fixed' ? (
                    <Button
                      type="button"
                      variant="secondary"
                      aria-disabled={busy}
                      onClick={() => void setStatus(item, 'fixed')}
                    >
                      טופל
                    </Button>
                  ) : null}
                  {item.status !== 'wont_do' ? (
                    <Button
                      type="button"
                      variant="secondary"
                      aria-disabled={busy}
                      onClick={() => void setStatus(item, 'wont_do')}
                    >
                      לא יטופל
                    </Button>
                  ) : null}
                  {item.status !== 'open' ? (
                    <Button
                      type="button"
                      variant="ghost"
                      aria-disabled={busy}
                      onClick={() => void setStatus(item, 'open')}
                    >
                      {item.status === 'in_progress' ? 'החזרה לפתוח' : 'פתיחה מחדש'}
                    </Button>
                  ) : null}
                  {task ? (
                    <Button
                      type="button"
                      variant="ghost"
                      aria-disabled={busy}
                      onClick={() => {
                        if (!busy) openDraft(item)
                      }}
                    >
                      עריכה
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="destructive"
                    aria-disabled={busy}
                    onClick={() => {
                      if (!busy) setConfirmDelete(item)
                    }}
                  >
                    מחיקה
                  </Button>
                  {busy ? (
                    <p className="t-caption text-muted" role="status">
                      שומר…
                    </p>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}

      <Dialog
        open={draftOpen}
        title={draft?.id ? 'עריכת משימה' : 'משימה חדשה'}
        form
        onClose={closeDraft}
        footer={
          <>
            <Button type="button" variant="secondary" disabled={savingDraft} onClick={closeDraft}>
              ביטול
            </Button>
            <Button
              type="submit"
              form={formId}
              loading={savingDraft}
              loadingLabel={draft?.id ? 'שומר…' : 'מוסיף…'}
            >
              {draft?.id ? 'שמירת משימה' : 'הוספת משימה'}
            </Button>
          </>
        }
      >
        {draft ? (
          <form
            id={formId}
            className="stack-6"
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              void submitDraft()
            }}
          >
            <TextField
              label="כותרת"
              required
              inputRef={titleRef}
              value={draft.title}
              hint={`${draft.title.length} מתוך ${FEEDBACK_TASK_TITLE_MAX} תווים`}
              error={
                draftError ??
                (draft.title.trim().length > FEEDBACK_TASK_TITLE_MAX
                  ? FEEDBACK_TASK_TITLE_LEN_ERROR
                  : undefined)
              }
              onChange={(event) => {
                setDraftError(undefined)
                setDraftSaveError(undefined)
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
            {draft.id ? null : (
              <SelectField
                label="אחראי"
                value={draft.assigneeId}
                options={feedbackAssigneeOptions(assignees, null)}
                onChange={(event) => setDraft({ ...draft, assigneeId: event.target.value })}
              />
            )}
            {draftSaveError ? (
              <p className="field__hint field__hint--error" role="alert">
                {draftSaveError}
              </p>
            ) : null}
          </form>
        ) : null}
      </Dialog>

      <AlertDialog
        open={Boolean(confirmDelete)}
        status="danger"
        title={confirmDelete && isFeedbackTask(confirmDelete) ? 'למחוק את המשימה?' : 'למחוק את המשוב?'}
        busy={Boolean(confirmDelete && busyIds.has(confirmDelete.id))}
        onClose={() => setConfirmDelete(null)}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setConfirmDelete(null)}>
              ביטול
            </Button>
            <Button
              type="button"
              variant="destructive"
              loading={Boolean(confirmDelete && busyIds.has(confirmDelete.id))}
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
