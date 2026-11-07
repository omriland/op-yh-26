import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  BOARD_COLUMNS,
  BOARD_POSITION_STEP,
  boardCardExcerpt,
  boardColumnLabel,
  boardColumns,
  boardDropIndex,
  boardMoveNeedsSmsConfirm,
  boardSortKey,
  isFinishedColumn,
  planBoardMove,
  sortBoardColumn,
} from './feedbackBoard'
import {
  FEEDBACK_ALL_COLUMN_GROUPS,
  feedbackSelect,
  isMissingFeedbackBoardTable,
  missingFeedbackColumnGroup,
  type FeedbackStatus,
} from './userFeedback'

type Card = {
  id: string
  board_position: number | null
  created_at: string
  status: FeedbackStatus
  assignee_id: string | null
}

function card(id: string, created_at: string, extra: Partial<Card> = {}): Card {
  return { id, created_at, board_position: null, status: 'open', assignee_id: null, ...extra }
}

const keysOf = (column: Card[], plan: ReturnType<typeof planBoardMove>) => {
  const positions = new Map(plan.positions.map((entry) => [entry.id, entry.position]))
  return sortBoardColumn(
    column.map((item) =>
      positions.has(item.id) ? { ...item, board_position: positions.get(item.id) ?? null } : item,
    ),
  ).map((item) => item.id)
}

describe('board columns', () => {
  it('has four columns in the stamp order with the stamp labels', () => {
    expect(BOARD_COLUMNS).toEqual(['open', 'in_progress', 'fixed', 'wont_do'])
    expect(BOARD_COLUMNS.map(boardColumnLabel)).toEqual(['פתוח', 'בטיפול', 'טופל', 'לא יטופל'])
  })

  it('treats טופל and לא יטופל as finished', () => {
    expect(BOARD_COLUMNS.filter(isFinishedColumn)).toEqual(['fixed', 'wont_do'])
  })

  it('groups by status and applies the assignee filter', () => {
    const items = [
      card('a', '2026-11-01T10:00:00Z'),
      card('b', '2026-11-02T10:00:00Z', { status: 'in_progress', assignee_id: 'saar' }),
      card('c', '2026-11-03T10:00:00Z', { status: 'in_progress', assignee_id: 'omri' }),
    ]
    const all = boardColumns(items, 'all')
    expect(all.open.map((item) => item.id)).toEqual(['a'])
    expect(all.in_progress.map((item) => item.id)).toEqual(['c', 'b'])
    expect(all.fixed).toEqual([])
    expect(boardColumns(items, 'saar').in_progress.map((item) => item.id)).toEqual(['b'])
    expect(boardColumns(items, 'none').in_progress).toEqual([])
  })
})

describe('board ordering', () => {
  it('puts unmoved cards newest first', () => {
    const sorted = sortBoardColumn([
      card('old', '2026-11-01T10:00:00Z'),
      card('new', '2026-11-05T10:00:00Z'),
      card('mid', '2026-11-03T10:00:00Z'),
    ])
    expect(sorted.map((item) => item.id)).toEqual(['new', 'mid', 'old'])
  })

  it('sorts moved and unmoved cards on one scale', () => {
    const newest = card('newest', '2026-11-06T10:00:00Z')
    const moved = card('moved', '2026-11-01T10:00:00Z', {
      board_position: boardSortKey(newest) - BOARD_POSITION_STEP,
    })
    expect(sortBoardColumn([newest, moved]).map((item) => item.id)).toEqual(['moved', 'newest'])
  })

  it('lands new feedback above cards that were moved earlier', () => {
    const moved = card('moved', '2026-11-01T10:00:00Z', {
      board_position: -Date.parse('2026-11-04T10:00:00Z'),
    })
    const fresh = card('fresh', '2026-11-06T10:00:00Z')
    expect(sortBoardColumn([moved, fresh]).map((item) => item.id)).toEqual(['fresh', 'moved'])
  })
})

describe('planBoardMove', () => {
  const column = [
    card('a', '2026-11-05T10:00:00Z'),
    card('b', '2026-11-04T10:00:00Z'),
    card('c', '2026-11-03T10:00:00Z'),
  ]

  it('drops between two cards with a single write', () => {
    const plan = planBoardMove(column, 'x', 1, 'open')
    expect(plan.positions).toHaveLength(1)
    expect(keysOf([...column, card('x', '2026-10-01T00:00:00Z')], plan)).toEqual(['a', 'x', 'b', 'c'])
  })

  it('drops at the top and at the bottom', () => {
    const x = card('x', '2026-10-01T00:00:00Z')
    expect(keysOf([...column, x], planBoardMove(column, 'x', 0, 'open'))).toEqual(['x', 'a', 'b', 'c'])
    expect(keysOf([...column, x], planBoardMove(column, 'x', 3, 'open'))).toEqual(['a', 'b', 'c', 'x'])
  })

  it('clamps an index past the end', () => {
    const x = card('x', '2026-10-01T00:00:00Z')
    expect(keysOf([...column, x], planBoardMove(column, 'x', 99, 'open'))).toEqual(['a', 'b', 'c', 'x'])
  })

  it('reorders within a column, counting the index without the moving card', () => {
    expect(keysOf(column, planBoardMove(column, 'a', 2, 'open'))).toEqual(['b', 'c', 'a'])
    expect(keysOf(column, planBoardMove(column, 'c', 0, 'open'))).toEqual(['c', 'a', 'b'])
    expect(keysOf(column, planBoardMove(column, 'b', 0, 'open'))).toEqual(['b', 'a', 'c'])
  })

  it('places a card in an empty column', () => {
    const plan = planBoardMove([], 'x', 0, 'fixed')
    expect(plan.status).toBe('fixed')
    expect(plan.positions).toHaveLength(1)
    expect(Number.isFinite(plan.positions[0].position)).toBe(true)
  })

  it('respaces the whole column when neighbours cannot be split', () => {
    const tight = [
      card('a', '2026-11-05T10:00:00Z', { board_position: 100 }),
      card('b', '2026-11-04T10:00:00Z', { board_position: 100 }),
    ]
    const plan = planBoardMove(tight, 'x', 1, 'open')
    expect(plan.positions.map((entry) => entry.id)).toEqual(['a', 'x', 'b'])
    const values = plan.positions.map((entry) => entry.position)
    expect(values[0]).toBeLessThan(values[1])
    expect(values[1]).toBeLessThan(values[2])
  })

  it('keeps splitting the same gap many times before respacing', () => {
    let items = [card('a', '2026-11-05T10:00:00Z'), card('b', '2026-11-05T09:00:00Z')]
    for (let i = 0; i < 30; i += 1) {
      const plan = planBoardMove(items, `n${i}`, 1, 'open')
      expect(plan.positions).toHaveLength(1)
      items = sortBoardColumn([...items, { ...card(`n${i}`, '2026-01-01T00:00:00Z'), board_position: plan.positions[0].position }])
    }
    expect(items[0].id).toBe('a')
    expect(items[items.length - 1].id).toBe('b')
  })
})

describe('boardDropIndex', () => {
  const rects = [
    { top: 0, bottom: 100 },
    { top: 110, bottom: 210 },
  ]

  it('drops before a card when the pointer is above its middle', () => {
    expect(boardDropIndex(rects, 10)).toBe(0)
    expect(boardDropIndex(rects, 60)).toBe(1)
    expect(boardDropIndex(rects, 150)).toBe(1)
    expect(boardDropIndex(rects, 200)).toBe(2)
    expect(boardDropIndex([], 50)).toBe(0)
  })
})

describe('moving to טופל', () => {
  const feedback = { title: null, status: 'open' as FeedbackStatus, sms_sent_at: null }

  it('offers the SMS on the first טופל of submitted feedback', () => {
    expect(boardMoveNeedsSmsConfirm(feedback, 'fixed')).toBe(true)
    expect(boardMoveNeedsSmsConfirm({ ...feedback, status: 'in_progress' }, 'fixed')).toBe(true)
  })

  it('does not offer it again once the submitter was texted, even after a reopen', () => {
    const reopened = { ...feedback, status: 'open' as FeedbackStatus, sms_sent_at: '2026-11-06T08:00:00Z' }
    expect(boardMoveNeedsSmsConfirm(reopened, 'fixed')).toBe(false)
  })

  it('never asks for a task, a card already טופל, or another column', () => {
    expect(boardMoveNeedsSmsConfirm({ ...feedback, title: 'משימה' }, 'fixed')).toBe(false)
    expect(boardMoveNeedsSmsConfirm({ ...feedback, status: 'fixed' }, 'fixed')).toBe(false)
    expect(boardMoveNeedsSmsConfirm(feedback, 'wont_do')).toBe(false)
  })
})

describe('boardCardExcerpt', () => {
  it('uses the note, then the transcript, on one line', () => {
    expect(boardCardExcerpt({ body: 'שורה\nשנייה', transcript: 'תמלול' })).toBe('שורה שנייה')
    expect(boardCardExcerpt({ body: null, transcript: 'תמלול  קולי' })).toBe('תמלול קולי')
    expect(boardCardExcerpt({ body: null, transcript: null })).toBe('')
  })
})

describe('board table fallback', () => {
  it('embeds the board row and drops it when the table is missing', () => {
    expect(feedbackSelect(FEEDBACK_ALL_COLUMN_GROUPS)).toContain(
      'board:user_feedback_board(position, note, sms_sent_at, sms_sent_inferred)',
    )
    const missing = {
      code: 'PGRST200',
      message: "Could not find a relationship between 'user_feedback' and 'user_feedback_board' in the schema cache",
    }
    expect(isMissingFeedbackBoardTable(missing)).toBe(true)
    expect(missingFeedbackColumnGroup(missing)).toBe('board')
    expect(isMissingFeedbackBoardTable({ code: 'PGRST205', message: "relation 'public.user_feedback_board'" })).toBe(true)
    expect(isMissingFeedbackBoardTable({ code: 'PGRST200', message: 'profiles' })).toBe(false)
  })
})

describe('feedback board migration', () => {
  const sql = readFileSync(
    resolve(import.meta.dirname, '../../supabase/migrations/20261107120000_feedback_board_cards.sql'),
    'utf8',
  )

  it('adds a side table and leaves user_feedback alone', () => {
    expect(sql).toMatch(/create table if not exists public\.user_feedback_board/)
    expect(sql).not.toMatch(/alter table public\.user_feedback\b(?!_board)/)
    expect(sql).not.toMatch(/on public\.user_feedback\s+for/)
  })

  it('cascades with its feedback so account deletion needs no change', () => {
    expect(sql).toMatch(/references public\.user_feedback \(id\) on delete cascade/)
  })

  it('is super admin only for every operation, so a submitter never reads the note', () => {
    expect(sql).toMatch(/for all to authenticated\s+using \(public\.has_role\(auth\.uid\(\), 'super_admin'\)\)\s+with check \(public\.has_role\(auth\.uid\(\), 'super_admin'\)\)/)
    expect(sql).toMatch(/enable row level security/)
  })

  it('keeps the SMS record server-only and backfills feedback treated before it', () => {
    expect(sql).toMatch(/sms_sent_at timestamptz/)
    expect(sql).toMatch(/auth\.uid\(\) is not null and/)
    expect(sql).toMatch(/user_feedback_board_sms_server_only/)
    expect(sql).toMatch(/select f\.id, f\.updated_at, true\s+from public\.user_feedback f\s+where f\.status = 'fixed'\s+and f\.title is null\s+on conflict \(feedback_id\) do nothing/)
  })

  it('caps the note like the feedback body', () => {
    expect(sql).toMatch(/char_length\(note\) <= 2000/)
  })
})
