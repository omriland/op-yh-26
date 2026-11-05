import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  FEEDBACK_ASSIGNEE_ALL,
  FEEDBACK_ASSIGNEE_NONE,
  FEEDBACK_BODY_ERROR,
  FEEDBACK_BODY_MAX,
  FEEDBACK_STATUS_STAMP,
  FEEDBACK_TASK_TITLE_ERROR,
  FEEDBACK_TASK_TITLE_LEN_ERROR,
  FEEDBACK_TASK_TITLE_MAX,
  feedbackHeading,
  feedbackTaskError,
  filterFeedbackByAssignee,
  isFeedbackTask,
  isMissingFeedbackTaskColumns,
} from './userFeedback'

const srcDir = resolve(import.meta.dirname)

describe('feedback task status', () => {
  it('labels in progress as בטיפול with the partial tone', () => {
    expect(FEEDBACK_STATUS_STAMP.in_progress).toEqual({ label: 'בטיפול', tone: 'partial' })
  })
})

describe('feedbackTaskError', () => {
  it('requires a title', () => {
    expect(feedbackTaskError({ title: '   ', body: 'פירוט' })).toBe(FEEDBACK_TASK_TITLE_ERROR)
  })

  it('caps the title at 120 characters', () => {
    expect(feedbackTaskError({ title: 'א'.repeat(FEEDBACK_TASK_TITLE_MAX), body: '' })).toBeUndefined()
    expect(feedbackTaskError({ title: 'א'.repeat(FEEDBACK_TASK_TITLE_MAX + 1), body: '' })).toBe(
      FEEDBACK_TASK_TITLE_LEN_ERROR,
    )
  })

  it('keeps the 2000 character body limit', () => {
    expect(feedbackTaskError({ title: 'משימה', body: 'א'.repeat(FEEDBACK_BODY_MAX + 1) })).toBe(
      FEEDBACK_BODY_ERROR,
    )
  })

  it('accepts a title with no body', () => {
    expect(feedbackTaskError({ title: 'לתקן את המפה', body: '' })).toBeUndefined()
  })
})

describe('feedback task heading', () => {
  it('shows the title of a task and the kind of submitted feedback', () => {
    expect(feedbackHeading({ title: 'לתקן את המפה', kind: null })).toBe('לתקן את המפה')
    expect(feedbackHeading({ title: null, kind: 'bug' })).toBe('באג')
    expect(isFeedbackTask({ title: 'לתקן את המפה' })).toBe(true)
    expect(isFeedbackTask({ title: null })).toBe(false)
  })
})

describe('filterFeedbackByAssignee', () => {
  const rows = [
    { id: 'a', assignee_id: 'omri' },
    { id: 'b', assignee_id: null },
    { id: 'c', assignee_id: 'saar' },
  ]

  it('returns every row for all', () => {
    expect(filterFeedbackByAssignee(rows, FEEDBACK_ASSIGNEE_ALL).map((row) => row.id)).toEqual([
      'a',
      'b',
      'c',
    ])
  })

  it('returns unassigned rows for none', () => {
    expect(filterFeedbackByAssignee(rows, FEEDBACK_ASSIGNEE_NONE).map((row) => row.id)).toEqual([
      'b',
    ])
  })

  it('returns one assignee rows for a profile id', () => {
    expect(filterFeedbackByAssignee(rows, 'saar').map((row) => row.id)).toEqual(['c'])
  })
})

describe('isMissingFeedbackTaskColumns', () => {
  it('detects the columns the task-board migration adds', () => {
    expect(
      isMissingFeedbackTaskColumns({
        code: '42703',
        message: 'column user_feedback.title does not exist',
      }),
    ).toBe(true)
    expect(
      isMissingFeedbackTaskColumns({
        code: '42703',
        message: 'column user_feedback.assignee_id does not exist',
      }),
    ).toBe(true)
    expect(
      isMissingFeedbackTaskColumns({
        code: '42703',
        message: 'column user_feedback.transcript does not exist',
      }),
    ).toBe(false)
    expect(isMissingFeedbackTaskColumns(null)).toBe(false)
  })
})

describe('feedback task-board migration', () => {
  const sql = readFileSync(
    resolve(srcDir, '../../supabase/migrations/20261105120000_feedback_task_board.sql'),
    'utf8',
  )

  it('adds in_progress, a title and a super-admin assignee', () => {
    expect(sql).toContain("add value if not exists 'in_progress'")
    expect(sql).toContain('add column if not exists title text')
    expect(sql).toMatch(/assignee_id uuid references public\.profiles \(id\) on delete set null/)
    expect(sql).toContain('alter column kind drop not null')
    expect(sql).toContain('check (kind is not null or title is not null)')
  })

  it('lets a submitter insert only open, unassigned, untitled feedback', () => {
    expect(sql).toContain(
      "(status = 'open' and assignee_id is null and title is null and kind is not null)",
    )
  })

  it('keeps status, assignee and tasks writable by super admins only', () => {
    const update = sql.slice(sql.indexOf('create policy user_feedback_update'))
    expect(update).toContain("using (public.has_role(auth.uid(), 'super_admin'))")
    expect(sql.match(/public\.has_role\(assignee_id, 'super_admin'\)/g)).toHaveLength(2)
  })

  it('lists assignees for super admins only', () => {
    expect(sql).toContain('create or replace function public.feedback_assignees()')
    expect(sql).toContain('security definer')
    expect(sql).toContain("where public.has_role(auth.uid(), 'super_admin')")
    expect(sql).toContain('revoke all on function public.feedback_assignees() from public')
  })
})
