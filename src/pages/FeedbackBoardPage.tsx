import { useEffect, useId, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { Bug, ClipboardList, Lightbulb, MessageSquarePlus, Mic, Paperclip, Plus } from 'lucide-react'
import { AlertDialog } from '../components/ui/AlertDialog'
import { Avatar } from '../components/ui/Avatar'
import { Button } from '../components/ui/Button'
import { Dialog } from '../components/ui/Dialog'
import { EmptyState } from '../components/ui/EmptyState'
import { FilterChips } from '../components/ui/FilterChips'
import { OverflowMenu, type OverflowMenuItem } from '../components/ui/OverflowMenu'
import { SelectField } from '../components/ui/SelectField'
import { Skeleton } from '../components/ui/Skeleton'
import { StampChip } from '../components/ui/StampChip'
import { TextAreaField } from '../components/ui/TextAreaField'
import { TextField } from '../components/ui/TextField'
import { useToast } from '../components/ui/Toast'
import {
  BOARD_COLUMNS,
  BOARD_FINISHED_LIMIT,
  boardCardExcerpt,
  boardColumnLabel,
  boardColumns,
  boardDropIndex,
  boardMoveNeedsSmsConfirm,
  isFinishedColumn,
  planBoardMove,
} from '../lib/feedbackBoard'
import { formatDate, formatDateTime, monoClass } from '../lib/format'
import * as userFeedbackApi from '../lib/userFeedback'
import {
  FEEDBACK_ASSIGNEE_ALL,
  FEEDBACK_ASSIGNEE_NONE,
  FEEDBACK_BODY_MAX,
  FEEDBACK_KIND_LABEL,
  FEEDBACK_STATUS_STAMP,
  FEEDBACK_TASK_TITLE_LEN_ERROR,
  FEEDBACK_TASK_TITLE_MAX,
  feedbackAssigneeOptions,
  feedbackRowsNeedingTranscript,
  feedbackTaskError,
  feedbackTreatedToast,
  firstNameFromFullName,
  isFeedbackTask,
  type FeedbackAssignee,
  type FeedbackStatus,
  type UserFeedback,
} from '../lib/userFeedback'

/** The data boundary of this page. The dev harness passes a stub; the app uses the real module. */
export type FeedbackBoardApi = Pick<
  typeof userFeedbackApi,
  | 'listUserFeedback'
  | 'transcribeUserFeedback'
  | 'updateUserFeedbackStatus'
  | 'deleteUserFeedback'
  | 'listFeedbackAssignees'
  | 'setUserFeedbackAssignee'
  | 'createFeedbackTask'
  | 'updateFeedbackTask'
  | 'saveFeedbackBoardPositions'
  | 'saveFeedbackBoardNote'
>

/** `id` is null for a new task. */
type TaskDraft = { id: string | null; title: string; body: string; assigneeId: string }

/** A move waiting for the SMS question. */
type PendingFixed = { item: UserFeedback; index: number }

type DropTarget = { status: FeedbackStatus; index: number }

const HEADING = 'heading'

const STATUS_OPTIONS = BOARD_COLUMNS.map((status) => ({ value: status, label: boardColumnLabel(status) }))

const COLUMN_EMPTY: Record<FeedbackStatus, string> = {
  open: 'אין משוב פתוח.',
  in_progress: 'אין כרטיסים בטיפול.',
  fixed: 'עוד לא סומן משוב כטופל.',
  wont_do: 'אין כרטיסים שלא יטופלו.',
}

function cardText(item: UserFeedback): string {
  if (item.title) return item.title
  return boardCardExcerpt(item) || (item.audio_storage_path ? 'הקלטה קולית' : 'משוב')
}

function KindMark({ item }: { item: UserFeedback }) {
  const props = { size: 16, strokeWidth: 1.75, 'aria-hidden': true } as const
  if (isFeedbackTask(item)) {
    return (
      <span className="board-card__kind">
        <ClipboardList {...props} />
        משימה
      </span>
    )
  }
  return (
    <span className="board-card__kind">
      {item.kind === 'suggestion' ? <Lightbulb {...props} /> : <Bug {...props} />}
      {item.kind ? FEEDBACK_KIND_LABEL[item.kind] : 'משוב'}
    </span>
  )
}

export function FeedbackBoardPage({ api = userFeedbackApi }: { api?: FeedbackBoardApi } = {}) {
  const { show } = useToast()
  const formId = useId()
  const [items, setItems] = useState<UserFeedback[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [assignees, setAssignees] = useState<FeedbackAssignee[]>([])
  const [assigneeFilter, setAssigneeFilter] = useState<string>(FEEDBACK_ASSIGNEE_ALL)
  const [phoneColumn, setPhoneColumn] = useState<FeedbackStatus>('open')
  const [expanded, setExpanded] = useState<ReadonlySet<FeedbackStatus>>(() => new Set())
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(() => new Set())
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [drop, setDrop] = useState<DropTarget | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [pendingFixed, setPendingFixed] = useState<PendingFixed | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<UserFeedback | null>(null)
  const [transcriptErrors, setTranscriptErrors] = useState<Record<string, string>>({})
  const [draft, setDraft] = useState<TaskDraft | null>(null)
  const [draftError, setDraftError] = useState<string | undefined>()
  const [draftSaveError, setDraftSaveError] = useState<string | undefined>()
  const [savingDraft, setSavingDraft] = useState(false)
  const [pendingFocus, setPendingFocus] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const headingRef = useRef<HTMLHeadingElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const busyRef = useRef(new Set<string>())
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
    setItems(null)
    setFailed(false)
    setTranscriptErrors({})
    api
      .listUserFeedback('all')
      .then((rows) => {
        if (!active) return
        setItems(rows)
        for (const id of feedbackRowsNeedingTranscript(rows)) {
          void api.transcribeUserFeedback(id).then((result) => {
            if (!active) return
            if (result.ok) {
              setItems(
                (current) =>
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
  }, [api, reloadKey])

  // Runs after the Dialog's own effect, which focuses its first control (the X).
  useEffect(() => {
    if (draftOpen) titleRef.current?.focus()
  }, [draftOpen])

  useEffect(() => {
    if (!pendingFocus) return
    const target =
      pendingFocus === HEADING
        ? null
        : document.querySelector<HTMLElement>(`[data-card-open="${CSS.escape(pendingFocus)}"]`)
    // A card in a column hidden on a phone has no layout box; fall back to the heading.
    ;(target && target.offsetParent !== null ? target : headingRef.current)?.focus()
    setPendingFocus(null)
  }, [pendingFocus])

  const columns = useMemo(
    () => (items ? boardColumns(items, assigneeFilter) : null),
    [items, assigneeFilter],
  )

  const detail = useMemo(
    () => (detailId ? (items?.find((item) => item.id === detailId) ?? null) : null),
    [items, detailId],
  )

  const assignable = useMemo(() => assignees.filter((person) => person.assignable), [assignees])

  const assigneeChips = useMemo(
    () => [
      { value: FEEDBACK_ASSIGNEE_ALL, label: 'הכול' },
      ...assignable.map((person) => ({ value: person.id, label: person.full_name })),
      { value: FEEDBACK_ASSIGNEE_NONE, label: 'לא משויך' },
    ],
    [assignable],
  )

  function assigneeName(id: string | null): string | null {
    if (!id) return null
    return assignees.find((person) => person.id === id)?.full_name ?? 'משתמש (לא פעיל)'
  }

  function patchItems(patch: (row: UserFeedback) => UserFeedback) {
    setItems((current) => current?.map(patch) ?? null)
  }

  /**
   * Puts `item` at `index` of column `status` (index counts the other cards in that
   * column as the viewer sees it). Applied at once; a failed status save puts it back.
   */
  async function move(
    item: UserFeedback,
    status: FeedbackStatus,
    index: number,
    options: { notifyAuthor: boolean; focus: boolean },
  ) {
    if (!columns || busyRef.current.has(item.id)) return
    const plan = planBoardMove(columns[status], item.id, index, status)
    const statusChanged = status !== item.status
    const previous = items
    const positions = new Map(plan.positions.map((entry) => [entry.id, entry.position]))
    patchItems((row) => {
      const position = positions.get(row.id)
      const next = position === undefined ? row : { ...row, board_position: position }
      return row.id === item.id ? { ...next, status } : next
    })
    if (options.focus) setPendingFocus(item.id)
    setBusy(item.id, true)

    if (statusChanged) {
      const texted = Boolean(item.sms_sent_at)
      const result = await api.updateUserFeedbackStatus(item.id, status, {
        notifyAuthor: options.notifyAuthor && !isFeedbackTask(item) && !texted,
      })
      if (!result.ok) {
        setBusy(item.id, false)
        setItems(previous)
        show(result.error, 'alert')
        return
      }
      if (result.smsSentAt) {
        const sentAt = result.smsSentAt
        const inferred = result.smsSentInferred === true
        patchItems((row) =>
          row.id === item.id ? { ...row, sms_sent_at: sentAt, sms_sent_inferred: inferred } : row,
        )
      }
      const moved = `הכרטיס סומן כ${boardColumnLabel(status)}.`
      const asked = status === 'fixed' && options.notifyAuthor && !isFeedbackTask(item) && !texted
      const sms = asked ? feedbackTreatedToast(result.sms) : null
      if (sms?.tone === 'alert') show(sms.message, 'alert')
      else if (status === 'fixed' && (texted || result.sms === 'already_sent'))
        show(`${moved} השולח כבר קיבל SMS על המשוב הזה, ולא נשלח שוב.`, 'done')
      else show(asked && result.sms === 'sent' ? `${moved} נשלח SMS לשולח.` : moved, 'done')
    }

    const saved = await api.saveFeedbackBoardPositions(plan.positions)
    setBusy(item.id, false)
    if (!saved.ok) {
      show(statusChanged ? `הסטטוס נשמר. ${saved.error}` : saved.error, 'alert')
      return
    }
    if (!statusChanged) setAnnouncement(`הכרטיס הוזז. מקום ${index + 1} בעמודה ${boardColumnLabel(status)}.`)
  }

  function requestMove(item: UserFeedback, status: FeedbackStatus, index: number, focus: boolean) {
    if (boardMoveNeedsSmsConfirm(item, status)) {
      setPendingFixed({ item, index })
      return
    }
    void move(item, status, index, { notifyAuthor: true, focus })
  }

  async function assign(item: UserFeedback, assigneeId: string | null) {
    if (busyRef.current.has(item.id) || assigneeId === item.assignee_id) return
    setBusy(item.id, true)
    const result = await api.setUserFeedbackAssignee(item.id, assigneeId)
    setBusy(item.id, false)
    if (!result.ok) {
      show(result.error, 'alert')
      return
    }
    patchItems((row) => (row.id === item.id ? { ...row, assignee_id: assigneeId } : row))
    show(assigneeId ? `הכרטיס שויך ל${assigneeName(assigneeId)}.` : 'השיוך בוטל.', 'done')
  }

  async function remove(item: UserFeedback) {
    if (busyRef.current.has(item.id)) return
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
    setDetailId(null)
    setItems((current) => current?.filter((row) => row.id !== item.id) ?? null)
    show(isFeedbackTask(item) ? 'המשימה נמחקה.' : 'המשוב נמחק.', 'done')
    setPendingFocus(HEADING)
  }

  function openDetail(item: UserFeedback) {
    setNoteDraft(item.board_note ?? '')
    setDetailId(item.id)
  }

  async function saveNote() {
    if (!detail || savingNote) return
    setSavingNote(true)
    const result = await api.saveFeedbackBoardNote(detail.id, noteDraft)
    setSavingNote(false)
    if (!result.ok) {
      show(result.error, 'alert')
      return
    }
    const note = noteDraft.trim() || null
    patchItems((row) => (row.id === detail.id ? { ...row, board_note: note } : row))
    show('ההערה נשמרה.', 'done')
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
      patchItems((row) =>
        row.id === editedId ? { ...row, title: draft.title.trim(), body: draft.body.trim() || null } : row,
      )
      return
    }
    show('המשימה נוספה לעמודה פתוח.', 'done')
    setAssigneeFilter(FEEDBACK_ASSIGNEE_ALL)
    setPhoneColumn('open')
    setReloadKey((key) => key + 1)
  }

  // ---- Drag and drop (pointer). The card menu is the keyboard and touch path. ----

  function onDragStart(event: DragEvent<HTMLLIElement>, item: UserFeedback) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', item.id)
    setMenuFor(null)
    setDragId(item.id)
  }

  function onDragOver(event: DragEvent<HTMLOListElement>, status: FeedbackStatus) {
    if (!dragId) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    const cards = [...event.currentTarget.querySelectorAll<HTMLElement>('[data-card-id]')].filter(
      (node) => node.dataset.cardId !== dragId,
    )
    const index = boardDropIndex(
      cards.map((node) => node.getBoundingClientRect()),
      event.clientY,
    )
    if (drop?.status !== status || drop.index !== index) setDrop({ status, index })
  }

  function onDragLeave(event: DragEvent<HTMLOListElement>) {
    const next = event.relatedTarget as Node | null
    if (next && event.currentTarget.contains(next)) return
    setDrop(null)
  }

  function onDrop(event: DragEvent<HTMLOListElement>, status: FeedbackStatus) {
    event.preventDefault()
    const item = items?.find((row) => row.id === dragId)
    const index = drop?.status === status ? drop.index : 0
    setDragId(null)
    setDrop(null)
    if (!item) return
    const column = columns?.[status] ?? []
    if (item.status === status && column.findIndex((row) => row.id === item.id) === index) return
    requestMove(item, status, index, false)
  }

  function onDragEnd() {
    setDragId(null)
    setDrop(null)
  }

  function menuItems(item: UserFeedback, column: UserFeedback[]): OverflowMenuItem[] {
    const at = column.findIndex((row) => row.id === item.id)
    const moves = BOARD_COLUMNS.filter((status) => status !== item.status).map((status) => ({
      label: `סימון כ${boardColumnLabel(status)}`,
      onSelect: () => requestMove(item, status, 0, true),
    }))
    const assigns = assignable
      .filter((person) => person.id !== item.assignee_id)
      .map((person) => ({
        label: `שיוך ל${firstNameFromFullName(person.full_name) || person.full_name}`,
        onSelect: () => void assign(item, person.id),
      }))
    return [
      { label: 'פתיחת הכרטיס', onSelect: () => openDetail(item) },
      ...moves,
      {
        label: 'הזזה למעלה',
        disabled: at <= 0,
        onSelect: () => requestMove(item, item.status, at - 1, true),
      },
      {
        label: 'הזזה למטה',
        disabled: at < 0 || at >= column.length - 1,
        onSelect: () => requestMove(item, item.status, at + 1, true),
      },
      ...assigns,
      ...(item.assignee_id ? [{ label: 'ביטול שיוך', onSelect: () => void assign(item, null) }] : []),
    ]
  }

  function renderCard(item: UserFeedback, column: UserFeedback[]) {
    const busy = busyIds.has(item.id)
    const owner = assigneeName(item.assignee_id)
    const files = item.attachments.length
    return (
      <li
        key={item.id}
        data-card-id={item.id}
        className={['board-card', dragId === item.id ? 'is-dragging' : ''].filter(Boolean).join(' ')}
        draggable={!busy}
        aria-busy={busy}
        onDragStart={(event) => onDragStart(event, item)}
        onDragEnd={onDragEnd}
      >
        {/* Title first in the DOM so Tab reaches it before its own menu; CSS draws the top row above it. */}
        <button
          type="button"
          className="board-card__open"
          data-card-open={item.id}
          onClick={() => openDetail(item)}
        >
          {cardText(item)}
        </button>
        <div className="board-card__top">
          <KindMark item={item} />
          <OverflowMenu
            open={menuFor === item.id}
            onOpenChange={(open) => setMenuFor(open ? item.id : null)}
            label={`פעולות לכרטיס: ${cardText(item).slice(0, 40)}`}
            items={menuItems(item, column)}
          />
        </div>
        <div className="board-card__meta t-caption">
          <span className="board-card__who">
            {isFeedbackTask(item) ? 'משימה פנימית' : (item.author_name ?? 'משתמש')}
          </span>
          <time className="board-card__when" dateTime={item.created_at} title={formatDateTime(item.created_at)}>
            {formatDate(item.created_at)}
          </time>
          <span className="board-card__marks">
            {item.audio_storage_path ? (
              <span className="board-card__mark" title="הקלטה קולית">
                <Mic size={16} strokeWidth={1.75} aria-hidden="true" />
                <span className="visually-hidden">הקלטה קולית</span>
              </span>
            ) : null}
            {files > 0 ? (
              <span className="board-card__mark" title={`${files} קבצים מצורפים`}>
                <Paperclip size={16} strokeWidth={1.75} aria-hidden="true" />
                <span className="mono">{files}</span>
                <span className="visually-hidden">קבצים מצורפים</span>
              </span>
            ) : null}
            {owner ? (
              <span className="board-card__owner" title={`אחראי: ${owner}`}>
                <Avatar name={owner} size="sm" />
                <span className="visually-hidden">אחראי: {owner}</span>
              </span>
            ) : null}
          </span>
        </div>
        {busy ? (
          <p className="t-caption text-muted" role="status">
            שומר…
          </p>
        ) : null}
      </li>
    )
  }

  function renderColumn(status: FeedbackStatus) {
    const column = columns?.[status] ?? []
    const limited = isFinishedColumn(status) && !expanded.has(status)
    const shown = limited ? column.slice(0, BOARD_FINISHED_LIMIT) : column
    const hidden = column.length - shown.length
    const headingId = `board-col-${status}`
    const dropping = drop?.status === status
    const others = shown.filter((row) => row.id !== dragId)
    const lineBefore = dropping ? (others[drop.index]?.id ?? null) : undefined
    return (
      <section
        key={status}
        className={['board-col', dropping ? 'is-drop-target' : ''].filter(Boolean).join(' ')}
        aria-labelledby={headingId}
        data-active={phoneColumn === status}
      >
        <header className="board-col__head">
          <h2 className="t-label" id={headingId}>
            {boardColumnLabel(status)}
          </h2>
          <span className="board-col__count mono">
            {column.length}
            <span className="visually-hidden"> כרטיסים</span>
          </span>
        </header>
        <ol
          className="board-col__list"
          aria-labelledby={headingId}
          onDragOver={(event) => onDragOver(event, status)}
          onDragLeave={onDragLeave}
          onDrop={(event) => onDrop(event, status)}
        >
          {shown.length === 0 ? (
            <li className="board-col__empty t-caption">
              {dragId ? 'שחררו כאן כדי להעביר לעמודה הזו.' : COLUMN_EMPTY[status]}
            </li>
          ) : null}
          {shown.map((item) => (
            <FragmentWithLine key={item.id} line={lineBefore === item.id}>
              {renderCard(item, column)}
            </FragmentWithLine>
          ))}
          {dropping && lineBefore === null && shown.length > 0 ? (
            <li className="board-col__line" aria-hidden="true" />
          ) : null}
        </ol>
        {hidden > 0 ? (
          <Button
            variant="ghost"
            onClick={() => setExpanded((current) => new Set([...current, status]))}
          >
            הצגת עוד {hidden}
          </Button>
        ) : null}
      </section>
    )
  }

  const total = items?.length ?? 0
  const filtered = assigneeFilter !== FEEDBACK_ASSIGNEE_ALL

  return (
    <div className="stack-4 board-page">
      <div className="page-head">
        <h1 className="t-title" ref={headingRef} tabIndex={-1}>
          משוב
        </h1>
        <Button onClick={() => openDraft()} icon={<Plus size={20} strokeWidth={1.75} aria-hidden="true" />}>
          משימה חדשה
        </Button>
      </div>

      {/* Filters and the phone column switcher only once there is something to filter. */}
      {total > 0 ? (
        <div className="board-toolbar">
          <FilterChips label="סינון לפי אחראי" options={assigneeChips} value={assigneeFilter} onChange={setAssigneeFilter} />
          {columns ? (
            <div className="board-switch">
              <FilterChips
                label="עמודה"
                options={BOARD_COLUMNS.map((status) => ({
                  value: status,
                  label: `${boardColumnLabel(status)} (${columns[status].length})`,
                }))}
                value={phoneColumn}
                onChange={setPhoneColumn}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <p className="visually-hidden" aria-live="polite">
        {announcement}
      </p>

      {items === null && !failed ? (
        <div className="board" aria-busy="true" aria-label="טוען את לוח המשוב">
          {BOARD_COLUMNS.map((status) => (
            <section key={status} className="board-col" data-active={phoneColumn === status}>
              <header className="board-col__head">
                <span className="t-label">{boardColumnLabel(status)}</span>
              </header>
              <div className="board-col__list">
                <Skeleton height={112} />
                <Skeleton height={88} />
              </div>
            </section>
          ))}
        </div>
      ) : null}

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

      {columns && !failed && total === 0 ? (
        <EmptyState
          icon={<MessageSquarePlus size={40} strokeWidth={1.75} aria-hidden="true" />}
          title="עדיין לא התקבל משוב."
          caption="משוב שמתנדבים שולחים מהאפליקציה יופיע כאן בעמודה פתוח."
        />
      ) : null}

      {columns && !failed && total > 0 ? (
        <>
          {filtered && BOARD_COLUMNS.every((status) => columns[status].length === 0) ? (
            <div className="board-filter-empty">
              <p className="t-body">אין כרטיסים שתואמים לסינון.</p>
              <Button variant="secondary" onClick={() => setAssigneeFilter(FEEDBACK_ASSIGNEE_ALL)}>
                ניקוי סינון
              </Button>
            </div>
          ) : null}
          <div className={['board', dragId ? 'is-dragging' : ''].filter(Boolean).join(' ')}>
            {BOARD_COLUMNS.map(renderColumn)}
          </div>
        </>
      ) : null}

      <Dialog
        open={detail !== null}
        title={detail ? (detail.title ?? (detail.kind ? FEEDBACK_KIND_LABEL[detail.kind] : 'משוב')) : ''}
        form
        onClose={() => {
          const id = detailId
          setDetailId(null)
          if (id) setPendingFocus(id)
        }}
        footer={
          detail ? (
            <>
              <Button
                variant="destructive"
                aria-disabled={busyIds.has(detail.id)}
                onClick={() => {
                  if (!busyIds.has(detail.id)) setConfirmDelete(detail)
                }}
              >
                מחיקה
              </Button>
              {isFeedbackTask(detail) ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    const item = detail
                    setDetailId(null)
                    openDraft(item)
                  }}
                >
                  עריכת המשימה
                </Button>
              ) : null}
            </>
          ) : null
        }
      >
        {detail ? (
          <div className="stack-6 board-detail">
            <div className="board-detail__head">
              <StampChip {...FEEDBACK_STATUS_STAMP[detail.status]} />
              <p className="t-caption text-muted">
                {isFeedbackTask(detail) ? (
                  <>נפתחה ע״י {detail.author_name ?? 'משתמש'}</>
                ) : (
                  <>
                    {detail.author_name ?? 'משתמש'}
                    {detail.author_callsign ? (
                      <>
                        {' '}
                        · או״ק{' '}
                        <span className={monoClass(detail.author_callsign)}>{detail.author_callsign}</span>
                      </>
                    ) : null}
                  </>
                )}
                {' · '}
                {formatDateTime(detail.created_at)}
                {detail.page_path ? (
                  <>
                    {' · '}
                    <span dir="ltr">{detail.page_path}</span>
                  </>
                ) : null}
              </p>
            </div>

            {!isFeedbackTask(detail) && detail.sms_sent_at ? (
              <p className="t-caption text-secondary board-detail__sms">
                {detail.sms_sent_inferred
                  ? 'סומן כטופל לפני שהמערכת תיעדה הודעות SMS, ולכן נחשב כאילו השולח כבר עודכן. לא יישלח SMS נוסף.'
                  : `השולח קיבל SMS שהמשוב טופל ב־${formatDateTime(detail.sms_sent_at)}. לא יישלח SMS נוסף.`}
              </p>
            ) : null}
            {detail.body ? <p className="t-body board-detail__body">{detail.body}</p> : null}
            {detail.signed_url ? (
              <audio className="feedback-record__audio" controls src={detail.signed_url} />
            ) : null}
            {detail.audio_storage_path ? (
              <div className="stack-2">
                <p className="t-label text-secondary">תמלול</p>
                {detail.transcript ? (
                  <p className="t-body board-detail__body">{detail.transcript}</p>
                ) : (
                  <p className="t-caption text-muted">{transcriptErrors[detail.id] ?? 'מתמלל…'}</p>
                )}
              </div>
            ) : null}
            {detail.attachments.length > 0 ? (
              <ul className="board-detail__files">
                {detail.attachments.map((file) => (
                  <li key={file.path}>
                    {file.kind === 'image' &&
                    file.signed_url &&
                    !file.mime.includes('heic') &&
                    !file.mime.includes('heif') ? (
                      <a href={file.signed_url} target="_blank" rel="noopener noreferrer">
                        <img
                          className="board-detail__thumb"
                          src={file.signed_url}
                          alt={file.name}
                          width={160}
                          height={120}
                        />
                      </a>
                    ) : file.kind === 'video' && file.signed_url ? (
                      <video className="board-detail__video" controls src={file.signed_url} width={320} height={180} />
                    ) : file.signed_url ? (
                      <a className="t-body" href={file.signed_url} target="_blank" rel="noopener noreferrer">
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

            <div className="board-detail__fields">
              <SelectField
                label="סטטוס"
                value={detail.status}
                options={STATUS_OPTIONS}
                onChange={(event) => {
                  const status = event.target.value as FeedbackStatus
                  if (status !== detail.status) requestMove(detail, status, 0, false)
                }}
              />
              <SelectField
                label="אחראי"
                value={detail.assignee_id ?? FEEDBACK_ASSIGNEE_NONE}
                options={feedbackAssigneeOptions(assignees, detail.assignee_id)}
                onChange={(event) => {
                  const value = event.target.value
                  void assign(detail, value === FEEDBACK_ASSIGNEE_NONE ? null : value)
                }}
              />
            </div>

            <div className="stack-2">
              <TextAreaField
                label="הערה פנימית"
                hint="רק מנהלי הלוח רואים את ההערה. השולח לא רואה אותה."
                rows={3}
                maxLength={FEEDBACK_BODY_MAX}
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
              />
              <div>
                <Button
                  variant="secondary"
                  loading={savingNote}
                  loadingLabel="שומר…"
                  disabled={noteDraft.trim() === (detail.board_note ?? '')}
                  onClick={() => void saveNote()}
                >
                  שמירת הערה
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </Dialog>

      <AlertDialog
        open={pendingFixed !== null}
        status="accent"
        title="לסמן כטופל?"
        onClose={() => setPendingFixed(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPendingFixed(null)}>
              ביטול
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                const pending = pendingFixed
                setPendingFixed(null)
                if (pending) void move(pending.item, 'fixed', pending.index, { notifyAuthor: false, focus: true })
              }}
            >
              בלי SMS
            </Button>
            <Button
              onClick={() => {
                const pending = pendingFixed
                setPendingFixed(null)
                if (pending) void move(pending.item, 'fixed', pending.index, { notifyAuthor: true, focus: true })
              }}
            >
              שליחת SMS
            </Button>
          </>
        }
      >
        <p className="t-body">
          {pendingFixed?.item.author_name ?? 'השולח'} יקבל SMS שהמשוב שלו טופל.
        </p>
      </AlertDialog>

      <AlertDialog
        open={Boolean(confirmDelete)}
        status="danger"
        title={confirmDelete && isFeedbackTask(confirmDelete) ? 'למחוק את המשימה?' : 'למחוק את המשוב?'}
        busy={Boolean(confirmDelete && busyIds.has(confirmDelete.id))}
        onClose={() => setConfirmDelete(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
              ביטול
            </Button>
            <Button
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
            <Button type="submit" form={formId} loading={savingDraft} loadingLabel={draft?.id ? 'שומר…' : 'מוסיף…'}>
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
                (draft.title.trim().length > FEEDBACK_TASK_TITLE_MAX ? FEEDBACK_TASK_TITLE_LEN_ERROR : undefined)
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
    </div>
  )
}

function FragmentWithLine({ line, children }: { line: boolean; children: ReactNode }) {
  return (
    <>
      {line ? <li className="board-col__line" aria-hidden="true" /> : null}
      {children}
    </>
  )
}
