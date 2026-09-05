# Yahpaz — Telegram-driven live trip tracking (/trip)

**Date:** 2026-09-04
**Repo:** `op-yh-26` (Edge only; no frontend/map changes)
**Status:** Design approved in brainstorming; spec review pending
**Official partner contract (share this):** https://yahpz.com/partner-api/ (Swagger) · spec `public/partner-api/openapi.yaml` · notes `docs/partner-api.md`
**Depends on:** `2026-08-17-yahpaz-live-location-tracking-design.md` (live tracking pipeline, `event_responder_live_locations`, `responder-track`), `2026-08-24-yahpaz-partner-responder-api-design.md` (`responder-api`, `ypat_` partner tokens), `2026-08-30-yahpaz-telegram-mcp-style-connect-design.md` (linking)

## Problem

Today live location tracking only starts when a shift lead attaches a responder and the site texts them an SMS link (`2026-08-17-yahpaz-live-location-tracking-design.md`). A volunteer who is already linked to the Telegram bot (`2026-08-24-...-partner-responder-api-design.md`) should be able to self-start sharing their live location from the bot's `/trip` command, using Telegram's native live-location sharing instead of opening a web page. The result must land on the same ops maps, through the same pipeline, with zero map/frontend changes.

## Goals

- A bot-linked volunteer can start live location sharing for one of their own open assignments via the bot, without a shift lead's involvement
- Reuses the existing `event_responder_live_locations` table, `responder-track` `ping`, Realtime subscription, and map pin rendering unchanged
- Completing a trip report (`responder-api` `complete`) also stops live tracking for that assignment
- No Telegram identifiers of any kind are ever stored in Yahpaz's database — same boundary as the existing partner API

## Non-goals (v1)

- Any change to the SMS-based lead-triggered flow, the map, `OpsMapPanel`, or the Realtime pipeline
- A bot-side `/trip stop` command — Telegram's native "stop sharing" control and `live_period` expiry are the only stop signals from the volunteer side (completing the report is the other stop signal, handled site-side)
- Building or specifying the Telegram bot server itself — this doc specifies the HTTP contract it must call; the bot's webhook handling, chat UX, and `chat_id ↔ event_id ↔ track_token` bookkeeping are entirely the partner's responsibility
- Reconciling a bot-driven track with a concurrent SMS-triggered `start` for the same assignment (see Known limitations)
- Any throttling of `ping` beyond what already exists — Telegram's own update cadence is trusted as-is

## Decisions (locked)

| Topic | Choice |
|---|---|
| Who can self-start | Any responder with a valid `ypat_` partner token, for their own open (`origin = manual`, not cancelled, not done) assignment only |
| Where the new actions live | `responder-api` (already does partner-token auth + per-caller assignment scoping via `loadAssignment`) — not `responder-track`, which stays lead/admin-only for `start`/`stop` |
| Token minted | Same shape and TTL as the SMS flow: opaque token, SHA-256 hash stored on `event_responders.track_token_hash`, `track_token_expires_at` = mint + 7 days |
| `ping` | Unchanged. The bot calls the existing `responder-track` `ping` action directly with the token — it needs no user auth, only the token, exactly as the web tracker page does today |
| Multiple open assignments | Bot asks the volunteer which one (using the existing `list_open_events` action) before calling `start_live_track` |
| Stop on report complete | Yes — `responder-api` `complete` (mode `"complete"` of `handleSave`) also clears the track token and deletes the live-location row for that assignment |
| Stop from Telegram | Bot calls the new `stop_live_track` action when it detects the volunteer stopped sharing or the `live_period` ended. No bot command needed for this. |
| SMS eligibility / allowlist (`LIVE_TRACK_SMS_ALLOWLIST`) | Does not apply — this path has no SMS step, so no allowlist gate |
| Consent scope | Reuses the existing `responder:fill` grant — no new scope, no updated consent screen. See "Consent scope" below. |

## Consent scope

This spec deliberately **reuses the existing `responder:fill` grant** for `start_live_track`/`stop_live_track`, rather than introducing a new OAuth scope with its own consent screen. This needs calling out explicitly because it touches a locked decision in two depended-upon specs: `2026-08-24-...-partner-responder-api-design.md`'s consent copy lists only report-filling ("השלמת דיווחי אירועים: קילומטרים, טיפול, לוחיות, מדיה") with no mention of location, and `2026-08-30-...-telegram-mcp-style-connect-design.md` names "expanding scope beyond `responder:fill`" as a non-goal.

**Rationale for reusing the existing grant rather than adding a new scope:** live tracking is not a passive, always-on capability unlocked by the grant — it only starts when the volunteer takes an explicit, per-trip action (`/trip` in the bot, or later accepting an assignment notification per "Future integration" below), for one assignment they already have write access to via the same grant (the same `loadAssignment(admin, userId, eventId)` scoping that already lets them fill/complete that assignment's report). The grant already authorizes the bot to read and write everything about the volunteer's own open assignments on their behalf; sharing a live position for the duration of that same assignment is treated as within that envelope, not a new category of access.

**This is the intended permanent design, confirmed explicitly, not a v1 shortcut:** there is exactly one consent moment — linking the Telegram bot (`2026-08-30-...-telegram-mcp-style-connect-design.md`'s `/oauth/authorize` flow). No separate GPS-specific consent prompt is ever shown, at link time or at `/trip` time, now or planned later. A future slice that wants tracking to persist independently of an explicit volunteer action, or wants a shift lead / dispatcher to trigger it from the bot side on the volunteer's behalf, would be a materially different capability and should revisit this — but "notify the volunteer of a new assignment and let them immediately start tracking" (below) is not that case and stays under the single existing consent.

## Future integration: starting from an event-assignment notification (not built now)

`2026-09-04-yahpaz-profile-telegram-link-design.md`'s Part B plans a signed webhook (`assignment_created`, delivered to the bot server's `webhook_url`, payload `{ id, user_id, event_id, event_type, ...minimal event summary }`) that lets the bot message a volunteer when they're newly assigned to an event. That Part B is plan-only and not built — this spec does not build it either. It's noted here only because, once it exists, it changes `/trip`'s entry point: instead of the volunteer running `/trip` cold and the bot calling `list_open_events` to ask which assignment (see "Multiple open assignments" above), the assignment-notification message already carries `event_id`. An "accept" action on that message can call `start_live_track { event_id }` directly, skipping `list_open_events` entirely for that path. `start_live_track` as specified above already supports this with no changes — it takes `event_id` and doesn't care how the bot obtained it. `/trip` run cold (no known `event_id`) keeps needing the `list_open_events` picker step; this becomes a second, more direct entry point into the same action, not a replacement for it.

## Architecture

```
Volunteer: /trip
        │
        ▼
Bot → responder-api { action: "list_open_events" }        (existing, unchanged)
        │  (bot asks which one if > 1 open assignment)
        ▼
Bot → responder-api { action: "start_live_track",          [NEW]
                       event_id }
        │  ← { track_token }
        ▼
Bot prompts volunteer to use Telegram's native
"Share Live Location" in the chat
        │
        ▼
Telegram → bot webhook: periodic location edits
        │  (bot's own cadence / bookkeeping, out of scope here)
        ▼
Bot → responder-track { action: "ping",                    (existing, unchanged)
                         track_token, lat, lng, ... }
        │
        ▼
event_responder_live_locations upserted (unchanged)
        │
        ▼
Ops map: unchanged Realtime subscription renders the pin
        │
   ┌────┴─────────────────────────┐
   ▼                              ▼
Volunteer completes report   Telegram live-location
via responder-api "complete"  ends / volunteer stops
   │                              │
   ▼                              ▼
responder-api clears track    Bot → responder-api
token + deletes live row      { action: "stop_live_track", [NEW]
(inside handleSave)            event_id }
```

## New `responder-api` actions

Both actions authenticate exactly like every other `responder-api` action today: `x-yahpaz-partner-token` header or `Authorization: Bearer ypat_…`, resolved to `{ userId, grantId }` via `resolveToken`. Both load the assignment with the existing `loadAssignment(admin, userId, eventId)` (which already scopes to `responder_id = userId` and `event_id = eventId`) and reuse `standaloneOrError` for the same `origin = manual` / not-cancelled / not-done checks `save_draft` and `complete` already apply.

### `start_live_track`

Request:

```json
{ "action": "start_live_track", "event_id": "uuid" }
```

Behavior (mirrors `responder-track`'s `handleStart`, minus SMS, for exactly this one assignment):

1. Missing/blank `event_id` → 400 `חסר מזהה אירוע.`, same pattern as `save_draft`/`get_event`
2. `loadAssignment` → 404 `אין לך הרשאה לצפות באירוע זה או שהאירוע אינו קיים.` if not found
3. `standaloneOrError(assignment, true)` → same `shift_born` / `cancelled` / `locked` errors as `save_draft`
4. Mint a fresh opaque token: add a `randomTrackToken()` export to `supabase/functions/_shared/partnerCrypto.ts` (same shape as `responder-track`'s local `randomTrackToken` — unprefixed base64url of 32 random bytes, reusing the already-exported `randomBytes`), import it into `responder-api`. `responder-track`'s own local copy is left as-is — it is not touched by this slice. Hash the token with the already-imported `sha256Hex`, set `track_token_hash` / `track_token_expires_at` (mint + 7 days) on the `event_responders` row
5. Response: `{ ok: true, track_token, expires_at }`

Re-calling `start_live_track` for an assignment that already has a live, unexpired token simply re-mints (same as the SMS path re-minting is guarded by `tracking_sms_sent_at` there — here there is no "sent once" concept, so re-issuing is fine and expected if the bot restarts a `/trip` flow).

### `stop_live_track`

Request:

```json
{ "action": "stop_live_track", "event_id": "uuid" }
```

Behavior (mirrors `responder-track`'s `handleStop`, scoped to the caller's own assignment):

1. Missing/blank `event_id` → 400 `חסר מזהה אירוע.`
2. `loadAssignment` → same 404 as above
3. Delete the `event_responder_live_locations` row for this assignment id (if any)
4. Clear `track_token_hash` / `track_token_expires_at`
5. Response: `{ ok: true }`

Idempotent — calling it when nothing is active is not an error. Deliberately does **not** call `standaloneOrError` — stopping tracking should succeed even on a cancelled/done assignment, matching the fact that `stop_live_track` is also invoked from inside `complete` itself.

### `complete` (existing action, extended)

In `handleSave` mode `"complete"`, after the existing update to `event_responders` (`status: 'done'`) succeeds, also run the same cleanup as `stop_live_track` (delete the live-location row, clear the track token) for that assignment. `save_draft` (mode `"draft"`) is unaffected — an in-progress report does not stop tracking.

**Cleanup failure must not fail `complete`.** Same principle as `2026-08-17-...-live-location-tracking-design.md`'s "event save never depends on SMS or GPS succeeding": if the live-location delete or token-clear errors, log it and still return the existing success response (`{ ok: true, eventStatus, participationStatus }`). The report is done regardless of whether tracking cleanup succeeded; a stale token left behind is caught by the token's own 7-day expiry and by the map's 30-second pin staleness rule.

## Data model

No new tables or columns. Reuses, unchanged:

- `event_responders.track_token_hash` / `track_token_expires_at` (from `2026-08-17-...-live-location-tracking-design.md`)
- `event_responder_live_locations` (same table, same RLS, same Realtime publication)
- `oauth_access_tokens` (from the partner API — the `ypat_` token identifying the caller)

`responder-track`'s `ping` action is unchanged: it authenticates purely by matching `track_token_hash`, so it does not care whether the token was minted by a shift lead (`responder-track` `start`) or by the volunteer themselves (`responder-api` `start_live_track`).

## Bot server responsibilities (external — to document in the partner contract)

This repo does not build or own these; they belong to the Telegram bot server, same arms-length boundary as the rest of the partner API:

- `/trip` command: call `list_open_events`; if more than one result, present a chat picker; call `start_live_track { event_id }`; store `track_token` keyed by `chat_id` on the bot's own side
- Prompt the volunteer to use Telegram's native live-location share in that chat
- On each `edited_message` webhook carrying an updated `location`, call `responder-track` `ping { track_token, lat, lng, accuracy_m?, recorded_at }` — same shape the web tracker page already sends
- On Telegram indicating the live-location period ended, or the volunteer stopping sharing, call `stop_live_track { event_id }`
- Never persist any Yahpaz identifier alongside raw Telegram chat/user ids beyond what's already required for the existing OAuth grant lookup

## Known limitations (documented, not solved in v1)

- **Concurrent start, either direction**: if a shift lead triggers `responder-track` `start` (SMS) for an assignment that already has an active bot-driven track, it overwrites `track_token_hash` — the bot's cached token stops matching. Its next `ping` gets a `409` with `code: "ended"`, not `"invalid"`: `responder-track`'s `findByToken` cannot distinguish "this token was never valid" from "this token was valid but got replaced/stopped" — both look like "no row matches this hash" to it. The bot should treat `ended` the same way regardless of cause — "tracking was stopped externally" — and prompt the volunteer to run `/trip` again. The reverse also holds: if the volunteer runs `/trip` (or the bot re-calls `start_live_track`) while a shift-lead-triggered SMS tracker page is already open and live, the new token overwrites the old one and the web tracker page's next `ping` silently gets the same `409 ended` — with no bot-side awareness, since the bot isn't watching that page. Neither direction is solved here, same class as the existing "links to oldest registered app" limitation in the profile-connect design.
- **No mid-trip assignment switch**: if the volunteer picks the wrong assignment when asked, they must let the wrong track go stale (30s, per the existing staleness rule) or the bot must call `stop_live_track` on the wrong one and `start_live_track` on the right one — no atomic "switch" action.

## Testing (implementation)

- Pure: no new pure logic beyond what `liveTrack.ts` already covers (token TTL math, ping shape) — `start_live_track`/`stop_live_track` are thin Edge Function handlers over existing helpers
- No Edge Function test convention exists today (`supabase/functions/` has no `*.test.ts` files); this slice does not introduce one. Verification is manual, per below, same as `responder-track`/`responder-api`'s existing actions
- No live Telegram or GPS in automated tests — manual verification requires a real bot server, out of scope for this repo's test suite
- Manual (once a bot server exists): `/trip` → pick assignment → share live location → pin appears on ops map within one Telegram update cycle → complete the report → pin disappears and token is cleared

## Docs to update in the same slice

- `docs/partner-api.md` — add `start_live_track` / `stop_live_track` to the `responder-api` action table and request/response examples, same style as `list_open_events`/`save_draft`
- `public/partner-api/openapi.yaml` — add the two new actions to the Swagger contract
- `docs/superpowers/specs/2026-08-17-yahpaz-live-location-tracking-design.md` is **not** modified — it documents the SMS/lead path, which is unchanged; this doc supersedes nothing there, it adds a second trigger path into the same pipeline

## Complexity

**Small.** Two new thin `responder-api` actions reusing existing helpers (token mint/hash, `loadAssignment`, `standaloneOrError`) plus one extra cleanup call inside the existing `complete` handler. No new tables, no map changes, no new Realtime wiring. Roughly on the order of the profile Telegram-link button work, not a new subsystem.
