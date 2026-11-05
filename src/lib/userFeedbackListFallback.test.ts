import { describe, expect, it, vi } from 'vitest'

// Mimics the live database before the task-board migration: title/assignee_id
// do not exist (42703, reported first) and in_progress is not a status (22P02).
const calls: { select: string; statuses: string[] | null }[] = []

vi.mock('./supabase', () => ({
  supabase: {
    from: () => {
      const state = { select: '', statuses: null as string[] | null }
      const builder = {
        select(columns: string) {
          state.select = columns
          return builder
        },
        order() {
          return builder
        },
        in(_column: string, values: string[]) {
          state.statuses = values
          return builder
        },
        then(resolve: (value: unknown) => void) {
          calls.push({ ...state })
          if (/\btitle\b/.test(state.select)) {
            resolve({
              data: null,
              error: { code: '42703', message: 'column user_feedback.title does not exist' },
            })
          } else if (state.statuses?.includes('in_progress')) {
            resolve({
              data: null,
              error: {
                code: '22P02',
                message: 'invalid input value for enum user_feedback_status: "in_progress"',
              },
            })
          } else {
            resolve({ data: [], error: null })
          }
        },
      }
      return builder
    },
  },
}))

const { listUserFeedback } = await import('./userFeedback')

describe('listUserFeedback before the task-board migration', () => {
  it('loads the default view when both the task columns and in_progress are missing', async () => {
    calls.length = 0
    await expect(listUserFeedback('active')).resolves.toEqual([])
    expect(calls.at(-1)?.statuses).toEqual(['open'])
    expect(calls.at(-1)?.select).not.toMatch(/\btitle\b/)
  })
})
