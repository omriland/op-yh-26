# Yahpaz — Profile Telegram link button (+ future assignment webhook)

**Date:** 2026-09-04
**Repo:** `op-yh-26` (web + Edge + docs)
**Status:** Approved
**Related:** `2026-08-30-yahpaz-telegram-mcp-style-connect-design.md` (bot-initiated connect, profile revoke-only)

## Problem

Connecting the Telegram bot today is **bot-initiated only**: the volunteer must find the bot in Telegram first and send `/start` to get an authorize link. The profile page's חיבורים card only lists/revokes existing grants — there is no way to start a link from the website.

Separately, there's a future need: when a volunteer with a linked Telegram account is assigned a new event, they should get a Telegram message about it (with some interactive options). That's out of scope to build now, but the schema/contract should be planned so Part A doesn't need to be redone.

**This supersedes the 2026-08-30 "bot-initiated connect only" decision.** That spec deliberately removed the profile connect CTA (`docs/partner-api.md` §1.1 still says "There is no 'connect' button on the profile — only your bot should send the link"). This spec reverses that: a volunteer who hasn't started a Telegram conversation yet had no way in from the website. Part A explicitly requires updating that sentence in `docs/partner-api.md` and reconciling the profile's empty-state copy (currently "פתחו את הבוט בטלגרם ושלחו קישור חיבור" — bot-only instructions) so it doesn't contradict the new button.

## Part A — Profile "link with Telegram" button (build now)

### Decisions

| Topic | Choice |
|---|---|
| Consent step | Reuse the existing `/oauth/authorize` consent screen (`OAuthAuthorizePage.tsx`) — do not skip straight to Telegram |
| Which bot/client | Fetch active apps via the existing `partner-auth` `list_apps` action. Exactly one → link to it. Zero → hide the button (today's copy-only empty state stays). More than one → use the first, i.e. oldest by `created_at` (`list_apps` orders ascending) — no picker; not exercised in practice. **Known limitation, not built now:** this silently assumes a single bot. If a second active client is ever registered (via `admin_create_client`), the button keeps working but always links to the oldest one — a volunteer has no way to choose or even see that a second app exists. Whoever adds a second client must revisit this (build a picker, or otherwise make the choice explicit) before that second bot is usable from the profile; it will not fail loudly on its own |
| New backend code | None. `list_apps`, `client_info`, and `authorize` actions already exist and already require only an active session (not admin) |
| `state` | Client-generated random token, passed through like the bot's own CSRF token; `handleAuthorize` already stores it optionally |
| Navigation | A real browser navigation (`window.location.assign(...)`), not an SPA client-side route change — see below |
| URL building / state token | Reuse existing, already-tested `src/lib/partnerOAuth.ts` exports — do not write new ones. `buildPartnerAuthorizeUrl({ clientId, state })` builds the `/oauth/authorize?client_id=…&state=…` URL; `randomOAuthState()` generates the token. Both are leftover, currently-unused code from an earlier (reverted) attempt at this same feature (commit `c0fe620`, reverted by `5417b86`) and are already covered by `partnerOAuth.test.ts` |

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

- **Dependency:** the חיבורים `<section>` in `ProfilePage.tsx` is currently rendered `card--disabled` / `aria-disabled="true"` / `inert` (commit `e5d071b`, "Grey out the profile connections section so it cannot be used yet"), with the existing "רישום בוט" and "בטל גישה" buttons hardcoded `disabled`. A separate PR (#25) already re-enables this. **If #25 hasn't merged by the time this is built, this spec's implementation must also remove `card--disabled`/`inert`/`aria-disabled` and the two hardcoded `disabled` attributes** (and the matching `.card--disabled` CSS + design-doc note) as part of this work — otherwise the new button is unreachable. If #25 has already merged, this is a no-op check, not new work.
- `src/pages/ProfilePage.tsx`: in the חיבורים empty state, fetch apps (new small helper in `partnerApi.ts` wrapping `list_apps`), and when exactly one active app exists, show a button. **The button must do a real browser navigation** (`window.location.assign('/oauth/authorize?client_id=…&state=…')`), not a client-side route change: `src/lib/appRoute.ts`'s `AppRouteView` has no state for `/oauth/authorize` (it's parsed to `{ kind: 'oauth' }` and deliberately excluded from URL syncing), and `App.tsx`'s `popstate` handler no-ops on `kind === 'oauth'`. `OAuthAuthorizePage` only renders today because the bot-initiated flow is always a fresh full-page load; the profile button needs to trigger the same kind of load.
- `src/lib/partnerApi.ts`: add `fetchPartnerApps()` wrapping `action: 'list_apps'` (mirrors existing wrappers).
- No Edge function or migration changes.
- `docs/partner-api.md` §1.1: drop "There is no 'connect' button on the profile — only your bot should send the link" (see Problem section above).
- `design-system-design-instructions/screens/profile.md` §2: drop the "No connect CTA on the profile — connect is bot-link only" line (and the "Temporarily UI-disabled" note, if #25 hasn't landed yet) and add the new button to the empty-state description.

### Testing

- Vitest: `buildPartnerAuthorizeUrl` and `randomOAuthState` are already covered by `partnerOAuth.test.ts` — no new URL/state-token tests needed. No new test for `fetchPartnerApps()` either: `partnerApi.ts` has no test file today, and none of its existing wrappers (`fetchPartnerGrants`, `fetchPartnerClientInfo`, `approvePartnerAuthorize`, etc.) have direct unit tests — no precedent to follow, so it stays untested at this layer, consistent with the rest of the file.
- Manual/code-review: profile empty state shows the button when one or more active apps exist (linking to the oldest when more than one, per the "Which bot/client" decision above); clicking it lands on the existing consent screen; approving redirects to `t.me/<bot>?start=…` as it does today for the bot-initiated path.

## Part B — Future: event-assignment Telegram notifications (plan only, not built now)

Preserves the current boundary in `docs/partner-api.md`: *"We do not store Telegram ids."* Our backend never calls Telegram directly — it notifies the bot server, which already owns the `user_id → chat_id` mapping and sends the actual message.

### Schema additions (not migrated now)

- `oauth_clients` gains:
  - `webhook_url text` (nullable) — where to POST assignment notifications
  - `webhook_secret text` (nullable, plaintext, service-role only — same access pattern as the rest of this table) — used to HMAC-sign outbound requests; the bot server needs the same plaintext to verify, so unlike `client_secret_hash` this cannot be stored only as a hash
- New table `partner_webhook_events` (outbox, for retry + audit):
  - `id uuid`, `client_id uuid references oauth_clients`, `user_id uuid references profiles`, `event_type text` (e.g. `assignment_created`), `payload jsonb`, `attempts int`, `delivered_at timestamptz`, `created_at timestamptz`
- A trigger on `public.event_responders` insert enqueues **one `partner_webhook_events` row per matching `(client_id, user_id)`**: it joins `oauth_access_tokens` (active grant: `revoked_at is null` for that `responder_id`) to `oauth_clients` (`is_active = true` **and** `webhook_url is not null`). A volunteer can hold active grants with more than one client (`oauth_access_tokens_one_active_idx` is unique per `client_id, user_id`, not per `user_id`), so this can enqueue more than one row per assignment. Gating on `webhook_url is not null` avoids queuing rows for clients that never configured a webhook — those would otherwise retry forever with nowhere to deliver.

### Delivery

A scheduled Edge function polls undelivered `partner_webhook_events`, looks up `oauth_clients.webhook_url`, POSTs a signed payload (`X-Yahpaz-Signature`: HMAC-SHA256 of the body using `webhook_secret`), marks `delivered_at` on 2xx, retries with backoff otherwise.

### What the bot server must implement

This is new work on the **external** Telegram bot server (not this repo) — to be written up as a new "§3 Assignment webhook" section in `docs/partner-api.md`, in the same style as the existing `token`/`revoke` sections:

1. **An HTTPS endpoint** (e.g. `POST /webhooks/yahpaz/assignment`) that accepts the payload `{ id, user_id, event_id, event_type, ...minimal event summary }`, where `id` is `partner_webhook_events.id`.
2. **Signature verification**: compute HMAC-SHA256 over the raw request body using the `webhook_secret` issued at registration, compare against the `X-Yahpaz-Signature` header (constant-time compare); reject anything that doesn't match.
3. **Idempotency**: dedupe on the payload's `id` field (Yahpaz may retry a delivery that timed out but actually succeeded) — skip work if already processed.
4. **Chat lookup**: use its own existing `user_id → chat_id` mapping (already required today to exchange the `token` action and serve `/unlink`) to find where to send the message. If unmapped (e.g. unlinked between assignment and delivery), just acknowledge and drop it.
5. **Send the Telegram message** via the Bot API `sendMessage`, using the bot token it already holds, including whatever inline keyboard / options are wanted for this event.
6. **Respond quickly with 2xx** once the message is sent (or reliably queued on their side) — non-2xx or timeout triggers Yahpaz's retry/backoff.
7. **Credential rotation**: `webhook_url` / `webhook_secret` are issued and rotated the same way `client_secret` is today — via Yahpaz admin (הגדרות → רישום בוט), on request.

### Non-goals (Part B)

- Yahpaz storing Telegram chat ids or calling the Telegram Bot API itself
- Delivery guarantees beyond retry-with-backoff (no dead-letter UI in v1)
- Any notification type other than `assignment_created` (message content/options are entirely the bot server's decision)
