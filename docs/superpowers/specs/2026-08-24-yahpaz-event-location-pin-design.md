# Event location pin (canonical coordinates)

**Date:** 2026-08-24  
**Status:** approved  
**Slice now:** cockpit map drag + persist + coords under מיקום  
**Later (not this slice):** responder arrival pin from Android (and iOS when that hold lifts)

## Why

כביש and מיקום are the dispatch description. The map pin is a separate, first-class fact: where the event actually is. A shift-lead can correct it by dragging. Later, a responder on scene will write the same pin from the native app. Google autocomplete/geocode may propose a pin; it must not overwrite a human-corrected pin.

## Canonical fields on `events`

| Column | Role |
|---|---|
| `location` | Free-text / Places label. Never changed by a map drag. |
| `location_place_id` | Google place when the text was a Places pick. Cleared when a human sets the pin. |
| `location_lat` / `location_lng` | **The pin.** Used by cockpit map, unit map later, event detail, live routing. |
| `location_pin_source` | Who/what last wrote the pin: `places` \| `geocode` \| `shift_lead` \| `responder`. |
| `location_pinned_at` | When the pin was last written. |
| `location_pinned_by` | Auth user who last wrote a human pin (`shift_lead` / `responder`). Null for Places/geocode. |

`responder` is reserved in the check constraint so native apps can write without another enum migration. This slice does **not** add responder UI, RLS, or RPCs. Future work: Android (default) writes `source=responder` on arrival; web/DB only if a new RPC/RLS is required.

## Lock rule

Sources `shift_lead` and `responder` are **locked**. Auto-geocode from כביש + מיקום must not move the pin. Editing those text fields still updates text only.

Unlock: explicit **חזרה למיקום מגוגל** (this slice, cockpit/event form) or a later responder/lead overwrite.

Places pick in מיקום is a new Google write: `source=places`, new coords, lock cleared.

## This slice (web cockpit)

1. Event pins on the cockpit map are draggable. Drop writes lat/lng, `source=shift_lead`, `pinned_at`/`pinned_by`, clears `location_place_id`. Does not change כביש or מיקום.
2. Persist immediately (selected event → form draft + existing autosave; other open events → direct `events` update).
3. Under מיקום, when coords exist: label **קואורדינטות**, mono LTR pair (`N.NNNNN, E.EEEEE`), copy control **העתקת קואורדינטות**, toast **הקואורדינטות הועתקו**. If locked: ghost **חזרה למיקום מגוגל**.
4. Unit מפה has no event pins today — do not add them here.

## Out of scope now

- Responder client write path, arrival flow, live-track interaction with the pin
- Persisting automatic geocode results (map may still geocode unlocked events for display)
- Reverse-geocode into מיקום after a drag
