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

1. `loadAssignment` → 404 `אין לך הרשאה לצפות באירוע זה או שהאירוע אינו קיים.` if not found
2. `standaloneOrError(assignment, forWrite: true)` → same `shift_born` / `cancelled` / `locked` errors as `save_draft`
3. Mint a fresh opaque token (`randomTrackToken` — reuse from `responder-track`'s helpers or duplicate the small crypto helper; see Implementation notes), hash it, set `track_token_hash` / `track_token_expires_at` (mint + 7 days) on the `event_responders` row
4. Response: `{ ok: true, track_token, expires_at }`

Re-calling `start_live_track` for an assignment that already has a live, unexpired token simply re-mints (same as the SMS path re-minting is guarded by `tracking_sms_sent_at` there — here there is no "sent once" concept, so re-issuing is fine and expected if the bot restarts a `/trip` flow).

### `stop_live_track`

Request:

```json
{ "action": "stop_live_track", "event_id": "uuid" }
```

Behavior (mirrors `responder-track`'s `handleStop`, scoped to the caller's own assignment):

1. `loadAssignment` → same 404 as above
2. Delete the `event_responder_live_locations` row for this assignment id (if any)
3. Clear `track_token_hash` / `track_token_expires_at`
4. Response: `{ ok: true }`

Idempotent — calling it when nothing is active is not an error.

### `complete` (existing action, extended)

In `handleSave` mode `"complete"`, after the existing update to `event_responders` (`status: 'done'`) succeeds, also run the same cleanup as `stop_live_track` (delete the live-location row, clear the track token) for that assignment. `save_draft` (mode `"draft"`) is unaffected — an in-progress report does not stop tracking.

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

- **Concurrent SMS start**: if a shift lead triggers `responder-track` `start` (SMS) for an assignment that already has an active bot-driven track, it overwrites `track_token_hash` — the bot's cached token stops matching and its next `ping` fails with `code: "invalid"`. The bot should treat that as "tracking was stopped externally" and prompt the volunteer to run `/trip` again. Not solved here, same class as the existing "links to oldest registered app" limitation in the profile-connect design.
- **No mid-trip assignment switch**: if the volunteer picks the wrong assignment when asked, they must let the wrong track go stale (30s, per the existing staleness rule) or the bot must call `stop_live_track` on the wrong one and `start_live_track` on the right one — no atomic "switch" action.

## Testing (implementation)

- Pure: no new pure logic beyond what `liveTrack.ts` already covers (token TTL math, ping shape) — `start_live_track`/`stop_live_track` are thin Edge Function handlers over existing helpers
- Edge Function unit-style coverage (matching existing `responder-api`/`responder-track` test conventions in this repo, if any): `start_live_track` rejects `shift_born`/`cancelled`/`done` assignments and assignments not owned by the caller; `stop_live_track` is idempotent and scoped to the caller; `complete` clears an active track token and live row
- No live Telegram or GPS in automated tests — manual verification requires a real bot server, out of scope for this repo's test suite
- Manual (once a bot server exists): `/trip` → pick assignment → share live location → pin appears on ops map within one Telegram update cycle → complete the report → pin disappears and token is cleared

## Docs to update in the same slice

- `docs/partner-api.md` — add `start_live_track` / `stop_live_track` to the `responder-api` action table and request/response examples, same style as `list_open_events`/`save_draft`
- `public/partner-api/openapi.yaml` — add the two new actions to the Swagger contract
- `docs/superpowers/specs/2026-08-17-yahpaz-live-location-tracking-design.md` is **not** modified — it documents the SMS/lead path, which is unchanged; this doc supersedes nothing there, it adds a second trigger path into the same pipeline

## Complexity

**Small.** Two new thin `responder-api` actions reusing existing helpers (token mint/hash, `loadAssignment`, `standaloneOrError`) plus one extra cleanup call inside the existing `complete` handler. No new tables, no map changes, no new Realtime wiring. Roughly on the order of the profile Telegram-link button work, not a new subsystem.
