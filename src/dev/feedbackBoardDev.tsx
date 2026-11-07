// DEV-ONLY harness: renders the REAL FeedbackBoardPage with an in-memory data boundary
// (the page's `api` prop), so the board can be clicked through without logging in.
// Served at /feedback-board-dev.html?state=<name>. Not part of the app bundle.
//
// States: board · empty · loading · error · save_error · no_board_table. Changes live
// until reload. All names and texts are invented; no real feedback appears here.

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ToastProvider } from '../components/ui/Toast'
import { FeedbackBoardPage, type FeedbackBoardApi } from '../pages/FeedbackBoardPage'
import {
  FEEDBACK_BOARD_NOTE_ERROR,
  FEEDBACK_BOARD_ORDER_ERROR,
  FEEDBACK_BOARD_UNAVAILABLE,
  FEEDBACK_DELETE_ERROR,
  FEEDBACK_TASK_SAVE_ERROR,
  FEEDBACK_UPDATE_ERROR,
  type FeedbackAssignee,
  type UserFeedback,
} from '../lib/userFeedback'
import '../index.css'

const STATES = ['board', 'empty', 'loading', 'error', 'save_error', 'no_board_table'] as const
type DevState = (typeof STATES)[number]

const params = new URLSearchParams(window.location.search)
const state: DevState = (STATES as readonly string[]).includes(params.get('state') ?? '')
  ? (params.get('state') as DevState)
  : 'board'

const OMRI = 'dev-omri'
const SAAR = 'dev-saar'

const assignees: FeedbackAssignee[] = [
  { id: OMRI, full_name: 'עמרי ל.', assignable: true },
  { id: SAAR, full_name: 'סער מ.', assignable: true },
]

const DAY = 86_400_000
const now = Date.now()
const ago = (days: number, hours = 0) => new Date(now - days * DAY - hours * 3_600_000).toISOString()

function row(partial: Partial<UserFeedback> & Pick<UserFeedback, 'id'>): UserFeedback {
  const created = partial.created_at ?? ago(1)
  return {
    user_id: 'dev-user',
    author_name: 'מתנדב א׳ (דמו)',
    author_callsign: '214',
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
    board_position: null,
    board_note: null,
    sms_sent_at: null,
    sms_sent_inferred: false,
    created_at: created,
    updated_at: created,
    ...partial,
  }
}

const image = (name: string) => ({
  path: `dev/${name}`,
  mime: 'image/png',
  size: 120_000,
  name,
  kind: 'image' as const,
  signed_url: null,
})

let rows: UserFeedback[] =
  state === 'empty'
    ? []
    : [
        row({
          id: 'f1',
          created_at: ago(0, 2),
          body: 'אחרי שמירת אירוע חדש המפה נשארת ריקה עד שמרעננים את הדף.',
          attachments: [image('map.png')],
        }),
        row({
          id: 'f2',
          created_at: ago(0, 5),
          kind: 'suggestion',
          author_name: 'מתנדבת ב׳ (דמו)',
          author_callsign: '307',
          audio_storage_path: 'dev/voice.webm',
          transcript: 'הייתי שמח אם בטופס הסיום אפשר היה לבחור את הכביש מרשימה של כבישים אחרונים.',
        }),
        row({
          id: 'f3',
          created_at: ago(1, 3),
          author_name: 'מתנדב ג׳ (דמו)',
          author_callsign: '118',
          body: 'בטלפון הכפתור "סיום תיעוד" מוסתר מאחורי המקלדת כשמקלידים ק״מ.',
          page_path: '/events/fill',
        }),
        row({
          id: 'f4',
          created_at: ago(2),
          kind: 'suggestion',
          body: 'להוסיף סינון לפי שלוחה ברשימת האירועים.',
          status: 'in_progress',
          assignee_id: SAAR,
          board_position: -now + 2 * DAY,
          board_note: 'מחכה לרשימת השלוחות המעודכנת.',
        }),
        row({
          id: 't1',
          created_at: ago(1),
          user_id: OMRI,
          author_name: 'עמרי ל.',
          author_callsign: null,
          kind: null,
          title: 'לבדוק את טופס הסיום באנדרואיד אחרי העדכון',
          page_path: null,
          status: 'in_progress',
          assignee_id: OMRI,
          board_position: -now + 2 * DAY + 60_000,
        }),
        row({
          id: 'f5',
          created_at: ago(3),
          author_name: 'מתנדבת ד׳ (דמו)',
          author_callsign: '402',
          body: 'הדוח החודשי של ק״מ מציג את אותו אירוע פעמיים כשיש שני כוננים על אותו רכב.',
          status: 'in_progress',
          assignee_id: OMRI,
          attachments: [image('report-1.png'), image('report-2.png')],
          board_position: -now + 2 * DAY + 120_000,
        }),
        row({
          id: 'f6',
          created_at: ago(4),
          body: 'אנשי הקשר לא נטענו כשהחיבור היה חלש.',
          status: 'fixed',
          assignee_id: SAAR,
          updated_at: ago(1),
          sms_sent_at: ago(1),
        }),
        row({
          id: 'f7',
          created_at: ago(5),
          kind: 'suggestion',
          author_name: 'מתנדב ג׳ (דמו)',
          body: 'להציג את מספר האירוע בכותרת של מסך התיעוד.',
          status: 'fixed',
          updated_at: ago(2),
          sms_sent_at: ago(2),
          sms_sent_inferred: true,
        }),
        row({
          id: 'f8',
          created_at: ago(6),
          kind: 'suggestion',
          author_name: 'מתנדבת ב׳ (דמו)',
          body: 'מצב לילה כהה לכל האפליקציה.',
          status: 'wont_do',
          board_note: 'מחוץ לתכולה כרגע.',
        }),
      ]

const never = new Promise<never>(() => {})
const wait = () => new Promise((resolve) => setTimeout(resolve, 300))
const saveFails = state === 'save_error'
const fail = (error: string) => ({ ok: false as const, error })

const api: FeedbackBoardApi = {
  async listUserFeedback() {
    if (state === 'loading') return never
    await wait()
    if (state === 'error') throw new Error('dev error')
    return rows.map((item) => ({ ...item }))
  },
  async transcribeUserFeedback() {
    return { ok: false, error: 'אין תמלול במסך הפיתוח.' }
  },
  // Mirrors the edge function: at most one SMS per item, ever.
  async updateUserFeedbackStatus(id, status, options) {
    await wait()
    if (saveFails) return fail(FEEDBACK_UPDATE_ERROR)
    const before = rows.find((item) => item.id === id)
    rows = rows.map((item) => (item.id === id ? { ...item, status } : item))
    if (status !== 'fixed' || options?.notifyAuthor === false || !before || before.title) {
      return { ok: true, sms: 'skipped' }
    }
    if (before.sms_sent_at) {
      return { ok: true, sms: 'already_sent', smsSentAt: before.sms_sent_at, smsSentInferred: before.sms_sent_inferred }
    }
    const sentAt = new Date().toISOString()
    rows = rows.map((item) => (item.id === id ? { ...item, sms_sent_at: sentAt } : item))
    return { ok: true, sms: 'sent', smsSentAt: sentAt, smsSentInferred: false }
  },
  async deleteUserFeedback({ id }) {
    await wait()
    if (saveFails) return fail(FEEDBACK_DELETE_ERROR)
    rows = rows.filter((item) => item.id !== id)
    return { ok: true }
  },
  async listFeedbackAssignees() {
    return assignees
  },
  async setUserFeedbackAssignee(id, assigneeId) {
    await wait()
    if (saveFails) return fail(FEEDBACK_UPDATE_ERROR)
    rows = rows.map((item) => (item.id === id ? { ...item, assignee_id: assigneeId } : item))
    return { ok: true }
  },
  async updateFeedbackTask(id, { title, body }) {
    await wait()
    if (saveFails) return fail(FEEDBACK_TASK_SAVE_ERROR)
    rows = rows.map((item) =>
      item.id === id ? { ...item, title: title.trim(), body: body.trim() || null } : item,
    )
    return { ok: true }
  },
  async createFeedbackTask({ title, body, assigneeId }) {
    await wait()
    if (saveFails) return fail(FEEDBACK_TASK_SAVE_ERROR)
    rows = [
      row({
        id: `t${Date.now()}`,
        created_at: new Date().toISOString(),
        user_id: OMRI,
        author_name: 'עמרי ל.',
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
  async saveFeedbackBoardPositions(positions) {
    await wait()
    if (state === 'no_board_table') return fail(FEEDBACK_BOARD_UNAVAILABLE)
    if (saveFails) return fail(FEEDBACK_BOARD_ORDER_ERROR)
    const byId = new Map(positions.map((item) => [item.id, item.position]))
    rows = rows.map((item) =>
      byId.has(item.id) ? { ...item, board_position: byId.get(item.id) ?? null } : item,
    )
    return { ok: true }
  },
  async saveFeedbackBoardNote(id, note) {
    await wait()
    if (state === 'no_board_table') return fail(FEEDBACK_BOARD_UNAVAILABLE)
    if (saveFails) return fail(FEEDBACK_BOARD_NOTE_ERROR)
    rows = rows.map((item) => (item.id === id ? { ...item, board_note: note.trim() || null } : item))
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
      <span>מסך פיתוח: לוח המשוב האמיתי עם נתונים מדומים:</span>
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
          {params.has('bare') ? null : <DevBar />}
          <FeedbackBoardPage api={api} />
        </main>
      </div>
    </ToastProvider>
  </StrictMode>,
)
