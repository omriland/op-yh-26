# לוח המשוב (feedback board)

Status: draft for approval, 7 Nov 2026. Branch `feat/feedback-board-redesign`.

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
3. Moving to טופל texts a volunteer from a single click with no confirmation, and reopening then fixing again texts them a second time.
4. Nowhere to write why something is `wont_do` or what was done.
5. `super_admin` is three people, not two: a third account (not Omri or Saar) can see and manage every submission. See section 4.
6. Minor: every row's files are signed on every load (fine at 16 rows).

## 2. Target flow

A four-column board. Nothing else changes for submitters (web and Android untouched).

| Column | Status | Who moves cards here | What the submitter gets |
|---|---|---|---|
| פתוח | `open` | new submissions land at the top | nothing |
| בטיפול | `in_progress` | a manager | nothing |
| טופל | `fixed` | a manager, after a confirmation | one SMS, as today, unless the manager picks "בלי SMS" |
| לא יטופל | `wont_do` | a manager | nothing |

Column names reuse the existing stamp labels, so the board and the stamps say the same thing.

**Card (front).** Heading (task title, or the kind באג / הצעה), a two-line excerpt of the note or transcript, submitter name and date, small markers for a voice note and file count, and the assignee's initials. Nothing else.

**Card (detail).** Click a card to open it in the existing dialog: full note, audio, transcript, files, submitter, callsign, page and date, then status, assignee, and one internal note (הערה פנימית). Tasks can be edited. Delete stays here, with its confirmation.

**Moving.** Drag between and within columns. The keyboard and touch alternative is the card's menu (⋮): move to any other column, move up or down, assign. New submissions sort to the top of פתוח by date until someone moves them.

**Assignment.** One assignee or none, chosen from active super admins. Filter chips above the board: הכול, one chip per manager, לא משויך.

**Ordering.** Each card has a position. A card that was never moved sorts by its submission time, newest first. A dropped card takes the midpoint between its neighbours.

**Finished columns.** טופל and לא יטופל show the newest 20 cards; the rest sit behind "הצגת עוד".

**Screens.** Desktop (1280 px and up): four columns side by side. Tablet: the same columns, scrolling sideways. Phone (640 px and below): one column at a time, chosen with a switcher that shows each column's count; moves happen through the card menu.

**Cut on purpose.** Comments threads, labels, due dates, priorities, search, history, notifications to managers, bulk actions, extra columns.

## 3. Data changes

One new migration, `20261107120000_feedback_board_cards.sql`, adds `public.user_feedback_board` (one row per card: `position`, `note`, `updated_at`, `updated_by`). It does not touch `user_feedback`, so the deployed app, the edge functions and Android keep working before and after it is applied. RLS: super admins only, so a submitter can never read the internal note. Rows cascade with their feedback, so account deletion still removes them. Until it is applied, the board still loads and moves cards between columns; only order and notes fail to save, with a message.

Not applied anywhere. It must be applied before this branch ships.

## 4. Access (decision needed)

The board uses the same gate as today: the `super_admin` role. That is three accounts: Omri, Saar, and one more.

- **A. Keep `super_admin` (built).** No new concept and no change to the deployed policies, but the third super admin keeps full access, as they have today.
- **B. Explicit allowlist of Omri and Saar.** Exactly the two of you. It needs a `feedback_board_managers` table (or a fixed list in a SQL function) and a change to the existing `user_feedback` select, update and delete policies and the `user-feedback` edge function. It removes the third account's current access, and every new manager needs a migration or an admin row.

Recommendation: A for this release, B only if the third account should not see volunteer feedback at all.

## 5. Open questions

1. **Access:** A or B above?
2. **SMS on טופל:** keep the confirmation with a "בלי SMS" choice, or always send?
3. **לא יטופל:** should the submitter hear anything? Today: nothing. Recommended: keep it that way.
4. **Reopen:** if a card leaves טופל and comes back, a second SMS goes out (as today). Acceptable, or send only once per card?
5. **Saar's account:** identified as `saariko@gmail.com` (matches the GitHub `saariko`). Confirm.
