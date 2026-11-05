// DEV-ONLY harness: renders the REAL FeedbackInboxPage with an in-memory data boundary
// (the page's `api` prop), so the task board can be clicked through without logging in.
// Served at /feedback-board-dev.html?state=<name>. Not part of the app bundle.
//
// States: board · empty · loading · error · save_error. Changes live until reload.

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ToastProvider } from '../components/ui/Toast'
import { FeedbackInboxPage, type FeedbackInboxApi } from '../pages/FeedbackInboxPage'
import type { FeedbackAssignee, UserFeedback } from '../lib/userFeedback'
import '../index.css'

const STATES = ['board', 'empty', 'loading', 'error', 'save_error'] as const
type DevState = (typeof STATES)[number]

const params = new URLSearchParams(window.location.search)
const state: DevState = (STATES as readonly string[]).includes(params.get('state') ?? '')
  ? (params.get('state') as DevState)
  : 'board'

const OMRI = 'dev-omri'
const SAAR = 'dev-saar'

const assignees: FeedbackAssignee[] = [
  { id: OMRI, full_name: 'עמרי (דמו)' },
  { id: SAAR, full_name: 'סער (דמו)' },
]

function row(partial: Partial<UserFeedback> & Pick<UserFeedback, 'id' | 'created_at'>): UserFeedback {
  return {
    user_id: 'dev-user',
    author_name: 'מתנדב (דמו)',
    author_callsign: '123',
    kind: 'bug',
    title: null,
    assignee_id: null,
    body: null,
    page_path: '/events',
    status: 'open',
    audio_storage_path: null,
    audio_mime_type: null,
    audio_byte_size: null,
    transcript: null,
    transcribed_at: null,
    attachments: [],
    signed_url: null,
    ...partial,
  }
}

let rows: UserFeedback[] =
  state === 'empty'
    ? []
    : [
        row({
          id: 'f1',
          created_at: '2026-11-04T18:20:00Z',
          body: 'משוב לדוגמה: המפה לא נטענת אחרי שמירת אירוע.',
        }),
        row({
          id: 'f2',
          created_at: '2026-11-03T09:05:00Z',
          kind: 'suggestion',
          body: 'הצעה לדוגמה: להוסיף סינון לפי כביש.',
          status: 'in_progress',
          assignee_id: SAAR,
        }),
        row({
          id: 't1',
          created_at: '2026-11-05T07:30:00Z',
          user_id: OMRI,
          author_name: 'עמרי (דמו)',
          author_callsign: null,
          kind: null,
          title: 'משימה לדוגמה: לבדוק את טופס הסיום באנדרואיד',
          page_path: null,
          assignee_id: OMRI,
        }),
        row({
          id: 'f3',
          created_at: '2026-10-30T12:00:00Z',
          body: 'משוב לדוגמה שכבר טופל.',
          status: 'fixed',
        }),
      ]

const never = new Promise<never>(() => {})
const wait = () => new Promise((resolve) => setTimeout(resolve, 300))
const saveFails = state === 'save_error'
const SAVE_ERROR = { ok: false as const, error: 'השליחה נכשלה. בדקו את החיבור ונסו שוב.' }

const api: FeedbackInboxApi = {
  async listUserFeedback(status) {
    if (state === 'loading') return never
    await wait()
    if (state === 'error') throw new Error('dev error')
    const sorted = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at))
    return !status || status === 'all' ? sorted : sorted.filter((item) => item.status === status)
  },
  async transcribeUserFeedback() {
    return { ok: false, error: 'אין תמלול במסך הפיתוח.' }
  },
  async updateUserFeedbackStatus(id, status) {
    await wait()
    if (saveFails) return SAVE_ERROR
    rows = rows.map((item) => (item.id === id ? { ...item, status } : item))
    return { ok: true, sms: 'skipped' }
  },
  async deleteUserFeedback({ id }) {
    await wait()
    if (saveFails) return SAVE_ERROR
    rows = rows.filter((item) => item.id !== id)
    return { ok: true }
  },
  async listFeedbackAssignees() {
    return assignees
  },
  async setUserFeedbackAssignee(id, assigneeId) {
    await wait()
    if (saveFails) return SAVE_ERROR
    rows = rows.map((item) => (item.id === id ? { ...item, assignee_id: assigneeId } : item))
    return { ok: true }
  },
  async createFeedbackTask({ title, body, assigneeId }) {
    await wait()
    if (saveFails) return SAVE_ERROR
    rows = [
      row({
        id: `t${Date.now()}`,
        created_at: new Date().toISOString(),
        user_id: OMRI,
        author_name: 'עמרי (דמו)',
        author_callsign: null,
        kind: null,
        title: title.trim(),
        body: body.trim() || null,
        page_path: null,
        assignee_id: assigneeId,
      }),
      ...rows,
    ]
    return { ok: true }
  },
}

function DevBar() {
  return (
    <nav
      aria-label="מצבי פיתוח"
      className="t-caption"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 'var(--space-2)',
        padding: 'var(--space-2) var(--space-3)',
        marginBlockEnd: 'var(--space-4)',
        border: '1px dashed var(--stroke-strong)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <span>מסך פיתוח: עמוד המשוב האמיתי עם נתונים מדומים:</span>
      {STATES.map((s) => (
        <a key={s} href={`?state=${s}`} aria-current={s === state ? 'page' : undefined}>
          {s}
        </a>
      ))}
    </nav>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <div className="shell dev-shell" data-theme="field">
        <main className="shell__main">
          <DevBar />
          <FeedbackInboxPage api={api} />
        </main>
      </div>
    </ToastProvider>
  </StrictMode>,
)
