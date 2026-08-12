# Yahpaz — Generic transactional email + scoped fill link

Date: 2026-08-12  
Status: design approved (brainstorm); awaiting written-spec review before implementation plan

## Goal

1. **Plumbing:** a reusable server-side way to send branded transactional emails (reminders, alerts, etc.) that is **not** invite and **not** password reset.
2. **First use:** when a shift-lead first sets lead `total_km` on a participation, email that responder that their report is ready to complete, with a CTA into the fill form.
3. **Scoped fill link:** opaque token unlocks **only that participation’s fill form** without a full Auth session. Expired token → login, then return to the same fill destination.

## Non-goals

- Changing invite email or Supabase Auth password-reset mail
- Refactoring invite HTML onto the shared shell in v1 (optional follow-up)
- Named template catalog, user email preferences / opt-out, broadcast marketing
- Batch send API, attachments, scheduled_at, CC/BCC
- Delivery webhooks / suppression UI
- Full SPA URL router for all views (only fill deep-link / return path for this feature)
- Auto re-reminders or admin “resend fill email” UI in v1

## Decisions (locked)

| Topic | Choice |
|---|---|
| Scope of plumbing | Shared Resend helper + branded shell + dedicated Edge Function |
| Content API | Freeform `subject` + inner `html` (+ optional `text`); wrapped in אבן דרך shell |
| Callers | Admin JWT **or** service-role / other Edge Functions |
| Recipients | Active `profiles` only (resolve by `user_id`; no raw `to`) |
| First email trigger | `event_responders.total_km` first becomes non-null (null → value) |
| Unauthenticated fill | **Scoped fill token** (not a full magic-link session) |
| Token TTL | **7 days** |
| Expired token | Send user to **login**, preserve destination, open fill after login |
| Invite / recovery | Unchanged |

---

## Part A — Generic email plumbing

### Architecture

```
Caller (admin app | other Edge Function / cron)
        │
        ▼
  Edge Function: send-email
        │  auth: admin JWT  OR  service-role Bearer
        │  resolve recipient → active profile only
        │  wrap subject/body in אבן דרך shell
        ▼
  _shared/email  →  Resend HTTP API
```

### Shared module (`supabase/functions/_shared/email.ts`)

- `sendTransactionalEmail({ to, subject, htmlInner, textInner?, idempotencyKey? })`
- Builds RTL Hebrew shell matching invite brand (header **אבן דרך**, subtitle יחפ״צ · היחידה הארצית לפינוי צירים, navy header, primary CTA styles available to callers via their inner HTML).
- `from`: display `אבן דרך - יחפ״צ`, address from env (e.g. `EMAIL_FROM` defaulting to `alerts@send.yahpz.com` on the verified send domain).
- Calls Resend `POST https://api.resend.com/emails` with `RESEND_API_KEY`.
- Always check Resend response / `{ data, error }` pattern; never assume throw.
- Idempotency: pass Resend idempotency key when provided (`Idempotency-Key` header); format `<event-type>/<entity-id>`.

### Edge Function `send-email`

**Endpoint:** `POST /functions/v1/send-email`

**Auth (either):**

1. `Authorization: Bearer <user JWT>` and caller has role `admin`
2. `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` (other functions / trusted server)

**Body:**

```json
{
  "user_id": "<uuid>",
  "subject": "...",
  "html": "...",
  "text": "...",
  "idempotency_key": "optional"
}
```

- `user_id`, `subject`, `html` required.
- Resolve email from Auth user for that `user_id`; require `profiles.active = true`.
- Do **not** accept caller-supplied `to`.
- If `text` omitted: derive a plain-text fallback by stripping tags from `html` (simple strip is enough for v1).

**Response:** `{ "id": "<resend_id>" }` or Hebrew `{ "error": "..." }` (same tone as `admin-users`).

**Not in v1:** batch endpoint.

Invite continues to live in `admin-users` with its own HTML for now.

---

## Part B — First automatic email (fill ready)

### Trigger

When `event_responders.total_km` transitions from **null → non-null** (including `0`).

Do **not** send when:

- Event `is_cancelled`
- Participation already `done`
- Responder profile inactive / missing email
- `total_km` was already non-null (updates / clears / re-sets do not re-fire)

**Idempotency:** store send marker (see schema). Resend key: `fill-ready/<event_responder_id>`.

### Where it fires

Preferred: after successful lead save that first sets `total_km`, call a dedicated Edge Function action (or thin `notify-fill-ready` function) from the **server path that persists the row**, using service role — not from the browser with admin JWT for each assignee.

Practical v1 (fits current client save):

1. `saveEventForm` (or a small post-save helper invoked only when the client detects newly set km rows) invokes Edge Function `responder-fill` action `notify_fill_ready` with `{ event_id }` or list of `event_responder_id`s that just gained km.
2. Function re-checks DB (null→set + not yet notified), mints token if needed, sends email via shared module / `send-email` internals.

Do not rely solely on a Postgres trigger calling `net.http` unless already standard in this project (it is not today). Client-triggered notify is OK if the function is authoritative and idempotent.

### Email copy (v1)

| Field | Value |
|---|---|
| Subject | `דיווח מוכן להשלמה - אבן דרך` |
| Greeting | `שלום {full_name},` |
| Body | Short notice that the shift-lead finished entering kilometers and the report is ready to complete |
| CTA | `להשלמת הדיווח` → fill link |
| Ignore line | If unexpected, ignore |

Include light context when available (event date / type / road) in the body; keep first viewport of the email simple.

### Fill link URL

```
https://yahpz.com/?fill_token=<opaque_token>
```

Local/dev: `window.location.origin` / `INVITE_REDIRECT_TO`-style base env (`APP_ORIGIN` or reuse `INVITE_REDIRECT_TO`).

---

## Part C — Scoped fill token

### Schema

Columns on `event_responders` (YAGNI — no separate tokens table in v1):

| Column | Type | Notes |
|---|---|---|
| `fill_token_hash` | text | sha256 of opaque secret; null until minted |
| `fill_token_expires_at` | timestamptz | now() + 7 days at mint |
| `fill_ready_emailed_at` | timestamptz | set only after successful Resend send |

Raw token only appears in the email link / client query string. Re-mint only if missing/expired when notifying (still no duplicate email if `fill_ready_emailed_at` is set).

### Capabilities

Valid unexpired token (presented to Edge Function) may:

- Load fill context for **that** participation only (same fields as `ResponderFillContext`)
- Save draft / complete with the **same validation rules** as `responderFill.ts` (including lead `total_km` required for complete; auto odometer end)

Must **not**:

- Create a Supabase Auth session
- Expose other events, admin surfaces, or other responders’ rows
- Bypass done-lock / event-done read-only rules

### Edge Function `responder-fill`

Public token actions (no user JWT):

| Action | Purpose |
|---|---|
| `load_by_token` | `{ fill_token }` → context, or error with `code` + `event_id` when known (`expired` must still return `event_id` for post-login redirect) |
| `save_by_token` | `{ fill_token, mode: 'draft' \| 'complete', draft }` → save |

Authenticated path unchanged: existing client + RLS for logged-in fill.

Notify action (service or shift_lead/admin JWT):

| Action | Purpose |
|---|---|
| `notify_fill_ready` | For given event or assignment ids: mint token if needed, send email if not yet notified |

### App entry & routing

Today navigation is React state (no router). Add minimal URL bootstrap:

1. On boot, read `fill_token` from query.
2. If present and **valid** (via `load_by_token`): show `ResponderFillPage` in **token mode** (no AppShell login requirement). Strip or keep token in URL carefully (prefer keep until done so refresh works; do not log token to analytics).
3. If token **expired** (or invalid but `event_id` known):
   - Persist `sessionStorage` `yahpaz:post_login_fill` = `{ eventId }` (never stash the dead token as the sole key).
   - Show brief Hebrew message + continue to **login** (existing `LoginPage`).
4. If token **invalid** with no `event_id`: message + login with no fill return (user can open האירועים שלי manually).
5. After successful login **and** any phone OTP gate, if post-login fill intent exists: open `{ kind: 'fill', eventId, returnTo: 'list' }` when the user is the assignee; clear the intent. Intent must survive OTP the same way other sessionStorage gates do.
6. *(renumber)* If user is already logged in and opens a **valid** fill link for their assignment: open normal authenticated fill via `eventId` from token payload.
7. If logged-in user opens a link for **someone else’s** assignment: show Hebrew permission empty state (do not use the token to impersonate while logged in as another user).

**Critical:** expiry must not dead-end. Always stash a **login return target** that survives the login (and phone OTP) flow — same pattern family as password-setup intent storage.

### Logged-in deep link (no token)

Also support `?fill_event=<eventId>` (or restore from post-login stash) so after expiry→login the redirect does not depend on the expired token. Notify email uses `fill_token`; post-login uses `eventId`.

---

## Error / copy notes (Hebrew)

| Case | User-facing |
|---|---|
| Invalid token | `קישור הדיווח אינו תקין או שפג תוקפו.` + CTA to login |
| Expired | Same, then login with return to fill |
| Wrong user after login | `אין לך הרשאה לצפות באירוע זה או שהאירוע אינו קיים.` |
| Notify / send failure | Lead save still succeeds; log/return soft failure — do not block event save on email failure |

---

## Security

- Hash tokens at rest; compare hash only.
- Rate-limit token load/save lightly if cheap (optional v1).
- Service role only inside Edge Functions.
- Freeform HTML on `send-email` is admin/service only — never expose to responders.
- Do not put PII beyond name/event context in subject lines excessively.

---

## Testing (acceptance)

1. Admin/service can send a generic email to an active user via `send-email`; inactive user rejected.
2. Setting `total_km` the first time emails the responder once; second save does not duplicate.
3. Valid fill link opens fill without login; draft + complete work; done lock respected.
4. Expired link → login → after auth, assignee lands on that event’s fill form.
5. Invite and password-reset flows unchanged.
6. Cancelled event / done participation: no new fill-ready email.

## Implementation order (for plan)

1. Shared email module + `send-email` function  
2. Schema columns + `responder-fill` token load/save  
3. App boot: token mode + expiry→login return  
4. `notify_fill_ready` wired from event save when km newly set  
5. Tests + deploy secrets (`RESEND_API_KEY` already; add `EMAIL_FROM` if needed)
