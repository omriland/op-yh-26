# Yahpaz — Profile Telegram link button (+ future assignment webhook)

**Date:** 2026-09-04
**Repo:** `op-yh-26` (web + Edge + docs)
**Status:** Approved
**Related:** `2026-08-30-yahpaz-telegram-mcp-style-connect-design.md` (bot-initiated connect, profile revoke-only)

## Problem

Connecting the Telegram bot today is **bot-initiated only**: the volunteer must find the bot in Telegram first and send `/start` to get an authorize link. The profile page's חיבורים card only lists/revokes existing grants — there is no way to start a link from the website.

Separately, there's a future need: when a volunteer with a linked Telegram account is assigned a new event, they should get a Telegram message about it (with some interactive options). That's out of scope to build now, but the schema/contract should be planned so Part A doesn't need to be redone.

## Part A — Profile "link with Telegram" button (build now)

### Decisions

| Topic | Choice |
|---|---|
| Consent step | Reuse the existing `/oauth/authorize` consent screen (`OAuthAuthorizePage.tsx`) — do not skip straight to Telegram |
| Which bot/client | Fetch active apps via the existing `partner-auth` `list_apps` action. Exactly one → link to it. Zero → hide the button (today's copy-only empty state stays). More than one → use the first (no picker; not exercised in practice) |
| New backend code | None. `list_apps`, `client_info`, and `authorize` actions already exist and already require only an active session (not admin) |
| `state` | Client-generated random token, passed through like the bot's own CSRF token; `handleAuthorize` already stores it optionally |

### Flow

```
Profile (חיבורים, empty state)
  → list_apps → exactly one active app
  → "קישור לטלגרם" button → navigate to /oauth/authorize?client_id=<id>&state=<random>
  → existing consent screen (client_info, "אשר והמשך לטלגרם")
  → approvePartnerAuthorize (action=authorize) → https://t.me/<bot>?start=yp_<code>
  → volunteer's Telegram opens, bot exchanges code via partner-auth `token` (unchanged)
```

### Web changes

- `src/pages/ProfilePage.tsx`: in the חיבורים empty state, fetch apps (new small helper in `partnerApi.ts` wrapping `list_apps`), and when exactly one active app exists, show a button that navigates to `/oauth/authorize?client_id=…&state=…`.
- `src/lib/partnerApi.ts`: add `fetchPartnerApps()` wrapping `action: 'list_apps'` (mirrors existing wrappers).
- No Edge function or migration changes.

### Testing

- Vitest: a small pure helper for building the `/oauth/authorize` URL from `{ clientId }` (mirrors `partnerOAuth.test.ts` style).
- Manual/code-review: profile empty state shows the button only when exactly one active app exists; clicking it lands on the existing consent screen; approving redirects to `t.me/<bot>?start=…` as it does today for the bot-initiated path.

## Part B — Future: event-assignment Telegram notifications (plan only, not built now)

Preserves the current boundary in `docs/partner-api.md`: *"We do not store Telegram ids."* Our backend never calls Telegram directly — it notifies the bot server, which already owns the `user_id → chat_id` mapping and sends the actual message.

### Schema additions (not migrated now)

- `oauth_clients` gains:
  - `webhook_url text` (nullable) — where to POST assignment notifications
  - `webhook_secret text` (nullable, plaintext, service-role only — same access pattern as the rest of this table) — used to HMAC-sign outbound requests; the bot server needs the same plaintext to verify, so unlike `client_secret_hash` this cannot be stored only as a hash
- New table `partner_webhook_events` (outbox, for retry + audit):
  - `id uuid`, `client_id uuid references oauth_clients`, `user_id uuid references profiles`, `event_type text` (e.g. `assignment_created`), `payload jsonb`, `attempts int`, `delivered_at timestamptz`, `created_at timestamptz`
- A trigger on `public.event_responders` insert enqueues a `partner_webhook_events` row **only** when that `responder_id` has an active row in `oauth_access_tokens` (i.e. only volunteers who've actually linked Telegram)

### Delivery

A scheduled Edge function polls undelivered `partner_webhook_events`, looks up `oauth_clients.webhook_url`, POSTs a signed payload (`X-Yahpaz-Signature`: HMAC-SHA256 of the body using `webhook_secret`), marks `delivered_at` on 2xx, retries with backoff otherwise.

### What the bot server must implement

This is new work on the **external** Telegram bot server (not this repo) — to be written up as a new "§3 Assignment webhook" section in `docs/partner-api.md`, in the same style as the existing `token`/`revoke` sections:

1. **An HTTPS endpoint** (e.g. `POST /webhooks/yahpaz/assignment`) that accepts the payload `{ user_id, event_id, event_type, ...minimal event summary }`.
2. **Signature verification**: compute HMAC-SHA256 over the raw request body using the `webhook_secret` issued at registration, compare against the `X-Yahpaz-Signature` header (constant-time compare); reject anything that doesn't match.
3. **Idempotency**: dedupe on a unique id in the payload (Yahpaz may retry a delivery that timed out but actually succeeded) — skip work if already processed.
4. **Chat lookup**: use its own existing `user_id → chat_id` mapping (already required today to exchange the `token` action and serve `/unlink`) to find where to send the message. If unmapped (e.g. unlinked between assignment and delivery), just acknowledge and drop it.
5. **Send the Telegram message** via the Bot API `sendMessage`, using the bot token it already holds, including whatever inline keyboard / options are wanted for this event.
6. **Respond quickly with 2xx** once the message is sent (or reliably queued on their side) — non-2xx or timeout triggers Yahpaz's retry/backoff.
7. **Credential rotation**: `webhook_url` / `webhook_secret` are issued and rotated the same way `client_secret` is today — via Yahpaz admin (הגדרות → רישום בוט), on request.

### Non-goals (Part B)

- Yahpaz storing Telegram chat ids or calling the Telegram Bot API itself
- Delivery guarantees beyond retry-with-backoff (no dead-letter UI in v1)
- Any notification type other than `assignment_created` (message content/options are entirely the bot server's decision)
