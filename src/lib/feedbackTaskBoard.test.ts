import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  markFeedbackTreated,
  type MarkTreatedRow,
} from '../../supabase/functions/_shared/feedbackMarkTreated'
import {
  FEEDBACK_ASSIGNEE_ALL,
  FEEDBACK_ASSIGNEE_NONE,
  FEEDBACK_BODY_ERROR,
  FEEDBACK_BODY_MAX,
  FEEDBACK_DELETE_ERROR,
  FEEDBACK_TASK_SAVE_ERROR,
  FEEDBACK_UPDATE_ERROR,
  FEEDBACK_STATUS_STAMP,
  FEEDBACK_TASK_TITLE_ERROR,
  FEEDBACK_TASK_TITLE_LEN_ERROR,
  FEEDBACK_TASK_TITLE_MAX,
  FEEDBACK_ALL_COLUMN_GROUPS,
  feedbackAssigneeFilterOptions,
  feedbackAssigneeOptions,
  feedbackHeading,
  feedbackMatchesFilter,
  feedbackSelect,
  feedbackTaskError,
  missingFeedbackColumnGroup,
  sortFeedbackForBoard,
  type FeedbackAssignee,
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

  it('starts every insert open, and lets a submitter insert only unassigned, untitled feedback', () => {
    const insert = sql.slice(
      sql.indexOf('create policy user_feedback_insert'),
      sql.indexOf('create policy user_feedback_update'),
    )
    expect(insert).toMatch(/user_id = auth\.uid\(\)\s+and status = 'open'/)
    expect(insert).toContain('(assignee_id is null and title is null and kind is not null)')
    expect(insert).toContain("or public.has_role(auth.uid(), 'super_admin')")
  })

  it('keeps status, assignee and tasks writable by super admins only', () => {
    const update = sql.slice(sql.indexOf('create policy user_feedback_update'))
    expect(update).toContain("using (public.has_role(auth.uid(), 'super_admin'))")
  })

  it('checks the assignee only when it changes', () => {
    expect(sql).toContain("(tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id)")
    expect(sql).toContain("not public.has_role(new.assignee_id, 'super_admin')")
    expect(sql).toContain('before insert or update of assignee_id on public.user_feedback')
  })

  it('lets a task change its title and body but keeps submitted feedback locked', () => {
    expect(sql).toContain('create or replace function public.user_feedback_lock_identity()')
    expect(sql).toContain('(old.title is null and new.body is distinct from old.body)')
    expect(sql).toContain('(old.title is null and new.title is not null)')
    expect(sql).toContain('new.attachments is distinct from old.attachments')
  })

  it('lists assignees for super admins only', () => {
    expect(sql).toContain('create or replace function public.feedback_assignees()')
    expect(sql).toContain('security definer')
    expect(sql).toContain("where public.has_role(auth.uid(), 'super_admin')")
    expect(sql).toContain('revoke all on function public.feedback_assignees() from public')
    expect(sql).toContain('as assignable')
    const drop = sql.indexOf('drop function if exists public.feedback_assignees();')
    expect(drop).toBeGreaterThan(-1)
    expect(drop).toBeLessThan(sql.indexOf('create or replace function public.feedback_assignees()'))
  })
})

describe('board failure copy', () => {
  const lib = readFileSync(resolve(srcDir, 'userFeedback.ts'), 'utf8')

  function body(name: string) {
    const start = lib.indexOf(`function ${name}(`)
    return lib.slice(start, lib.indexOf('\n}\n', start))
  }

  it('says the update or delete failed, not that sending failed', () => {
    expect(FEEDBACK_UPDATE_ERROR).toBe('העדכון נכשל. נסו שוב.')
    expect(FEEDBACK_DELETE_ERROR).toBe('המחיקה נכשלה. נסו שוב.')
    expect(FEEDBACK_TASK_SAVE_ERROR).toBe('שמירת המשימה נכשלה. נסו שוב.')
    for (const name of ['updateFeedbackStatusRow', 'setUserFeedbackAssignee']) {
      expect(body(name)).toContain('FEEDBACK_UPDATE_ERROR')
      expect(body(name)).not.toContain('FEEDBACK_NETWORK')
    }
    expect(body('deleteUserFeedback')).toContain('FEEDBACK_DELETE_ERROR')
    for (const name of ['createFeedbackTask', 'updateFeedbackTask']) {
      expect(body(name)).toContain('FEEDBACK_TASK_SAVE_ERROR')
      expect(body(name)).not.toContain('FEEDBACK_NETWORK')
    }
  })
})

describe('board view', () => {
  it('shows open and in progress together by default', () => {
    expect(feedbackMatchesFilter('open', 'active')).toBe(true)
    expect(feedbackMatchesFilter('in_progress', 'active')).toBe(true)
    expect(feedbackMatchesFilter('fixed', 'active')).toBe(false)
    expect(feedbackMatchesFilter('fixed', 'all')).toBe(true)
    expect(feedbackMatchesFilter('wont_do', 'fixed')).toBe(false)
  })

  it('puts in progress first, then newest first', () => {
    const sorted = sortFeedbackForBoard([
      { id: 'old-open', status: 'open' as const, created_at: '2026-11-01T00:00:00Z' },
      { id: 'new-open', status: 'open' as const, created_at: '2026-11-04T00:00:00Z' },
      { id: 'old-progress', status: 'in_progress' as const, created_at: '2026-10-01T00:00:00Z' },
    ])
    expect(sorted.map((row) => row.id)).toEqual(['old-progress', 'new-open', 'old-open'])
  })
})

describe('assignee options', () => {
  const people: FeedbackAssignee[] = [
    { id: 'omri', full_name: 'עמרי', assignable: true },
    { id: 'former', full_name: 'דני', assignable: false },
  ]

  it('offers only assignable people, plus the stored one marked לא פעיל', () => {
    expect(feedbackAssigneeOptions(people, null).map((option) => option.label)).toEqual([
      'לא משויך',
      'עמרי',
    ])
    expect(feedbackAssigneeOptions(people, 'former').map((option) => option.label)).toEqual([
      'לא משויך',
      'עמרי',
      'דני (לא פעיל)',
    ])
    expect(feedbackAssigneeOptions([], 'gone').at(-1)).toEqual({
      value: 'gone',
      label: 'משתמש (לא פעיל)',
    })
  })

  it('lists everyone holding rows in the filter', () => {
    expect(feedbackAssigneeFilterOptions(people).map((option) => option.label)).toEqual([
      'כל האחראים',
      'לא משויך',
      'עמרי',
      'דני (לא פעיל)',
    ])
  })
})

describe('feedback select fallback', () => {
  it('drops each missing column group on its own', () => {
    expect(feedbackSelect(FEEDBACK_ALL_COLUMN_GROUPS)).toContain('title, assignee_id')
    expect(feedbackSelect(['attachments'])).not.toContain('title')
    expect(feedbackSelect(['attachments'])).not.toContain('transcript')
    expect(
      missingFeedbackColumnGroup({ code: '42703', message: 'column user_feedback.title does not exist' }),
    ).toBe('task')
    expect(
      missingFeedbackColumnGroup({
        code: '42703',
        message: 'column user_feedback.transcript does not exist',
      }),
    ).toBe('transcript')
    expect(
      missingFeedbackColumnGroup({
        code: '42703',
        message: 'column user_feedback.attachments does not exist',
      }),
    ).toBe('attachments')
    expect(missingFeedbackColumnGroup({ code: '42501', message: 'permission denied' })).toBeNull()
  })
})

describe('mark_treated', () => {
  function deps() {
    return {
      setFixed: vi.fn(async () => true),
      smsDestination: vi.fn((phone: string | null) => (phone ? '972501234567' : null)),
      sendSms: vi.fn(async () => true),
    }
  }

  const feedback: MarkTreatedRow = {
    status: 'open',
    title: null,
    body: 'המפה לא נטענת',
    audio_storage_path: null,
    author: { full_name: 'דני כהן', phone: '0501234567' },
  }

  it('never texts anyone when a task is marked טופל', async () => {
    for (const status of ['open', 'in_progress', 'wont_do', 'fixed']) {
      const d = deps()
      const result = await markFeedbackTreated({ ...feedback, status, title: 'לבדוק את המפה' }, d)
      expect(result).toEqual({ ok: true, sms: 'skipped' })
      expect(d.sendSms).not.toHaveBeenCalled()
      expect(d.setFixed).toHaveBeenCalledTimes(status === 'fixed' ? 0 : 1)
    }
  })

  it('still texts the submitter of feedback once', async () => {
    const d = deps()
    expect(await markFeedbackTreated(feedback, d)).toEqual({ ok: true, sms: 'sent' })
    expect(d.sendSms).toHaveBeenCalledTimes(1)
    const repeat = deps()
    await markFeedbackTreated({ ...feedback, status: 'fixed' }, repeat)
    expect(repeat.sendSms).not.toHaveBeenCalled()
  })

  it('reports a failed status update without texting', async () => {
    const d = deps()
    d.setFixed.mockResolvedValueOnce(false)
    expect(await markFeedbackTreated(feedback, d)).toEqual({ ok: false })
    expect(d.sendSms).not.toHaveBeenCalled()
  })
})

describe('user-feedback edge function', () => {
  const edge = readFileSync(
    resolve(srcDir, '../../supabase/functions/user-feedback/index.ts'),
    'utf8',
  )

  it('loads the title and routes mark_treated through the task-aware helper', () => {
    expect(edge).toContain('"id, title, body, status, audio_storage_path, author:')
    expect(edge).toContain('await markFeedbackTreated(')
    expect(edge).not.toContain('buildFeedbackTreatedSms')
  })
})

describe('account deletion keeps board tasks', () => {
  const sql = readFileSync(
    resolve(srcDir, '../../supabase/migrations/20261105121000_keep_tasks_on_account_deletion.sql'),
    'utf8',
  )
  const original = readFileSync(
    resolve(srcDir, '../../supabase/migrations/20261103180000_account_deletion.sql'),
    'utf8',
  )

  it('deletes only feedback the member sent, with its files', () => {
    expect(sql).toContain('delete from public.user_feedback where user_id = p_user_id and title is null;')
    expect(sql).toContain(
      'where uf.user_id = p_user_id and uf.title is null and uf.audio_storage_path is not null',
    )
    expect(sql).toContain('where uf.user_id = p_user_id and uf.title is null\n')
    expect(sql).not.toMatch(/delete from public\.user_feedback where user_id = p_user_id;/)
  })

  it('changes nothing else in the routine', () => {
    const body = (text: string) =>
      text
        .slice(text.indexOf('create or replace function public.delete_user_account'))
        .replace(/ and (uf\.)?title is null/g, '')
        .replace(/\n {2}-- Feedback the member sent goes;[^\n]*\n {2}-- to the anonymized[^\n]*/, '')
        .trim()
    expect(body(sql)).toBe(body(original))
  })

  it('is re-applied after the original in the local deletion test', () => {
    const test = readFileSync(
      resolve(srcDir, '../../scripts/delete-account/test/delete-account.sql'),
      'utf8',
    )
    expect(test.indexOf('20261105121000_keep_tasks_on_account_deletion.sql')).toBeGreaterThan(
      test.indexOf('20261103180000_account_deletion.sql'),
    )
  })
})
