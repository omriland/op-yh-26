import {
  FEEDBACK_STATUS_STAMP,
  filterFeedbackByAssignee,
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
 * Tasks never text, and a submitter is texted at most once: an item already
 * texted moves without the question.
 */
export function boardMoveNeedsSmsConfirm(
  item: Pick<UserFeedback, 'title' | 'status' | 'sms_sent_at'>,
  to: FeedbackStatus,
): boolean {
  return to === 'fixed' && item.status !== 'fixed' && !item.title && !item.sms_sent_at
}
