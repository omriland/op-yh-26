import {
  FEEDBACK_STATUS_STAMP,
  filterFeedbackByAssignee,
  type FeedbackAssignee,
  type FeedbackStatus,
  type UserFeedback,
} from './userFeedback'

/** Board columns in reading order (inline-start first). Labels are the stamp labels. */
export const BOARD_COLUMNS: readonly FeedbackStatus[] = ['open', 'in_progress', 'fixed', 'wont_do']

export function boardColumnLabel(status: FeedbackStatus): string {
  return FEEDBACK_STATUS_STAMP[status].label
}

/** Finished columns show this many cards until "הצגת עוד". */
export const BOARD_FINISHED_LIMIT = 20

export function isFinishedColumn(status: FeedbackStatus): boolean {
  return status === 'fixed' || status === 'wont_do'
}

/** Gap left above the top card or below the last one, in the same units as created_at keys (ms). */
export const BOARD_POSITION_STEP = 60_000

type Positioned = Pick<UserFeedback, 'id' | 'board_position' | 'created_at'>

/**
 * Lower sorts first. A card nobody moved sorts by submission time, newest first,
 * so new feedback lands at the top of פתוח. Moved cards share the same scale.
 */
export function boardSortKey(item: Positioned): number {
  if (item.board_position !== null && Number.isFinite(item.board_position)) return item.board_position
  return -Date.parse(item.created_at)
}

export function sortBoardColumn<T extends Positioned>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => boardSortKey(a) - boardSortKey(b) || a.id.localeCompare(b.id))
}

/** Cards per column after the assignee filter, each column in board order. */
export function boardColumns<T extends Positioned & Pick<UserFeedback, 'status' | 'assignee_id'>>(
  items: readonly T[],
  assigneeFilter: string,
): Record<FeedbackStatus, T[]> {
  const visible = filterFeedbackByAssignee(items, assigneeFilter)
  const columns = {} as Record<FeedbackStatus, T[]>
  for (const status of BOARD_COLUMNS) {
    columns[status] = sortBoardColumn(visible.filter((item) => item.status === status))
  }
  return columns
}

export type BoardMovePlan = {
  status: FeedbackStatus
  /** Every position to write. Usually only the moved card; the whole column when it had to be respaced. */
  positions: { id: string; position: number }[]
}

/**
 * Places `movingId` at `index` of the `target` column. `column` is that column in
 * board order as the viewer sees it, and may still contain the moving card.
 */
export function planBoardMove<T extends Positioned>(
  column: readonly T[],
  movingId: string,
  index: number,
  status: FeedbackStatus,
): BoardMovePlan {
  const others = column.filter((item) => item.id !== movingId)
  const at = Math.max(0, Math.min(index, others.length))
  const before = at > 0 ? boardSortKey(others[at - 1]) : null
  const after = at < others.length ? boardSortKey(others[at]) : null

  let position: number
  if (before === null && after === null) position = -Date.now()
  else if (before === null) position = (after as number) - BOARD_POSITION_STEP
  else if (after === null) position = before + BOARD_POSITION_STEP
  else position = (before + after) / 2

  const fits =
    (before === null || position > before) && (after === null || position < after)
  if (fits) return { status, positions: [{ id: movingId, position }] }

  // Neighbours too close to split: respace the whole column, keeping its order.
  const ordered = [...others.slice(0, at).map((item) => item.id), movingId, ...others.slice(at).map((item) => item.id)]
  const start = others.length > 0 ? boardSortKey(others[0]) : -Date.now()
  return {
    status,
    positions: ordered.map((id, i) => ({ id, position: start + i * BOARD_POSITION_STEP })),
  }
}

/** Where a pointer at `y` drops in a column whose cards span `rects` (top/bottom, in order). */
export function boardDropIndex(
  rects: readonly { top: number; bottom: number }[],
  y: number,
): number {
  for (let i = 0; i < rects.length; i += 1) {
    const middle = (rects[i].top + rects[i].bottom) / 2
    if (y < middle) return i
  }
  return rects.length
}

/** The card's text preview: the note, else the transcript. */
export function boardCardExcerpt(item: Pick<UserFeedback, 'body' | 'transcript'>): string {
  return (item.body ?? item.transcript ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * Submitted feedback moved to טופל texts the submitter, so it is confirmed first.
 * Tasks (no kind) never text — a title on feedback is only a label — and a
 * submitter is texted at most once: an item already texted moves without the question.
 */
export function boardMoveNeedsSmsConfirm(
  item: Pick<UserFeedback, 'kind' | 'status' | 'sms_sent_at'>,
  to: FeedbackStatus,
): boolean {
  return to === 'fixed' && item.status !== 'fixed' && item.kind !== null && !item.sms_sent_at
}

/** Columns a viewer can fold to a strip: the finished ones, folded unless the viewer opened them. */
export const BOARD_COLLAPSIBLE: readonly FeedbackStatus[] = ['fixed', 'wont_do']

export const BOARD_COLLAPSED_KEY = 'yahpaz.feedbackBoard.collapsed'

/**
 * The viewer's folded columns. Stored as `{ fixed: true, wont_do: false }`; anything
 * missing, unreadable or malformed counts as folded, the default.
 */
export function readCollapsedColumns(
  storage: Pick<Storage, 'getItem'> | null,
): Set<FeedbackStatus> {
  const folded = new Set(BOARD_COLLAPSIBLE)
  try {
    const raw = storage?.getItem(BOARD_COLLAPSED_KEY)
    if (!raw) return folded
    const saved: unknown = JSON.parse(raw)
    if (!saved || typeof saved !== 'object') return folded
    const flags = saved as Record<string, unknown>
    return new Set(BOARD_COLLAPSIBLE.filter((status) => flags[status] !== false))
  } catch {
    return folded
  }
}

/** Best effort: a private window or blocked storage just forgets the choice. */
export function writeCollapsedColumns(
  storage: Pick<Storage, 'setItem'> | null,
  collapsed: ReadonlySet<FeedbackStatus>,
): void {
  try {
    storage?.setItem(
      BOARD_COLLAPSED_KEY,
      JSON.stringify(Object.fromEntries(BOARD_COLLAPSIBLE.map((status) => [status, collapsed.has(status)]))),
    )
  } catch {
    // Nothing to do: the board still works, folded by default next time.
  }
}

export type BoardCardMenuKey = 'top' | 'bottom' | 'assign' | 'assign_me' | 'delete'

export type BoardCardMenuEntry = { key: BoardCardMenuKey; label: string; disabled?: boolean }

/**
 * The card's ⋮ menu, in order. Status moves live in the card detail (and drag),
 * not here. "שיוך אליי" only when the viewer can be assigned and is not already.
 */
export function boardCardMenu(
  item: Pick<UserFeedback, 'id' | 'assignee_id'>,
  column: readonly Pick<UserFeedback, 'id'>[],
  viewerId: string | null,
  assignees: readonly FeedbackAssignee[],
): BoardCardMenuEntry[] {
  const at = column.findIndex((row) => row.id === item.id)
  const viewerAssignable = assignees.some((person) => person.id === viewerId && person.assignable)
  return [
    { key: 'top', label: 'העברה לראש העמודה', disabled: at <= 0 },
    { key: 'bottom', label: 'העברה לתחתית העמודה', disabled: at < 0 || at >= column.length - 1 },
    { key: 'assign', label: 'שיוך' },
    ...(viewerAssignable && item.assignee_id !== viewerId
      ? [{ key: 'assign_me' as const, label: 'שיוך אליי' }]
      : []),
    { key: 'delete', label: 'מחיקה' },
  ]
}

/** Index (among the other cards) that puts a card at the top or bottom of its column. */
export function boardEdgeIndex(column: readonly unknown[], edge: 'top' | 'bottom'): number {
  return edge === 'top' ? 0 : Math.max(0, column.length - 1)
}

export type BoardAssignChoice = { id: string | null; label: string; checked: boolean; disabled?: boolean }

/**
 * The שיוך submenu: every active super admin, the current assignee marked; someone
 * who lost the role still shows (checked, not choosable); "ללא שיוך" once assigned.
 */
export function boardAssignChoices(
  item: Pick<UserFeedback, 'assignee_id'>,
  assignees: readonly FeedbackAssignee[],
): BoardAssignChoice[] {
  const choices: BoardAssignChoice[] = assignees
    .filter((person) => person.assignable)
    .map((person) => ({ id: person.id, label: person.full_name, checked: person.id === item.assignee_id }))
  if (item.assignee_id && !choices.some((choice) => choice.checked)) {
    const stored = assignees.find((person) => person.id === item.assignee_id)
    choices.push({
      id: item.assignee_id,
      label: `${stored?.full_name ?? 'משתמש'} (לא פעיל)`,
      checked: true,
      disabled: true,
    })
  }
  if (item.assignee_id) choices.push({ id: null, label: 'ללא שיוך', checked: false })
  return choices
}
