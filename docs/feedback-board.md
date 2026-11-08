# לוח המשוב (feedback board)

Status: decisions taken 7 Nov 2026, not shipped. Branch `feat/feedback-board-redesign`.

Managers: any `super_admin`. The two intended managers are Omri Landman and Saar (סער מכטינגר, `saariko@gmail.com`, confirmed).

## 1. The flow today

**Submission.** Any signed-in member opens the משוב sheet from the support button (web `FeedbackFab.tsx`; Android `FeedbackSheet.kt`, which inserts into the same table directly). A submission carries a kind (באג / הצעה, required), an optional note (max 2,000 chars), an optional voice note (max 90 s, 5 MB), up to 3 images or short videos, and the page path. Files go to the private `user-feedback` bucket under `{user_id}/…`; the row goes to `public.user_feedback` with status `open`. Submitted content is locked by trigger and cannot be edited.

**Access.** RLS: a member reads only their own rows; `super_admin` reads all rows and is the only role that may update, delete, assign, or open a task. Assignees must be super admins (trigger). The inbox route is shown only to super admins (`canManageFeedbackInbox`).

**Inbox (PR #68).** A single list, not a board: filter chips by status (פעיל / פתוח / בטיפול / טופל / לא יטופל / הכול) plus an assignee select. Each card shows everything at once: body, audio, transcript, files, an assignee select and four or five status buttons plus delete. Order is fixed (בטיפול first, then newest). A super admin can open a "task" (title + body, no kind, no SMS).

**Statuses.** `open`, `in_progress`, `fixed`, `wont_do`.

**Mark treated.** Moving submitted feedback to `fixed` calls the `user-feedback` edge function, which sets `fixed` and sends the submitter one SMS through Soprano ("…הפידבק שנתת על {excerpt} טופל"). Tasks never text. `wont_do` sends nothing. Voice notes are transcribed on first inbox load (`transcribe-feedback`).

**Production volume (read-only aggregates, 7 Nov 2026).** 16 rows since 1 Nov, from 4 members, none of them super admins. 11 `fixed`, 4 `open`, 1 `wont_do`, 0 `in_progress`. 0 tasks. 2 rows assigned. 6 with a voice note (all transcribed), 8 with files. Every submitter has a mobile number on file. Most rows come from the events pages. Three accounts hold `super_admin`.

**Problems found**

1. It is a filtered list, so the state of the whole queue is never visible at once, and every card carries 6 to 7 controls.
2. No manual order: the two managers cannot say "this one next".
3. Moving to טופל texts a volunteer from a single click with no confirmation, and reopening then fixing again texts them a second time. Nothing records that an SMS was sent: the only guard is "the row is already `fixed`".
4. Nowhere to write why something is `wont_do` or what was done.
5. `super_admin` is three people, not two: a third account (not Omri or Saar) can see and manage every submission. See section 4.
6. Minor: every row's files are signed on every load (fine at 16 rows).

## 2. Target flow

A four-column board. Nothing else changes for submitters (web and Android untouched).

| Column | Status | Who moves cards here | What the submitter gets |
|---|---|---|---|
| פתוח | `open` | new submissions land at the top | nothing |
| בטיפול | `in_progress` | a manager | nothing |
| טופל | `fixed` | a manager; the first time, after a confirmation | one SMS, at most once per item, ever (see below) |
| לא יטופל | `wont_do` | a manager | nothing, by decision |

Column names reuse the existing stamp labels, so the board and the stamps say the same thing.

**Card (front).** Heading (task title, or the kind באג / הצעה), a two-line excerpt of the note or transcript, submitter name and date, small markers for a voice note and file count, and the assignee's initials. Nothing else.

**Card (detail).** Click a card to open it in the existing dialog: full note, audio, transcript, files, submitter, callsign, page and date, whether and when the submitter was texted, then status, assignee, and one internal note (הערה פנימית). Tasks can be edited. Delete stays here, with its confirmation.

**SMS on טופל: at most once per item, ever.**

- The first move of submitted feedback to טופל asks: "שליחת SMS", "בלי SMS", "ביטול".
- Once the submitter has been texted, a later move to טופל (after a reopen) asks nothing and sends nothing. The toast says the submitter already got an SMS. The dialog is skipped rather than shown without its send button, because a question with one real answer is noise.
- "בלי SMS" records nothing, so a later טופל may still offer the one SMS.
- A failed send records nothing, so a later טופל may try again.
- The rule is enforced in the `user-feedback` edge function, not only in the board: before sending it claims the item with one conditional update (`sms_sent_at is null and sms_sending_at is null`). A double click, a second tab or a stale board gets "already sent". A claim that is never released (a crash between the send and the record) blocks any further SMS: maybe-sent counts as sent.
- Feedback already `fixed` when the migration runs counts as texted (`sms_sent_inferred`), because the old flow texted on every טופל. The detail says so instead of showing a send time.
- Not covered: feedback that was texted, then reopened, and is open, in progress or לא יטופל when the migration runs. Nothing in the data shows it was texted, so its next טופל may text again. At the 7 Nov count that is at most the 5 rows not `fixed`.

**Moving.** Drag between and within columns. Without a mouse (keyboard, touch, phone), status changes in the card detail: open the card, pick the status (טופל still asks about the SMS). New submissions sort to the top of פתוח by date until someone moves them.

**Card menu (⋮).** העברה לראש העמודה, העברה לתחתית העמודה (each off when the card is already there), שיוך (a second panel listing the managers, the current one checked, plus ללא שיוך when assigned), שיוך אליי (hidden when the card is already yours), and מחיקה last, apart, in red. The שיוך panel replaces the menu with a חזרה row rather than flying out, so it stays on screen at every width; ArrowLeft opens it, ArrowRight or Escape goes back.

**Assignment.** One assignee or none, chosen from active super admins. Filter chips above the board: הכול, one chip per manager, לא משויך.

**Ordering.** Each card has a position. A card that was never moved sorts by its submission time, newest first. A dropped card takes the midpoint between its neighbours.

**Finished columns.** טופל and לא יטופל start folded to a narrow strip (count, title along the spine, expand mark), so פתוח and בטיפול get the width. The strip is one button; an open finished column has a fold button in its header. Each viewer's choice is kept in this browser (`localStorage`), and folded is the fallback. A card dropped on a strip moves there (טופל still asks about the SMS) and the toast confirms it; the strip stays folded. When open, the column shows the newest 20 cards; the rest sit behind "הצגת עוד". On a phone nothing folds: the column switcher already shows one column at a time, starting on פתוח.

**Screens.** Desktop (1280 px and up): four columns side by side. Tablet: the same columns, scrolling sideways. Phone (640 px and below): one column at a time, chosen with a switcher that shows each column's count; moves happen through the card menu.

**Cut on purpose.** Comments threads, labels, due dates, priorities, search, history, notifications to managers, bulk actions, extra columns.

## 3. Data changes

One new migration, `20261107120000_feedback_board_cards.sql`, adds `public.user_feedback_board`: one row per card with `position`, `note`, `sms_sending_at`, `sms_sent_at`, `sms_sent_inferred`, `updated_at`, `updated_by`. It also backfills `sms_sent_at` for feedback already `fixed`.

- It does not touch `user_feedback`, so the deployed web app and Android keep working before and after it.
- RLS: super admins only, so a submitter can never read the internal note. A trigger stops signed-in users from writing the `sms_*` columns; only the edge function (service role) does.
- Rows cascade with their feedback, so account deletion still removes them.

The `user-feedback` edge function changes too (the SMS claim and record). It is written, not deployed.

## 4. Shipping order

1. Apply `20261107120000_feedback_board_cards.sql`.
2. Merge the branch to `infra/bootstrap`. That deploys the web app (Netlify, assuming it builds this branch as today) and, because `supabase/functions/**` changed, the `user-feedback` edge function (GitHub workflow `deploy-edge-functions.yml`).

What breaks if the order is wrong:

- **Merge before the migration:** the new edge function cannot claim, so it fails closed: cards still become טופל, but no SMS goes out ("שליחת ה-SMS נכשלה") until the migration runs. The board loads, but order and notes do not save.
- **Old edge function with the new board** (the migration applied but the function deploy failed): the board skips the question for items it knows were texted, but the old function texts again on a reopen-then-טופל if "שליחת SMS" is chosen for an item without a record.

To make the merge self-ordering instead, the migration could be added to the workflow's "Apply idempotent migrations" list, which runs before the function deploy. That is a shipping choice, not done here.

## 5. Access (decided)

Any `super_admin` manages the board (option A). That is three accounts today: Omri, Saar and one more, who already had this access. No allowlist.
