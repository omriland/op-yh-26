# Event media upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Logged-in web responders attach compressed event photos (optional treated-plate link, required when-taken) on fill and event detail, including after `סיום דיווח`.

**Architecture:** Pure helpers for copy/cap/leftover/compress. Private Supabase bucket `event-media` + table `event_media` with RLS. Shared `EventMediaGallery` on standalone fill, shift-born fill, and event detail. Direct client upload after canvas JPEG compress. Email fill-link does not mount the gallery.

**Tech Stack:** Vite + React + TS, Vitest, Supabase Postgres/RLS/Storage. Hebrew RTL. רשומה tokens only.

**Spec:** `docs/superpowers/specs/2026-08-19-yahpaz-event-media-upload-design.md`

## Global Constraints

- Hebrew-only UI, full RTL (`lang=he`, `dir=rtl`)
- Do not kill/restart the user’s Vite server on `:5173`
- Semantic tokens only — no new hex/radii/type
- Web only; do not touch `yahpaz-android` or `yahpaz-ios`
- Do not change `responder-fill` Edge
- Copy from the spec table (toasts + errors) verbatim
- Cap 20 per event; JPEG after compress; long edge 1600; private bucket
- GitHub user `omriland`

## File map

**Create**
- `src/lib/eventMedia.ts` — types, copy, leftover, cap, caption, grouping, Storage API
- `src/lib/eventMedia.test.ts`
- `src/lib/compressEventImage.ts` — decode/resize/JPEG with injectable deps
- `src/lib/compressEventImage.test.ts`
- `src/components/events/EventMediaGallery.tsx`
- `supabase/migrations/20260819120000_event_media.sql`

**Modify**
- `src/lib/responderFill.ts` / `src/lib/responderFill.test.ts` — leftover media on complete
- `src/pages/ResponderFillPage.tsx` — gallery after plates; skip when `fillToken`; writable after done
- `src/pages/ShiftBornFillPage.tsx` — gallery after plates
- `src/pages/EventDetailPage.tsx` — gallery on event block
- `src/styles/components.css` — `.event-media-*`
- `design-system-design-instructions/screens/responder-fill.md`
- `design-system-design-instructions/screens/event-detail.md`
- `design-system-design-instructions/06-components.md` — compact media annex note

---

### Task 1: Domain helpers (copy, cap, leftover, grouping)

**Files:**
- Create: `src/lib/eventMedia.ts`
- Test: `src/lib/eventMedia.test.ts`

**Interfaces:**
- Consumes: nothing (pure)
- Produces:

```ts
export const EVENT_MEDIA_CAP = 20
export const EVENT_MEDIA_CAPTION_MAX = 200
export const EVENT_MEDIA_LEFTOVER_ERROR = 'בחרו מתי צולמה כל תמונה.'
export const EVENT_MEDIA_CAP_ERROR = 'ניתן לצרף עד 20 תמונות לאירוע.'
export const EVENT_MEDIA_CAPTION_ERROR = 'התיאור קצר עד 200 תווים.'
export const EVENT_MEDIA_BAD_TYPE = 'לא ניתן להעלות קובץ זה. בחרו תמונה.'
export const EVENT_MEDIA_TOO_LARGE = 'הקובץ גדול מדי. בחרו תמונה אחרת.'
export const EVENT_MEDIA_COMPRESS_FAIL = 'לא הצלחנו לדחוס את התמונה. נסו תמונה אחרת.'
export const EVENT_MEDIA_HEIC_FAIL = 'לא הצלחנו לקרוא את התמונה. שמרו כ-JPEG או PNG ונסו שוב.'
export const EVENT_MEDIA_NETWORK = 'ההעלאה נכשלה. נסו שוב.'
export const EVENT_MEDIA_EMPTY_DETAIL = 'אין תמונות לאירוע זה.'

export type EventMediaTakenWhen = 'before_treatment' | 'during_after_treatment'

export const EVENT_MEDIA_TAKEN_WHEN_LABEL: Record<EventMediaTakenWhen, string> = {
  before_treatment: 'לפני הטיפול',
  during_after_treatment: 'במהלך/לאחר הטיפול',
}

export type EventMedia = {
  id: string
  event_id: string
  uploaded_by: string
  uploader_name: string | null
  treated_plate_id: string | null
  caption: string | null
  taken_when: EventMediaTakenWhen
  storage_path: string
  mime_type: string
  byte_size: number
  width: number | null
  height: number | null
  created_at: string
  signed_url: string | null
}

export function leftoverEventMediaError(
  unfinishedDraftCount: number,
  mode: 'draft' | 'complete',
): string | undefined

export function captionError(caption: string): string | undefined

export function canAddMoreMedia(savedCount: number, inFlightCount: number): boolean

export function slotsRemaining(savedCount: number, inFlightCount: number): number

export function groupMediaByTakenWhen(
  items: readonly EventMedia[],
): { before: EventMedia[]; during: EventMedia[] }

export function eventMediaStoragePath(eventId: string, mediaId: string): string
```

- [ ] **Step 1: Write the failing tests** in `src/lib/eventMedia.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import {
  EVENT_MEDIA_CAP,
  EVENT_MEDIA_CAPTION_ERROR,
  EVENT_MEDIA_LEFTOVER_ERROR,
  canAddMoreMedia,
  captionError,
  eventMediaStoragePath,
  groupMediaByTakenWhen,
  leftoverEventMediaError,
  slotsRemaining,
  type EventMedia,
} from './eventMedia'

function media(patch: Partial<EventMedia> = {}): EventMedia {
  return {
    id: 'm1',
    event_id: 'e1',
    uploaded_by: 'u1',
    uploader_name: 'דנה',
    treated_plate_id: null,
    caption: null,
    taken_when: 'before_treatment',
    storage_path: 'e1/m1.jpg',
    mime_type: 'image/jpeg',
    byte_size: 1000,
    width: 800,
    height: 600,
    created_at: '2026-08-19T10:00:00.000Z',
    signed_url: null,
    ...patch,
  }
}

describe('leftoverEventMediaError', () => {
  it('ignores unfinished drafts on draft save', () => {
    expect(leftoverEventMediaError(2, 'draft')).toBeUndefined()
  })

  it('blocks complete when a draft is missing when-taken', () => {
    expect(leftoverEventMediaError(1, 'complete')).toBe(EVENT_MEDIA_LEFTOVER_ERROR)
  })

  it('allows complete with zero unfinished drafts', () => {
    expect(leftoverEventMediaError(0, 'complete')).toBeUndefined()
  })
})

describe('captionError', () => {
  it('allows empty and 200 chars', () => {
    expect(captionError('')).toBeUndefined()
    expect(captionError('א'.repeat(200))).toBeUndefined()
  })

  it('rejects 201 chars', () => {
    expect(captionError('א'.repeat(201))).toBe(EVENT_MEDIA_CAPTION_ERROR)
  })
})

describe('canAddMoreMedia', () => {
  it('allows the 20th slot and blocks the 21st', () => {
    expect(canAddMoreMedia(19, 0)).toBe(true)
    expect(canAddMoreMedia(19, 1)).toBe(false)
    expect(canAddMoreMedia(20, 0)).toBe(false)
    expect(slotsRemaining(18, 1)).toBe(1)
    expect(EVENT_MEDIA_CAP).toBe(20)
  })

  it('does not count unfinished drafts (caller omits them from inFlight)', () => {
    expect(canAddMoreMedia(19, 0)).toBe(true)
  })
})

describe('groupMediaByTakenWhen', () => {
  it('sorts each band by created_at ascending', () => {
    const grouped = groupMediaByTakenWhen([
      media({ id: 'b2', taken_when: 'before_treatment', created_at: '2026-08-19T12:00:00.000Z' }),
      media({ id: 'd1', taken_when: 'during_after_treatment', created_at: '2026-08-19T11:00:00.000Z' }),
      media({ id: 'b1', taken_when: 'before_treatment', created_at: '2026-08-19T10:00:00.000Z' }),
    ])
    expect(grouped.before.map((row) => row.id)).toEqual(['b1', 'b2'])
    expect(grouped.during.map((row) => row.id)).toEqual(['d1'])
  })
})

describe('eventMediaStoragePath', () => {
  it('is {eventId}/{mediaId}.jpg', () => {
    expect(eventMediaStoragePath('e1', 'm1')).toBe('e1/m1.jpg')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/eventMedia.test.ts`
Expected: FAIL — cannot find module `./eventMedia`

- [ ] **Step 3: Write minimal implementation** in `src/lib/eventMedia.ts` (helpers + types only; API functions in Task 4)

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/eventMedia.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/eventMedia.ts src/lib/eventMedia.test.ts
git commit -m "Add event media domain helpers for cap, leftover, and bands."
```

---

### Task 2: Browser compress helper

**Files:**
- Create: `src/lib/compressEventImage.ts`
- Test: `src/lib/compressEventImage.test.ts`

**Interfaces:**
- Consumes: copy constants from `eventMedia.ts`
- Produces:

```ts
export const EVENT_MEDIA_MAX_ORIGINAL_BYTES = 20 * 1024 * 1024
export const EVENT_MEDIA_MAX_OUTPUT_BYTES = Math.floor(1.5 * 1024 * 1024)
export const EVENT_MEDIA_MAX_LONG_EDGE = 1600
export const EVENT_MEDIA_QUALITY_STEPS = [0.72, 0.6, 0.5] as const

export type CompressOk = { ok: true; blob: Blob; width: number; height: number }
export type CompressFail = { ok: false; error: string }
export type ImageBitmapLike = { width: number; height: number }

export function rejectOriginalFile(file: Pick<File, 'type' | 'size'>): string | null
export function targetDimensions(
  width: number,
  height: number,
  maxLongEdge?: number,
): { width: number; height: number }
export function nextJpegQuality(byteSize: number, qualityIndex: number): number | null

export async function compressEventImage(
  file: File,
  deps?: {
    decode?: (blob: Blob) => Promise<ImageBitmapLike>
    encode?: (
      image: ImageBitmapLike,
      width: number,
      height: number,
      quality: number,
    ) => Promise<Blob>
  },
): Promise<CompressOk | CompressFail>
```

- [ ] **Step 1: Write failing tests** — reject video/empty/>20MB; `targetDimensions` never upscales, long edge 1600; `nextJpegQuality` steps 0.72→0.6→0.5 then null when still over 700KB; `compressEventImage` with injected decode/encode returns JPEG blob and HEIC decode throw maps to `EVENT_MEDIA_HEIC_FAIL`.

- [ ] **Step 2: Run** `npx vitest run src/lib/compressEventImage.test.ts` — expect FAIL

- [ ] **Step 3: Implement** default decode via `createImageBitmap`; default encode via canvas `drawImage` + `toBlob('image/jpeg', quality)`. Never upscale. Stop at first quality whose blob ≤ 700KB, else last step. If last blob > 1.5 MiB → `EVENT_MEDIA_COMPRESS_FAIL`. Non-`image/*` → `EVENT_MEDIA_BAD_TYPE`.

- [ ] **Step 4: Run tests** — PASS

- [ ] **Step 5: Commit** `Add client JPEG compress for event photos.`

---

### Task 3: Fill leftover validation

**Files:**
- Modify: `src/lib/responderFill.ts` — add optional 5th arg `unfinishedMediaDraftCount = 0` to `validateResponderFillDraft`; set `errors.event_media` from `leftoverEventMediaError`
- Modify: `src/lib/responderFill.ts` `ResponderFillErrors` to include `'event_media'`
- Test: `src/lib/responderFill.test.ts`

**Interfaces:**
- Consumes: `leftoverEventMediaError` from `eventMedia.ts`
- Produces: `validateResponderFillDraft(..., unfinishedMediaDraftCount?: number)`

- [ ] **Step 1: Failing test** — complete with `unfinishedMediaDraftCount: 1` → `errors.event_media === EVENT_MEDIA_LEFTOVER_ERROR`; draft mode ignores it; complete with `0` allows.

- [ ] **Step 2: Run** `npx vitest run src/lib/responderFill.test.ts` — FAIL (unknown field / unused arg)

- [ ] **Step 3: Wire the 5th argument** only on `mode === 'complete'`

- [ ] **Step 4: Tests PASS**

- [ ] **Step 5: Commit** `Block fill complete while a photo draft is missing when-taken.`

---

### Task 4: Migration (table, bucket, RLS, triggers)

**Files:**
- Create: `supabase/migrations/20260819120000_event_media.sql`

**Interfaces:**
- Produces: enum `event_media_taken_when`, table `event_media`, bucket `event-media`, policies, triggers

SQL must include:

1. Enum + table as in the spec (caption ≤ 200, jpeg mime, byte_size > 0).
2. Index `(event_id, taken_when, created_at)`.
3. `updated_at` trigger (same pattern as other tables: `new.updated_at = now()`).
4. `event_media_plate_same_event()` BEFORE INSERT/UPDATE OF `treated_plate_id`: plate null OK; else plate’s `event_id = new.event_id` OR plate’s `event_responder_id` → `event_responders.event_id = new.event_id`. Else `raise exception using errcode = 'P0001', message = 'plate_not_on_event'`.
5. `event_media_cap()` BEFORE INSERT: if `(select count(*) from event_media where event_id = new.event_id) >= 20` then `raise exception using errcode = 'P0001', message = 'event_media_cap'`.
6. `event_media_not_cancelled()` BEFORE INSERT/UPDATE/DELETE: if event `is_cancelled` then `raise exception using errcode = 'P0001', message = 'event_cancelled'`.
7. `event_media_immutable_identity()` BEFORE UPDATE: if `event_id`, `uploaded_by`, `storage_path`, `mime_type`, `byte_size`, `width`, `height` change → `raise exception using errcode = 'P0001', message = 'event_media_immutable'`.
8. RLS SELECT/INSERT/UPDATE/DELETE as spec (`has_role` admin|shift_lead or `is_assigned_to_event`; writes require `uploaded_by = auth.uid()` + assigned + not cancelled).
9. Bucket:

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-media', 'event-media', false, 1572864, array['image/jpeg']::text[])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
```

10. Storage policies on `storage.objects` for `bucket_id = 'event-media'`. Parse event id as `(storage.foldername(name))[1]` only when it matches `^[0-9a-fA-F-]{36}$`. SELECT same as table SELECT. INSERT: assigned + not cancelled + `name ~ '^[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}\.jpg$'`. No UPDATE. DELETE: assigned AND (matching `event_media.storage_path` has `uploaded_by = auth.uid()` OR no row for that path).

- [ ] **Step 1: Write the migration file**

- [ ] **Step 2: Apply to project `rtvizpsfvtjowbimugns`** via Supabase `apply_migration` (`name`: `event_media`, query = file body)

- [ ] **Step 3: Commit** `Add event_media table and private Storage bucket.`

Do not restart Vite.

---

### Task 5: Client Storage API

**Files:**
- Modify: `src/lib/eventMedia.ts` — add `listEventMedia`, `uploadEventMedia`, `updateEventMedia`, `deleteEventMedia`
- Test: `src/lib/eventMedia.test.ts` — unit tests for error mapping (`event_media_cap` → `EVENT_MEDIA_CAP_ERROR`, network → `EVENT_MEDIA_NETWORK`) via small `mapEventMediaError(message: string): string` helper. Do not hit live Storage.

**Interfaces:**

```ts
export function mapEventMediaError(message: string | undefined): string

export async function listEventMedia(eventId: string): Promise<EventMedia[]>
export async function uploadEventMedia(input: {
  eventId: string
  blob: Blob
  width: number
  height: number
  takenWhen: EventMediaTakenWhen
  treatedPlateId: string | null
  caption: string | null
}): Promise<{ ok: true; media: EventMedia } | { ok: false; error: string }>
export async function updateEventMedia(input: {
  id: string
  takenWhen: EventMediaTakenWhen
  treatedPlateId: string | null
  caption: string | null
}): Promise<{ ok: true } | { ok: false; error: string }>
export async function deleteEventMedia(input: {
  id: string
  storagePath: string
}): Promise<{ ok: true } | { ok: false; error: string }>
```

Upload: `crypto.randomUUID()` → `storage.from('event-media').upload(path, blob, { contentType: 'image/jpeg', upsert: false })` → insert row with that `id`. Insert fail → `storage.from('event-media').remove([path])`. List: select rows + join `profiles!event_media_uploaded_by_fkey(full_name)` + `createSignedUrl(path, 3600)` per row. Delete: delete row then `remove([path])`.

- [ ] **Step 1: Tests for `mapEventMediaError`**
- [ ] **Step 2: FAIL then implement mapping + API functions**
- [ ] **Step 3: `npx vitest run src/lib/eventMedia.test.ts` PASS**
- [ ] **Step 4: Commit** `Add event media Storage list, upload, patch, and delete.`

---

### Task 6: `EventMediaGallery` UI

**Files:**
- Create: `src/components/events/EventMediaGallery.tsx`
- Modify: `src/styles/components.css` — append `.event-media` rules using existing tokens only (`--space-*`, `--radius-sm`, `--stroke-hairline`, `--surface-raised`, `--text-*`, `--accent`, 3-column grid, square thumbs `aspect-ratio: 1`, `object-fit: cover`)

**Interfaces:**

```tsx
export type EventMediaGalleryProps = {
  eventId: string
  plates: ReadonlyArray<{ id: string; plate_number: string }>
  canWrite: boolean
  showEmptyCopy: boolean
  viewerId: string | null
  error?: string
  onUnfinishedChange?: (count: number) => void
}
```

Behavior from spec:
- Load `listEventMedia` on mount / after mutations
- Two bands with headings `לפני הטיפול` / `במהלך/לאחר הטיפול`
- `הוספת תמונות` hidden file input `accept="image/*"` `multiple` — **no** `capture`
- Disabled + hint `EVENT_MEDIA_CAP_ERROR` when `!canAddMoreMedia(saved, inFlight)`
- Draft card: thumb (object URL), required `SelectField` `מתי צולמה` (no default), optional `רכב` if `plates.length > 0` (`ללא שיוך לרכב` = `''`), optional `TextField` `תיאור` placeholder `למשל: פגיעה בגלגל קדמי`, remove discards
- Setting `taken_when` starts upload (`compressEventImage` then `uploadEventMedia`); toast `התמונה נוספה` / error keeps draft
- Tap saved thumb → existing `Dialog` (lightbox): image, when-taken, plate, caption, uploader, `formatDateTime`; own + `canWrite` → `עריכה` / `מחיקה`
- Edit: same fields, `updateEventMedia`, toast `התמונה עודכנה`
- Delete: confirm `למחוק את התמונה?` / `לא ניתן לשחזר.` / destructive `מחיקה`
- Empty: `showEmptyCopy` → `אין תמונות לאירוע זה.` plus add if `canWrite`. Fill (`showEmptyCopy=false`): add control only
- `onUnfinishedChange` = count of drafts missing `taken_when`
- Touch targets ≥ 44px; `prefers-reduced-motion` already global

- [ ] **Step 1: Implement component + CSS** (no screenshot test; visual via localhost HMR)
- [ ] **Step 2: Commit** `Add the event photo annex gallery.`

---

### Task 7: Wire fill + shift-born + detail

**Files:**
- Modify: `src/pages/ResponderFillPage.tsx`
- Modify: `src/pages/ShiftBornFillPage.tsx`
- Modify: `src/pages/EventDetailPage.tsx`

**ResponderFillPage**
- Track `unfinishedMediaDrafts`
- Pass into `validateResponderFillDraft` on complete
- Render `EventMediaGallery` after `TreatedPlatesField` / after plates ledger row when read-only, **before** notes
- **Do not render** when `fillToken` is set
- `canWrite = Boolean(user) && !fillToken && !ctx.is_cancelled`
- `showEmptyCopy={false}`
- `plates` from treated plates with ids: extend `TreatedPlate` usage — fill currently has no plate `id`. **Add optional `id?: string` on `TreatedPlate`** (already persisted rows have ids). `mapTreatedPlateRows` must keep `id`. New unsaved plates have no id yet — they cannot be linked until saved. Spec: link to plates **on the event**. For fill, use saved plates from context after load; after draft save, reload plates. Practical v1: pass plates that have `id` from the last loaded context; after a successful draft/complete reload, ids exist. Also: gallery `listEventMedia` is independent — plate dropdown uses `fetch` of `event_treated_plates` for this event (standalone: all plates on this event the viewer can SELECT — assigned crew can see peers’ plates after peer SELECT). Simplest: gallery loads plates itself via `event_treated_plates` select for the event (responder-keyed via join + event-keyed). Add `listEventMediaPlates(eventId)` in `eventMedia.ts` returning `{ id, plate_number }[]`.

Add in Task 5 or here:

```ts
export async function listEventMediaPlates(
  eventId: string,
): Promise<{ id: string; plate_number: string }[]>
```

Query responder-keyed plates with `event_responders.event_id = eventId` plus event-keyed `event_id = eventId`. Gallery can call this internally so pages only pass `eventId` + write flags — then `plates` prop can be omitted. **Lock:** gallery fetches plates itself; drop `plates` from props to avoid stale fill state.

Revised props:

```tsx
export type EventMediaGalleryProps = {
  eventId: string
  canWrite: boolean
  showEmptyCopy: boolean
  viewerId: string | null
  error?: string
  onUnfinishedChange?: (count: number) => void
}
```

- [ ] **Step 1: `listEventMediaPlates` + test that it is exported (mapper of union rows in a tiny pure `mergeMediaPlates(responderKeyed, eventKeyed)`)**
- [ ] **Step 2: Wire three pages**
  - Fill: `canWrite` as above; skip if `fillToken`
  - Shift-born: `canWrite = assigned or canManage` and `!event.is_cancelled` (leads on shift-born fill are often not in `event_responders` — **spec: leads do not upload unless assigned**). So `canWrite = !ctx.event.is_cancelled && event.responders.some(r => r.responder_id === user.id)`. Leads who are not assigned view-only.
  - Detail: same `canWrite`; `showEmptyCopy`; place after notes (end of event block) so the annex sits under the letterhead ledger
- [ ] **Step 3: `npx vitest run src/lib/eventMedia.test.ts src/lib/responderFill.test.ts src/lib/compressEventImage.test.ts`**
- [ ] **Step 4: Commit** `Wire event photos into fill and event detail.`

---

### Task 8: Design-system screens

**Files:**
- Modify: `design-system-design-instructions/screens/responder-fill.md` — field row `תיעוד מצולם` after plates, before notes; not required; writable after done; absent on fill-link
- Modify: `design-system-design-instructions/screens/event-detail.md` — event-block annex, two bands, empty copy
- Modify: `design-system-design-instructions/06-components.md` — short **Media annex** subsection: 3-up square thumbs, two when-taken bands, lightbox uses existing Dialog, required when-taken select

- [ ] **Step 1: Edit the three docs**
- [ ] **Step 2: Commit** `Document the event photo annex in רשומה.`

---

### Task 9: Verify

- [ ] **Step 1:** `npx vitest run src/lib/eventMedia.test.ts src/lib/compressEventImage.test.ts src/lib/responderFill.test.ts`
- [ ] **Step 2:** `npx tsc --noEmit`
- [ ] **Step 3:** Confirm terminals folder still has the user’s Vite; do not restart it
- [ ] **Step 4:** Manual smoke on `http://localhost:5173` (HMR): pick two images on fill, set when-taken, see bands; complete without photos still works; after done add from detail; fill-link has no control (if a token is handy)

---

## Spec coverage (self-review)

| Spec item | Task |
|---|---|
| Images only + compress | 2 |
| Optional treated-plate link | 4–6 (`listEventMediaPlates`, SET NULL) |
| Caption + required when-taken | 1, 6 |
| Private bucket | 4 |
| View crew / admin / lead | 4 RLS |
| Own edit/delete | 4–6 |
| After complete | 7 `canWrite` |
| Fill-link excluded | 7 `fillToken` |
| Cap 20 | 1, 4, 6 |
| Cancelled view-only | 4 trigger + 7 |
| Leftover drafts block complete | 3, 7 |
| Web only | file map |
| Design system | 8 |
