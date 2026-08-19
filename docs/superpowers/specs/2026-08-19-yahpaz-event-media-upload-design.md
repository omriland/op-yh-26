# Yahpaz — Event media upload (תיעוד מצולם)

**Date:** 2026-08-19  
**Repo:** `op-yh-26` (web + DB + Storage)  
**Status:** Approved in brainstorming (Approach 1: event gallery + private bucket + browser compress)  
**Depends on:** `2026-08-09-yahpaz-responder-fill-design.md`, `2026-08-16-yahpaz-shift-born-events-design.md`, `2026-08-18-yahpaz-treated-plates-design.md`

## Problem

Responders photograph the scene and the civilian vehicles they treat. The official record has no place for those images. Fill is locked after `סיום דיווח`, so evidence that arrives later cannot be attached today.

## Goals

- Logged-in responders upload **images only** while filling an event, and **after** their report is done
- Compress in the browser to the smallest size that still shows treatment detail
- Optional link to a treated plate already on the event (`מספרי כלי רכב`)
- Optional short caption
- Required `מתי צולמה`: `לפני הטיפול` · `במהלך/לאחר הטיפול`
- Private Supabase Storage bucket
- Assigned crew can view every photo on the event; admin and shift-lead can view any event
- Uploader can edit own metadata and delete own photos
- Web only for this slice

## Non-goals

- Android / iOS clients (iOS remains on hold)
- Email fill-link (`responder-fill` Edge) — photos stay logged-in web only
- Video, PDF, or any non-image
- Admin / shift-lead upload or edit unless they are also assigned as a responder
- Replacing the image file in place (delete + new upload)
- Reports, search, or export of photos
- Making photos required to complete fill
- Public bucket or CDN URLs stored in the table

## Decisions (locked)

| Topic | Choice |
|---|---|
| Architecture | `event_media` table + private bucket `event-media` + client compress + direct upload |
| Vehicle link | Optional FK to `event_treated_plates` on the **same event** (Approach A) |
| After complete | Assigned responders may still **add**; uploader may **edit metadata / delete own** (Approach A) |
| Fill-link | No photos (logged-in web only) |
| Required to complete | No — zero photos is valid for draft and `סיום דיווח` |
| Cap | 20 photos per event (client + DB) |
| When-taken | Required select; no default |
| Caption | Optional, max 200 characters |
| Cancelled event | View existing; no add / edit / delete |
| Plate deleted | Photo stays; `treated_plate_id` set null |
| Unassigned later | View if still allowed by event SELECT; cannot edit/delete unless still assigned **and** `uploaded_by = auth.uid()` |
| Clients | Web fill, web shift-born fill, web event detail |

## Data model

```sql
create type public.event_media_taken_when as enum (
  'before_treatment',
  'during_after_treatment'
);

create table public.event_media (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  uploaded_by uuid not null references public.profiles (id),
  treated_plate_id uuid references public.event_treated_plates (id) on delete set null,
  caption text,
  taken_when public.event_media_taken_when not null,
  storage_path text not null unique,
  mime_type text not null default 'image/jpeg',
  byte_size int not null,
  width int,
  height int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (caption is null or char_length(caption) <= 200),
  check (byte_size > 0),
  check (mime_type = 'image/jpeg')
);
```

- `storage_path` format: `{event_id}/{id}.jpg` (matches the row `id`).
- Trigger **before insert/update**: if `treated_plate_id` is set, that plate must belong to this event — either `event_treated_plates.event_id = event_media.event_id`, or the plate’s `event_responder_id` points at an `event_responders` row with the same `event_id`.
- Trigger **before insert**: reject if the event already has 20 rows (`ניתן לצרף עד 20 תמונות לאירוע.` surfaced from the client; DB uses `raise exception` with `P0001` / errcode the client maps).
- Trigger **before insert/update/delete**: reject writes when `events.is_cancelled` is true.
- Index: `(event_id, taken_when, created_at)`.

### Storage

Private bucket `event-media`:

| Setting | Value |
|---|---|
| Public | false |
| Allowed MIME | `image/jpeg` |
| File size limit | 1.5 MiB (safety net after compress) |
| Path | `{event_id}/{media_id}.jpg` |

No public URLs. The client calls `createSignedUrl` (about 1 hour) when loading the gallery or lightbox.

### RLS — `event_media`

Reuse `has_role` and `is_assigned_to_event`.

**SELECT** — authenticated, and:

- `has_role(admin)` or `has_role(shift_lead)`, or
- `is_assigned_to_event(event_id)`

**INSERT** — `uploaded_by = auth.uid()`, assigned to the event, event not cancelled, count &lt; 20 (trigger).

**UPDATE / DELETE** — `uploaded_by = auth.uid()`, still assigned to the event, event not cancelled. Update may change `caption`, `treated_plate_id`, `taken_when`, `updated_at` only — not `storage_path` / `uploaded_by` / `event_id` / image metrics. Enforce with a trigger: those identity columns are immutable after insert.

Leads and admins have **no** extra write unless they pass the assigned-responder INSERT/UPDATE/DELETE rules.

### RLS — `storage.objects` (bucket `event-media`)

Folder `[1]` of the object name is `event_id`.

- **SELECT** — same visibility as `event_media` SELECT for that event.
- **INSERT** — assigned to that event, not cancelled, name equals `{event_id}/{uuid}.jpg`.
- **UPDATE** — none (no replace-in-place).
- **DELETE** — object owner path matches a row the user may DELETE, **or** the uploader is cleaning up after a failed insert (delete object they just wrote in the same session). Practical rule: assigned to the event **and** (`uploaded_by` on the matching `event_media` row is `auth.uid()`, **or** no `event_media` row exists yet for that path — orphan cleanup).

## Compression (`compressEventImage`)

Browser only. Canvas redraw (strips EXIF, including GPS).

| Step | Rule |
|---|---|
| Input | `image/jpeg`, `image/png`, `image/webp`, `image/heic`, `image/heif`, or any `image/*` that decodes |
| Reject | Video, PDF, empty, &gt; 20 MB original |
| Resize | Long edge 1600 px; never upscale |
| Output | JPEG, `mime_type = image/jpeg` |
| Quality | Start 0.72; if blob &gt; 700 KB try 0.60 then 0.50 |
| Fail over size | If still &gt; 1.5 MiB after 0.50 → client error, do not upload |
| HEIC decode fail | `לא הצלחנו לקרוא את התמונה. שמרו כ-JPEG או PNG ונסו שוב.` |

Keep `width` / `height` / `byte_size` from the compressed blob.

## Upload path

1. Native picker: `accept="image/*"` `multiple`. Do **not** set `capture` (that blocks the library on some phones).
2. Compress each file.
3. Create `id` (uuid). Upload to `{event_id}/{id}.jpg`.
4. Insert `event_media` with that `id` and path.
5. Insert fails → delete the storage object. Upload fails → no row.

Metadata edits after save never touch Storage.

## UI

Visual source of truth remains **רשומה**. No new colors, type, or radii. Signature structure: two contact-sheet bands — **לפני הטיפול** then **במהלך/לאחר הטיפול**. Square thumbs, hairline, `--radius-sm`, 3-up on mobile. Field theme on fill and on the detail content column.

Shared component `EventMediaGallery` on:

1. Standalone fill — after `מספרי כלי רכב`, before `הערות לטיפול`
2. Shift-born fill — after `מספרי כלי רכב`, before `הערות`
3. Event detail — on the **event block** (crew-wide, including shift-born)

Fill’s other fields stay read-only after `סיום דיווח`. The gallery stays writable for assigned responders (the exception locked above). Email fill-link does not mount the gallery.

### Add

Control label `הוספת תמונות`. Each picked file becomes a draft card: thumbnail; required select `מתי צולמה` (empty, dotted required underline, options `לפני הטיפול` · `במהלך/לאחר הטיפול`); optional `רכב` (treated plates on this event, first option `ללא שיוך לרכב`; **hide** the select when the event has zero plates); optional `תיאור` (placeholder `למשל: פגיעה בגלגל קדמי`).

Upload starts when `מתי צולמה` is set. Caption and plate may be patched after. Each draft card has a remove control that discards the file without uploading. The 20 cap counts **saved rows plus in-flight uploads**; drafts still missing `מתי צולמה` do not count. At 20, disable the picker; helper `ניתן לצרף עד 20 תמונות לאירוע.`

Leftover drafts missing `מתי צולמה` on `סיום דיווח` → field error `בחרו מתי צולמה כל תמונה.` (same idea as leftover plate digits). The responder either sets when-taken (upload) or removes the card. Draft save (`שמירת טיוטה`) does not require finishing those cards; unfinished drafts are not uploaded.

### View

Tap thumb → existing overlay (desktop dialog / mobile sheet): large image, when-taken, plate mark if linked, caption, uploader name, time (`DD.MM.YYYY, HH:MM`). Own photo (and still assigned, event not cancelled): `עריכה` / `מחיקה`.

Delete confirm: title `למחוק את התמונה?` body `לא ניתן לשחזר.` destructive `מחיקה` / secondary `ביטול`.

Empty event detail: `אין תמונות לאירוע זה.` plus add if allowed. Empty fill: add control only — no empty-state speech.

Sort within each band: `created_at` ascending.

### Copy

| Event | Hebrew |
|---|---|
| Added | `התמונה נוספה` |
| Updated | `התמונה עודכנה` |
| Deleted | `התמונה נמחקה` |
| Bad type | `לא ניתן להעלות קובץ זה. בחרו תמונה.` |
| Too large original | `הקובץ גדול מדי. בחרו תמונה אחרת.` |
| Compress/size fail | `לא הצלחנו לדחוס את התמונה. נסו תמונה אחרת.` |
| Network | `ההעלאה נכשלה. נסו שוב.` |
| Cap | `ניתן לצרף עד 20 תמונות לאירוע.` |
| Cancelled | Gallery view-only; no add |

Draft cards stay on screen after a failed upload so the responder can retry.

## Architecture (units)

| Unit | Does | Depends on |
|---|---|---|
| `compressEventImage` | Decode, resize, JPEG, strip EXIF | Canvas / `createImageBitmap` |
| `eventMedia` | List, signed URLs, upload, patch, delete | Supabase Storage + `event_media` |
| `EventMediaGallery` | Two-band annex, drafts, picker, lightbox, own edit/delete | `eventMedia` + treated plates on the event |
| Migration | Enum, table, cap trigger, plate-same-event trigger, immutable identity, bucket, RLS | `is_assigned_to_event`, `has_role` |

`responder-fill` Edge is unchanged. Complete does not send photos.

## Testing

- Compress: non-image rejected; JPEG output; long edge ≤ 1600; EXIF not required in unit tests if canvas is mocked.
- Caption &gt; 200 rejected; empty caption allowed.
- 20th upload allowed, 21st blocked.
- Leftover draft without `taken_when` blocks **complete**, not draft save.
- Plate FK: other-event plate rejected; deleted plate unlinks.
- Error strings match the copy table.
- No live-bucket E2E in this slice.

## Acceptance

1. Assigned responder on fill adds two JPEGs, sets when-taken, sees them in the matching bands; `סיום דיווח` succeeds with zero photos and with photos.
2. After done, the same responder adds another photo from event detail and from the read-only fill gallery.
3. A second assigned responder sees those photos, cannot edit or delete them, can add their own.
4. Admin / shift-lead not assigned to the event can open detail and view, not add.
5. Optional plate links only to plates on that event; removing the plate leaves the photo.
6. Cancelled event: gallery visible, writes blocked.
7. Fill-link page has no upload control.
8. Android / iOS unchanged.

## Files (expected)

**op-yh-26:** migration (table + bucket + RLS); `src/lib/compressEventImage.ts`; `src/lib/eventMedia.ts`; `EventMediaGallery`; wire `ResponderFillPage`, `ShiftBornFillPage`, `EventDetailPage`; tests; `design-system-design-instructions/screens/responder-fill.md` + `event-detail.md` (and a compact media annex note in `06-components.md` if a new control needs measurements).

**yahpaz-android / yahpaz-ios:** none in this slice.
