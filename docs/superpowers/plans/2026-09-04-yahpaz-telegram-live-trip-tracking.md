# Telegram Live Trip Tracking Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a bot-linked volunteer self-start live GPS tracking for one of their own open assignments from the Telegram bot's `/trip` command, reusing the existing SMS-flow's token/ping/map pipeline unchanged.

**Architecture:** Two new thin `responder-api` actions (`start_live_track`, `stop_live_track`) that mint/clear the same `track_token_hash`/`track_token_expires_at` columns the SMS flow already uses, scoped to the caller's own assignment via the existing `loadAssignment`/`standaloneOrError` helpers. The bot then calls the **existing, unchanged** `responder-track` `ping` action directly with the token. `complete` is extended to also stop tracking. No new tables, no frontend/map changes.

**Tech Stack:** Deno Edge Functions (Supabase), TypeScript, existing `_shared/partnerCrypto.ts` helpers.

**Spec:** `docs/superpowers/specs/2026-09-04-yahpaz-telegram-live-trip-tracking-design.md`

## Global Constraints

- Edge-only change. Do not touch `src/` or run `npm run build`/`npm test` for this work — nothing in the frontend changes.
- This environment has no `deno` or `supabase` CLI installed and no local Supabase project (`.env.local` does not exist) — there is no way to locally type-check, serve, or curl-test these Edge Functions in this session. Verification is careful manual read-through against the exact existing code patterns in each file, plus the spec-compliance and code-quality subagent review stages. Do not attempt to install or configure `deno`/`supabase` CLI as part of this plan.
- No existing `*.test.ts` convention for `supabase/functions/` in this repo — do not add one.
- Match existing code style exactly in each file (Hebrew error strings, `trim()` helper, `json(status, body)` from `../_shared/cors.ts`, etc.) — do not introduce new conventions.
- Commit after each task, following this repo's existing commit style (see `git log`).

---

## Chunk 1: Implementation

### Task 1: Add `randomTrackToken()` to `_shared/partnerCrypto.ts`

**Files:**
- Modify: `supabase/functions/_shared/partnerCrypto.ts`

- [ ] **Step 1: Add the token generator**

Find:

```ts
export function randomAccessToken(): string {
  return `ypat_${bytesToBase64Url(randomBytes(32))}`;
}
```

Replace with:

```ts
export function randomAccessToken(): string {
  return `ypat_${bytesToBase64Url(randomBytes(32))}`;
}

/** Opaque live-track token: unprefixed base64url of 32 random bytes (same shape as responder-track's local randomTrackToken). */
export function randomTrackToken(): string {
  return bytesToBase64Url(randomBytes(32));
}
```

`responder-track/index.ts`'s own local `randomTrackToken`/`sha256Hex` are untouched by this plan — this is a new, separate export for `responder-api` to use, not a refactor of `responder-track`.

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/_shared/partnerCrypto.ts
git commit -m "Add randomTrackToken to partnerCrypto for responder-api self-service tracking"
```

---

### Task 2: Add `start_live_track` / `stop_live_track` to `responder-api`, extend `complete`

**Files:**
- Modify: `supabase/functions/responder-api/index.ts`

Depends on Task 1 (`randomTrackToken` must exist in `_shared/partnerCrypto.ts` first).

- [ ] **Step 1: Import `randomTrackToken`**

Find:

```ts
import { sha256Hex } from "../_shared/partnerCrypto.ts";
```

Replace with:

```ts
import { sha256Hex, randomTrackToken } from "../_shared/partnerCrypto.ts";
```

- [ ] **Step 2: Add the track-token TTL constant**

Find:

```ts
const MEDIA_MAX_BYTES = Math.floor(1.5 * 1024 * 1024);
const MEDIA_CAP = 20;
const JPEG_ONLY = "לא ניתן להעלות קובץ זה. בחרו תמונה.";
const JPEG_TOO_LARGE = "הקובץ גדול מדי. בחרו תמונה אחרת.";
```

Replace with:

```ts
const MEDIA_MAX_BYTES = Math.floor(1.5 * 1024 * 1024);
const MEDIA_CAP = 20;
const JPEG_ONLY = "לא ניתן להעלות קובץ זה. בחרו תמונה.";
const JPEG_TOO_LARGE = "הקובץ גדול מדי. בחרו תמונה אחרת.";
/** Same leak-cap TTL as the SMS flow (responder-track). Not a trip-length cap — stop_live_track ends tracking explicitly. */
const TRACK_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
```

- [ ] **Step 3: Dispatch the two new actions**

Find:

```ts
    if (action === "save_draft") {
      return handleSave(admin, session.userId, body, "draft");
    }
    if (action === "complete") {
      return handleSave(admin, session.userId, body, "complete");
    }
    if (action === "add_treated_plate") {
```

Replace with:

```ts
    if (action === "save_draft") {
      return handleSave(admin, session.userId, body, "draft");
    }
    if (action === "complete") {
      return handleSave(admin, session.userId, body, "complete");
    }
    if (action === "start_live_track") {
      return handleStartLiveTrack(admin, session.userId, trim(body.event_id));
    }
    if (action === "stop_live_track") {
      return handleStopLiveTrack(admin, session.userId, trim(body.event_id));
    }
    if (action === "add_treated_plate") {
```

- [ ] **Step 4: Extend `handleSave`'s complete path + add the new handler functions**

This single edit does three things: (a) calls a new shared `stopLiveTracking` helper from inside `handleSave` when `mode === "complete"`, right after the existing status-recalc RPC and before the final response — matching the spec's "cleanup failure must not fail `complete`" requirement (the helper below never throws, it only logs); (b) defines that shared helper; (c) defines `handleStartLiveTrack` and `handleStopLiveTrack`, which both reuse `loadAssignment` (already scopes to `responder_id = userId`) exactly like every other per-assignment action in this file.

Find:

```ts
  const nextStatus = mode === "complete" ? "done" : "in_progress";
  const { data: updated, error } = await admin
    .from("event_responders")
    .update({
      vehicle_plate: formatPlate(draft.vehicle_plate) || null,
      odometer_start: start,
      odometer_end: end,
      route: draft.route.trim() || null,
      treatment_detail: draft.treatment_detail.trim() || null,
      treatment_notes: draft.treatment_notes.trim() || null,
      status: nextStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", assignment.id)
    .select("id")
    .maybeSingle();

  if (error || !updated) {
    return json(400, { error: "שמירת הדיווח נכשלה. בדקו את החיבור ונסו שוב." });
  }

  const { data: eventStatus } = await admin.rpc("apply_event_status_from_participations", {
    p_event_id: assignment.event_id,
  });

  return json(200, {
    ok: true,
    eventStatus: eventStatus ?? null,
    participationStatus: nextStatus,
  });
}

async function handleAddPlate(
```

Replace with:

```ts
  const nextStatus = mode === "complete" ? "done" : "in_progress";
  const { data: updated, error } = await admin
    .from("event_responders")
    .update({
      vehicle_plate: formatPlate(draft.vehicle_plate) || null,
      odometer_start: start,
      odometer_end: end,
      route: draft.route.trim() || null,
      treatment_detail: draft.treatment_detail.trim() || null,
      treatment_notes: draft.treatment_notes.trim() || null,
      status: nextStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", assignment.id)
    .select("id")
    .maybeSingle();

  if (error || !updated) {
    return json(400, { error: "שמירת הדיווח נכשלה. בדקו את החיבור ונסו שוב." });
  }

  const { data: eventStatus } = await admin.rpc("apply_event_status_from_participations", {
    p_event_id: assignment.event_id,
  });

  if (mode === "complete") {
    await stopLiveTracking(admin, assignment.id);
  }

  return json(200, {
    ok: true,
    eventStatus: eventStatus ?? null,
    participationStatus: nextStatus,
  });
}

/** Shared by stop_live_track and complete. Never throws — logs and continues, matching "cleanup failure must not fail complete". */
async function stopLiveTracking(admin: SupabaseClient, assignmentId: string): Promise<void> {
  const { error: deleteError } = await admin
    .from("event_responder_live_locations")
    .delete()
    .eq("event_responder_id", assignmentId);
  if (deleteError) {
    console.error("responder-api: stopLiveTracking delete failed", deleteError);
  }

  const { error: updateError } = await admin
    .from("event_responders")
    .update({ track_token_hash: null, track_token_expires_at: null })
    .eq("id", assignmentId);
  if (updateError) {
    console.error("responder-api: stopLiveTracking update failed", updateError);
  }
}

async function handleStartLiveTrack(
  admin: SupabaseClient,
  userId: string,
  eventId: string,
): Promise<Response> {
  if (!eventId) return json(400, { error: "חסר מזהה אירוע." });
  const assignment = await loadAssignment(admin, userId, eventId);
  if (!assignment) {
    return json(404, { error: "אין לך הרשאה לצפות באירוע זה או שהאירוע אינו קיים." });
  }
  const blocked = standaloneOrError(assignment, true);
  if (blocked) return blocked;

  const token = randomTrackToken();
  const hash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + TRACK_TOKEN_TTL_MS).toISOString();
  const { error } = await admin
    .from("event_responders")
    .update({ track_token_hash: hash, track_token_expires_at: expiresAt })
    .eq("id", assignment.id);
  if (error) {
    return json(500, { error: "התחלת שיתוף המיקום נכשלה." });
  }
  return json(200, { ok: true, track_token: token, expires_at: expiresAt });
}

async function handleStopLiveTrack(
  admin: SupabaseClient,
  userId: string,
  eventId: string,
): Promise<Response> {
  if (!eventId) return json(400, { error: "חסר מזהה אירוע." });
  const assignment = await loadAssignment(admin, userId, eventId);
  if (!assignment) {
    return json(404, { error: "אין לך הרשאה לצפות באירוע זה או שהאירוע אינו קיים." });
  }
  await stopLiveTracking(admin, assignment.id);
  return json(200, { ok: true });
}

async function handleAddPlate(
```

Note `standaloneOrError(assignment, true)` deliberately gates `start_live_track` (same `shift_born`/`cancelled`/`locked` rules as `save_draft`) but `stop_live_track` deliberately does **not** call it — stopping tracking must succeed even on a cancelled/done assignment, since `complete` calls the same `stopLiveTracking` helper after the assignment is already `done`.

- [ ] **Step 5: Self-review**

Read the full modified file once. Confirm: `randomTrackToken`/`sha256Hex` imports resolve, `TRACK_TOKEN_TTL_MS` matches `responder-track/index.ts`'s own `TRACK_TOKEN_TTL_MS` value (7 days) exactly, no action name collides with an existing one, `stopLiveTracking` is defined once and used by both `handleStopLiveTrack` and `handleSave`, and every new function follows the existing `Promise<Response>` / `SupabaseClient` typing already used throughout the file.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/responder-api/index.ts
git commit -m "Add start_live_track/stop_live_track to responder-api; stop tracking on complete"
```

---

### Task 3: Document the new actions and the live-location ping endpoint in the partner contract

**Files:**
- Modify: `docs/partner-api.md`
- Modify: `public/partner-api/openapi.yaml`

This is the official contract the external Telegram bot developer reads (`https://yahpz.com/partner-api/`) — it must describe not only the two new `responder-api` actions but also that `ping` on the **separate** `responder-track` function is now something partners call directly (previously admin/lead-only, called only from the website).

- [ ] **Step 1: `docs/partner-api.md` — add to "What you can do"**

Find:

```markdown
- See who they are
- List **open standalone events** assigned to them
- Load one event (context + current draft + their vehicles + treated plates + photos)
- Save a draft or **complete** the report (same rules as השלמת הפרטים שלי)
- Add / remove / look up treated civilian plates
- Upload / list / update / delete **their** event photos
```

Replace with:

```markdown
- See who they are
- List **open standalone events** assigned to them
- Load one event (context + current draft + their vehicles + treated plates + photos)
- Save a draft or **complete** the report (same rules as השלמת הפרטים שלי)
- Start / stop live GPS location sharing for one of their own trips, and send location pings while it's active
- Add / remove / look up treated civilian plates
- Upload / list / update / delete **their** event photos
```

- [ ] **Step 2: `docs/partner-api.md` — document `start_live_track` / `stop_live_track`**

Find:

```markdown
#### Complete / draft validation (same as the website)
```

Replace with:

```markdown
### `start_live_track`

Start live GPS tracking for one of your own open assignments — same underlying mechanism as the SMS link a shift lead can trigger, but self-served from the bot (typically from a `/trip` command). Same write locks as `save_draft`: works while `pending` or `in_progress`; blocked on a cancelled or already-`done` assignment.

**Request**

```json
{ "action": "start_live_track", "event_id": "uuid" }
```

**200**

```json
{
  "ok": true,
  "track_token": "…",
  "expires_at": "2026-09-11T12:00:00.000Z"
}
```

Send location updates using `track_token` to **`responder-track`'s `ping` action** — a separate function, see "3. Live location ping" below. `expires_at` is a **7-day leak cap**, not a trip-length cap; call `stop_live_track` explicitly when the trip ends (or `complete` the report, which does this for you).

| HTTP | `error` | `code` |
|---|---|---|
| 400 | חסר מזהה אירוע. | |
| 404 | אין לך הרשאה לצפות באירוע זה או שהאירוע אינו קיים. | |
| 400 | אירוע זה אינו זמין דרך ה-API. | `shift_born` |
| 400 | לא ניתן לערוך דיווח שהושלם. רק אחמ״ש יכול לערוך. | `locked` |
| 400 | האירוע בוטל. | `cancelled` |

---

### `stop_live_track`

Stop live GPS tracking for one of your own assignments — deletes the current live-location pin and invalidates the token. **Idempotent**: calling it when nothing is active is not an error, and it works even on a cancelled or completed assignment (stopping is always allowed).

You do not need to call this after `complete` — completing a report already stops tracking for that assignment. Call it directly only if the volunteer stops sharing location (or you want to end tracking) before the report is complete.

**Request**

```json
{ "action": "stop_live_track", "event_id": "uuid" }
```

**200** `{ "ok": true }`

| HTTP | `error` |
|---|---|
| 400 | חסר מזהה אירוע. |
| 404 | אין לך הרשאה לצפות באירוע זה או שהאירוע אינו קיים. |

---

#### Complete / draft validation (same as the website)
```

- [ ] **Step 3: `docs/partner-api.md` — note that `complete` now also stops tracking**

Find:

```markdown
`eventStatus` is `done` only when **every** assigned responder on that event is `done`; otherwise `partial` (or `in_progress` if nobody has completed yet).
```

Replace with:

```markdown
`eventStatus` is `done` only when **every** assigned responder on that event is `done`; otherwise `partial` (or `in_progress` if nobody has completed yet).

Completing also stops live location tracking for this assignment (same effect as calling `stop_live_track`), if it was active.
```

- [ ] **Step 4: `docs/partner-api.md` — add a new "3. Live location ping" section**

Find:

```markdown
## Suggested bot flow
```

Replace with:

```markdown
## 3. Live location ping (`responder-track` — a separate function)

Forward each Telegram live-location update here using the `track_token` from `start_live_track`. **This call is authenticated purely by that opaque token in the body** — send the same **publishable anon key** you already use everywhere, in both `apikey` and `Authorization: Bearer`. Do **not** send your `ypat_` volunteer access token here; `responder-track` does not check it.

```http
POST /functions/v1/responder-track
apikey: {publishable_anon_key}
Authorization: Bearer {publishable_anon_key}
Content-Type: application/json
```

```json
{
  "action": "ping",
  "track_token": "…",
  "lat": 31.771959,
  "lng": 35.217018,
  "accuracy_m": 12,
  "recorded_at": "2026-09-04T12:00:00.000Z"
}
```

`accuracy_m` and `recorded_at` are optional (`recorded_at` defaults to the server's receive time). `lat` must be between -90 and 90, `lng` between -180 and 180.

**200** `{ "ok": true }`

| HTTP | `error` | `code` | Meaning |
|---|---|---|---|
| 400 | קישור המעקב אינו תקין או שפג תוקפו. | `invalid` | Missing/unrecognized `track_token` |
| 400 | קישור המעקב אינו תקין או שפג תוקפו. | `expired` | Token past its 7-day cap |
| 400 | מיקום לא תקין. | `invalid` | `lat`/`lng` missing or out of range |
| 409 | המעקב הסתיים. | `ended` | Tracking was stopped (`stop_live_track` / `complete` / assignment removed) |

On any of these, stop sending pings for that `track_token` and, if the volunteer wants to keep sharing, call `start_live_track` again to get a fresh token.

Only `ping` is documented here. `responder-track`'s `start` / `stop` / `load` actions are for the yahpz.com website only (the shift-lead SMS flow) and are **not** part of this contract — use `responder-api`'s `start_live_track` / `stop_live_track` instead.

---

## Suggested bot flow
```

- [ ] **Step 5: `docs/partner-api.md` — add the two new actions to the action index table**

Find:

```markdown
| `delete_media` | Delete own photo |
```

Replace with:

```markdown
| `start_live_track` | Start self-served live GPS tracking for one assignment |
| `stop_live_track` | Stop live GPS tracking for one assignment |
| `delete_media` | Delete own photo |
```

- [ ] **Step 6: `openapi.yaml` — add the `LiveTracking` tag**

Find:

```yaml
tags:
  - name: Linking
    description: Browser consent on yahpz.com
  - name: Auth
    description: App credentials → volunteer access token
  - name: Responder
    description: Fill API (requires ypat_ access token)
```

Replace with:

```yaml
tags:
  - name: Linking
    description: Browser consent on yahpz.com
  - name: Auth
    description: App credentials → volunteer access token
  - name: Responder
    description: Fill API (requires ypat_ access token)
  - name: LiveTracking
    description: Live GPS ping (track_token only, not ypat_ access token)
```

- [ ] **Step 7: `openapi.yaml` — add the two new actions to `/responder-api`'s description table, request oneOf/discriminator, and examples**

Find:

```yaml
        | `update_media` | Own photo metadata |
        | `delete_media` | Own photo |
```

Replace with:

```yaml
        | `update_media` | Own photo metadata |
        | `delete_media` | Own photo |
        | `start_live_track` | Start self-served live GPS tracking (track_token, 7-day cap) |
        | `stop_live_track` | Stop live GPS tracking (idempotent) |
```

Find:

```yaml
                - $ref: "#/components/schemas/UpdateMediaRequest"
                - $ref: "#/components/schemas/DeleteMediaRequest"
              discriminator:
                propertyName: action
                mapping:
                  whoami: "#/components/schemas/WhoamiRequest"
                  list_open_events: "#/components/schemas/ListOpenEventsRequest"
                  get_event: "#/components/schemas/GetEventRequest"
                  save_draft: "#/components/schemas/SaveDraftRequest"
                  complete: "#/components/schemas/CompleteRequest"
                  lookup_treated_plate: "#/components/schemas/LookupPlateRequest"
                  add_treated_plate: "#/components/schemas/AddPlateRequest"
                  remove_treated_plate: "#/components/schemas/RemovePlateRequest"
                  list_media: "#/components/schemas/ListMediaRequest"
                  upload_media: "#/components/schemas/UploadMediaRequest"
                  update_media: "#/components/schemas/UpdateMediaRequest"
                  delete_media: "#/components/schemas/DeleteMediaRequest"
```

Replace with:

```yaml
                - $ref: "#/components/schemas/UpdateMediaRequest"
                - $ref: "#/components/schemas/DeleteMediaRequest"
                - $ref: "#/components/schemas/StartLiveTrackRequest"
                - $ref: "#/components/schemas/StopLiveTrackRequest"
              discriminator:
                propertyName: action
                mapping:
                  whoami: "#/components/schemas/WhoamiRequest"
                  list_open_events: "#/components/schemas/ListOpenEventsRequest"
                  get_event: "#/components/schemas/GetEventRequest"
                  save_draft: "#/components/schemas/SaveDraftRequest"
                  complete: "#/components/schemas/CompleteRequest"
                  lookup_treated_plate: "#/components/schemas/LookupPlateRequest"
                  add_treated_plate: "#/components/schemas/AddPlateRequest"
                  remove_treated_plate: "#/components/schemas/RemovePlateRequest"
                  list_media: "#/components/schemas/ListMediaRequest"
                  upload_media: "#/components/schemas/UploadMediaRequest"
                  update_media: "#/components/schemas/UpdateMediaRequest"
                  delete_media: "#/components/schemas/DeleteMediaRequest"
                  start_live_track: "#/components/schemas/StartLiveTrackRequest"
                  stop_live_track: "#/components/schemas/StopLiveTrackRequest"
```

Find:

```yaml
              delete_media:
                summary: delete_media
                value:
                  action: delete_media
                  media_id: 00000000-0000-4000-8000-000000000002
      responses:
```

Replace with:

```yaml
              delete_media:
                summary: delete_media
                value:
                  action: delete_media
                  media_id: 00000000-0000-4000-8000-000000000002
              start_live_track:
                summary: start_live_track
                value:
                  action: start_live_track
                  event_id: 00000000-0000-4000-8000-000000000001
              stop_live_track:
                summary: stop_live_track
                value:
                  action: stop_live_track
                  event_id: 00000000-0000-4000-8000-000000000001
      responses:
```

- [ ] **Step 8: `openapi.yaml` — add the response schema + example**

Find:

```yaml
                  - $ref: "#/components/schemas/ListMediaResponse"
                  - $ref: "#/components/schemas/UploadMediaResponse"
              examples:
```

Replace with:

```yaml
                  - $ref: "#/components/schemas/ListMediaResponse"
                  - $ref: "#/components/schemas/UploadMediaResponse"
                  - $ref: "#/components/schemas/StartLiveTrackResponse"
              examples:
```

Find:

```yaml
                complete:
                  value:
                    ok: true
                    eventStatus: partial
                    participationStatus: done
        "400":
          $ref: "#/components/responses/BadRequest"
```

Replace with:

```yaml
                complete:
                  value:
                    ok: true
                    eventStatus: partial
                    participationStatus: done
                start_live_track:
                  value:
                    ok: true
                    track_token: "…"
                    expires_at: "2026-09-11T12:00:00.000Z"
        "400":
          $ref: "#/components/responses/BadRequest"
```

(`stop_live_track`'s `{ ok: true }` response is already covered by the existing `OkResponse` schema already in this `oneOf` list — no new schema ref needed for it.)

- [ ] **Step 9: `openapi.yaml` — add the new request/response schemas**

Find:

```yaml
    DeleteMediaRequest:
      type: object
      required: [action, media_id]
      properties:
        action:
          type: string
          enum: [delete_media]
        media_id:
          type: string
          format: uuid
    Draft:
```

Replace with:

```yaml
    DeleteMediaRequest:
      type: object
      required: [action, media_id]
      properties:
        action:
          type: string
          enum: [delete_media]
        media_id:
          type: string
          format: uuid
    StartLiveTrackRequest:
      type: object
      required: [action, event_id]
      properties:
        action:
          type: string
          enum: [start_live_track]
        event_id:
          type: string
          format: uuid
    StopLiveTrackRequest:
      type: object
      required: [action, event_id]
      properties:
        action:
          type: string
          enum: [stop_live_track]
        event_id:
          type: string
          format: uuid
    PingRequest:
      type: object
      required: [action, track_token, lat, lng]
      properties:
        action:
          type: string
          enum: [ping]
        track_token:
          type: string
          description: Opaque token from responder-api start_live_track
        lat:
          type: number
          format: double
          minimum: -90
          maximum: 90
        lng:
          type: number
          format: double
          minimum: -180
          maximum: 180
        accuracy_m:
          type: number
          nullable: true
        recorded_at:
          type: string
          format: date-time
          description: Defaults to the server's receive time if omitted
    Draft:
```

Find:

```yaml
    SaveCompleteResponse:
      type: object
      required: [ok, eventStatus, participationStatus]
      properties:
        ok:
          type: boolean
          enum: [true]
        eventStatus:
          type: string
          enum: [draft, in_progress, partial, done]
          description: done only when every assigned responder is done
        participationStatus:
          type: string
          enum: [pending, in_progress, done]
    LookupPlateResponse:
```

Replace with:

```yaml
    SaveCompleteResponse:
      type: object
      required: [ok, eventStatus, participationStatus]
      properties:
        ok:
          type: boolean
          enum: [true]
        eventStatus:
          type: string
          enum: [draft, in_progress, partial, done]
          description: done only when every assigned responder is done
        participationStatus:
          type: string
          enum: [pending, in_progress, done]
    StartLiveTrackResponse:
      type: object
      required: [ok, track_token, expires_at]
      properties:
        ok:
          type: boolean
          enum: [true]
        track_token:
          type: string
          description: Opaque token — forward to POST /responder-track (action ping) for each location update
        expires_at:
          type: string
          format: date-time
          description: 7-day leak cap, not a trip-length cap
    LookupPlateResponse:
```

- [ ] **Step 10: `openapi.yaml` — extend the shared error code enum**

Find:

```yaml
    ErrorWithCode:
      type: object
      required: [error]
      properties:
        error:
          type: string
        code:
          type: string
          enum: [invalid_token, expired, shift_born, locked, cancelled]
```

Replace with:

```yaml
    ErrorWithCode:
      type: object
      required: [error]
      properties:
        error:
          type: string
        code:
          type: string
          enum: [invalid_token, expired, shift_born, locked, cancelled, invalid, ended]
```

- [ ] **Step 11: `openapi.yaml` — add the new `/responder-track` path**

Find:

```yaml
        "404":
          description: Not assigned, missing event, or missing media
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorMessage"
              examples:
                event:
                  value:
                    error: אין לך הרשאה לצפות באירוע זה או שהאירוע אינו קיים.
                media:
                  value:
                    error: התמונה לא נמצאה.
        "405":
          $ref: "#/components/responses/MethodNotAllowed"

components:
```

Replace with:

```yaml
        "404":
          description: Not assigned, missing event, or missing media
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorMessage"
              examples:
                event:
                  value:
                    error: אין לך הרשאה לצפות באירוע זה או שהאירוע אינו קיים.
                media:
                  value:
                    error: התמונה לא נמצאה.
        "405":
          $ref: "#/components/responses/MethodNotAllowed"

  /responder-track:
    post:
      tags: [LiveTracking]
      operationId: responderTrackPing
      summary: Live location ping (track_token only — not your ypat_ token)
      description: |
        Forward each Telegram live-location update here using the `track_token` returned by
        `responder-api` `start_live_track`. This call is authenticated purely by that opaque
        token in the body — send the **publishable anon key** in `apikey` and `Authorization:
        Bearer`, not your `ypat_` volunteer access token.

        Only `ping` is documented here. `responder-track`'s `start` / `stop` / `load` actions
        are for the yahpz.com website only (shift-lead SMS flow) and are not part of this
        contract — use `responder-api` `start_live_track` / `stop_live_track` instead.
      security:
        - AnonKey: []
          AnonBearer: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/PingRequest"
            example:
              action: ping
              track_token: "…"
              lat: 31.771959
              lng: 35.217018
              accuracy_m: 12
              recorded_at: "2026-09-04T12:00:00.000Z"
      responses:
        "200":
          description: Success
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/OkResponse"
        "400":
          description: Invalid token, invalid lat/lng, or expired token
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorWithCode"
              examples:
                invalidToken:
                  value:
                    error: קישור המעקב אינו תקין או שפג תוקפו.
                    code: invalid
                expired:
                  value:
                    error: קישור המעקב אינו תקין או שפג תוקפו.
                    code: expired
                badLocation:
                  value:
                    error: מיקום לא תקין.
                    code: invalid
        "409":
          description: Tracking already ended for this assignment
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorWithCode"
              example:
                error: המעקב הסתיים.
                code: ended
        "405":
          $ref: "#/components/responses/MethodNotAllowed"

components:
```

- [ ] **Step 12: Self-review**

Read both modified files in full. Confirm the `openapi.yaml` is still valid YAML (consistent indentation, no duplicate keys — `StartLiveTrackRequest`/`StopLiveTrackRequest`/`PingRequest`/`StartLiveTrackResponse` each defined exactly once), every new `$ref` target exists, and `docs/partner-api.md`'s new sections read consistently with the existing ones (same heading levels, same Hebrew error string formatting, same table style).

- [ ] **Step 13: Commit**

```bash
git add docs/partner-api.md public/partner-api/openapi.yaml
git commit -m "Document start_live_track/stop_live_track and the live-location ping endpoint"
```

---

## Task 4: Final review

- [ ] Dispatch a final code-reviewer subagent over the whole diff (all three tasks together) against the spec at `docs/superpowers/specs/2026-09-04-yahpaz-telegram-live-trip-tracking-design.md` — confirm no scope creep (no frontend changes, no new tables, no changes to `responder-track/index.ts` itself), and that the "Known limitations" and "Consent scope" sections of the spec are still accurately reflected by what was built (nothing built here should have quietly added a new consent screen or scope check).
- [ ] Use superpowers:finishing-a-development-branch to decide merge / PR / keep-as-is with the user.
