# Android — האירועים הפעילים שלי (pins, hides, add/remove)

**Date:** 2026-09-01  
**Status:** Implemented  
**Repos:** `op-yh-26` (schema only), `yahpaz-android` (UI + client)

## Problem

Long-press drag onto **האירועים הפעילים שלי** does not commit (stale drop check). Hide/pin lived in SharedPreferences and was wiped on cold start. Done/cancelled events could not be added.

## Decisions

| Topic | Choice |
|---|---|
| Clients | Android only. Web list unchanged. iOS out of scope |
| Add/remove | Visible **הוספה** / **הסרה** on each row. Drag remains secondary and must actually drop |
| Storage | `public.my_active_event_prefs` — not local prefs |
| Who | Signed-in user; own rows only (RLS) |
| Add | Any event the user can see in the unit list (any status, any lead, cancelled included) |
| Remove lock | Cannot remove when viewer is `shift_lead_id` **and** status is `draft` (אירוע בהזנה) **and** not cancelled |
| Auto board | All of the viewer’s non-cancelled `draft` events as lead (no time window), plus last-2-hours `in_progress` / `partial` as lead |
| Local prefs | Deleted. No migrate |

## Board merge

Visible ids, in order, de-duplicated:

1. Locked: viewer is lead, `draft`, not cancelled — always, even if a stale `hide` row exists
2. Auto: last-2-hours open events as lead, minus `hide` rows (locked already included)
3. Pins: `kind = pin`

Catalog list omits events already on the board (same as today). Search still can find them in the full unit query.

## Schema

`my_active_event_prefs`:

- `user_id uuid` not null → `profiles(id)` on delete cascade
- `event_id uuid` not null → `events(id)` on delete cascade
- `kind` enum `pin` | `hide` not null
- `created_at` / `updated_at` timestamptz
- primary key `(user_id, event_id)`

RLS: select/insert/update/delete where `user_id = auth.uid()`.

Before insert/update: if `kind = hide` and the event is the user’s non-cancelled `draft`, raise Hebrew `לא ניתן להסיר אירוע בהזנה שאתם אחמ״ש שלו.`

## Android

Load prefs with unit events. **הוספה** writes `pin` (or deletes `hide` if the event is already auto). **הסרה** writes `hide` when the event is auto; otherwise deletes the pin. Failure: toast, board unchanged.

`shift_lead_id` is selected on event list rows so the lock can be evaluated client-side as well.

## Out of scope

Web UI, iOS, board reorder, sharing, FCM.