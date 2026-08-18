# Yahpaz — Treated vehicle plates (מספרי כלי רכב)

**Date:** 2026-08-18  
**Repo:** `yhpz-2026` (web + Edge + DB) · `yahpaz-ios` · `yahpaz-android`  
**Status:** Approved in brainstorming (Approach 1: child table + repeating numeric field)  
**Depends on:** `2026-08-09-yahpaz-responder-fill-design.md`, `2026-08-16-yahpaz-shift-born-events-design.md`

## Problem

Responders treat civilian vehicles on an event and need to log those **licence plates**. Today “רכבים שטופלו” is only the lead’s kind × quantity (`event_treated_vehicles`). Fill has no plate list. The unit also wants model and color from the public registry, and the Israeli plate mark already used on the profile.

## Goals

- On **השלמת הפרטים שלי** (standalone) and on **shift-born fill**, add optional `מספרי כלי רכב`
- Type digits → Enter (or `הוספה`) commits one plate, opens an empty field for the next
- Lookup color + model from data.gov.il on commit; persist them
- Show committed / saved plates with the profile `LicensePlate` mark + `דגם · צבע`
- Show the same list on event detail (lead can see, not edit)
- Keep lead kind-counts unchanged

## Non-goals

- Extra data.gov.il packages (motorcycle, heavy truck, public, inactive)
- Lead editing this list on the event form
- Deriving kind-counts from plates
- Reports / search by treated plate
- Using the plate mark in other forms, tables, or the volunteer’s own `לוחית רישוי` select

## Decisions (locked)

| Topic | Choice |
|---|---|
| Storage | New table `event_treated_plates` (not `event_treated_vehicles`, not a `text[]`) |
| Standalone owner | Per participation (`event_responder_id`) |
| Shift-born owner | Shared on the event (`event_id`) — same XOR pattern as treated kinds |
| Required | No — zero plates is valid for draft and **סיום דיווח** |
| Plate shape | 7 or 8 digits; display/store with hyphens like volunteer plates (`formatPlate`) |
| Lookup | On commit only, one request, client → data.gov.il (CORS `*`) |
| Miss / WAF | Keep the plate; leave model/color null; plate is still valid |
| Detail | Lead/admin/crew **read**; no lead edit in this slice |
| Clients | Web fill + fill-token Edge + iOS + Android; web shift-born fill; event detail on each client that already shows treatment |

## Data model

```sql
create table public.event_treated_plates (
  id uuid primary key default gen_random_uuid(),
  event_responder_id uuid references public.event_responders (id) on delete cascade,
  event_id uuid references public.events (id) on delete cascade,
  plate_number text not null,
  plate_digits text generated always as (regexp_replace(plate_number, '\D', '', 'g')) stored,
  model text,
  color text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  check (
    (event_responder_id is not null and event_id is null)
    or (event_responder_id is null and event_id is not null)
  )
);
```

- Before insert/update, normalize with the existing plate helper so stored `plate_number` is `12-345-67` or `123-45-678`.
- Unique indexes on `plate_digits`: `(event_responder_id, plate_digits)` where responder-keyed; `(event_id, plate_digits)` where event-keyed. Same plate cannot appear twice on one list.
- `sort_order` is 0-based add order; replace-the-list on save rewrites 0..n-1.

### RLS

**SELECT** — same visibility as the event (admin, shift_lead, assigned responders), matching current treated-vehicle select (including peer select).

**INSERT / UPDATE / DELETE**

- Responder-keyed row: `responder_id = auth.uid()`, participation not `done`, event not `done`.
- Event-keyed row: `events.origin = 'shift'`, viewer assigned to that event, event not `done`.
- Lead/admin have **no** extra write in v1.

Fill-token path uses the existing Edge `responder-fill` (service role) and must write the same rows.

### Save

- **Standalone:** load/save with `responderFill` (web) and `responder-fill` Edge. On draft and complete: replace plates for that `event_responder_id` (delete missing, insert current, keep order). Enter does **not** hit the DB.
- **Shift-born:** extend `save_shift_born_event_fill` so plates replace in the same transaction as the rest of the shared fill. Optimistic `updated_at` unchanged.
- Leftover digits in the open field: **complete** fails with `השלימו או מחקו את המספר בתחתית.` Draft ignores leftover digits (does not save them).

## Fill UI

Place after פירוט הטיפול, before הערות לטיפול. Label `מספרי כלי רכב`.

| State | Control |
|---|---|
| Open field | Numeric, digits only, `inputMode=numeric`, mono, LTR isolate. Placeholder `xx-xxx-xx`. |
| Commit | Enter on desktop; also button `הוספה` (mobile number pads often have no Enter). Plain Enter here must **not** submit the form (`⌘/Ctrl+Enter` still submits). |
| Committed row | `LicensePlate` mark + caption + remove. Caption `{model} · {color}` when both known; if only one field returned, show that one; if neither, no caption. |
| Lookup in flight | Plate mark visible immediately; caption empty until the response. Do not block typing the next plate. No extra spinner required. |
| Next field | Always one empty field under the list. Leaving it empty is fine. |
| Read-only (done / event closed) | Same plate-mark stack as detail; zero rows → ledger `—`. |

### Validation (commit)

| Case | Behavior |
|---|---|
| Not 7 or 8 digits | Do not commit. Field error `יש להזין 7 או 8 ספרות.` |
| Duplicate on this list (digit match) | Do not commit. Field error `מספר זה כבר נוסף.` |
| Valid | Commit, format with hyphens, fire lookup, clear the open field |

Domain validation lives in web `src/lib` **and** iOS `YahpazDomain` **and** Android `:domain` (parity tests).

## Lookup (data.gov.il)

```
GET https://data.gov.il/api/3/action/datastore_search
```

| Param | Value |
|---|---|
| `resource_id` | `053cea08-09bc-40ec-8f7a-156f0677aff3` (active private & commercial) |
| `filters` | `{"mispar_rechev": <number>}` — digits only, `Number(...)`, no dashes, no leading zeros |
| `fields` | `tzeva_rechev,kinuy_mishari` |
| `limit` | `1` |

Map: `tzeva_rechev` → `color`, `kinuy_mishari` → `model`. Persist on the row.

- Fire **once per commit**. Never parallel lookups (WAF returns HTML).
- If the body does not start with `{`, treat as WAF/blocked → same as miss.
- HTTP 200 + empty `records` / `total: 0` → miss. A miss is **not** an invalid plate (other vehicle classes live in other packages; those are out of scope).
- Network failure: keep the plate, model/color null. Do not toast in a way that blocks the next plate.
- Event detail and later fill loads **read stored** model/color. Do not re-fetch on view.

Shared helper per client (web `src/lib/plateLookup.ts`, matching tests in iOS/Android domain). No API key.

## Event detail

- **Standalone:** on that כונן’s card, ledger row `מספרי כלי רכב` **after** `רכבים שטופלו`. Value = vertical stack of `LicensePlate` + caption (not a comma string). Empty → `—`.
- **Shift-born:** the shared list sits on the **event block** (one list for the crew), same chrome.
- Native screens that already show treatment fields get the same row.

The volunteer’s own `לוחית רישוי` (the car they drove) stays a formatted select/text — not this list.

## Design system

Update `06-components.md`: the license plate mark is allowed on **profile vehicles and treated-plate lists** (fill committed rows, fill read-only, event detail). Still not used in other forms or tables.

Update `screens/responder-fill.md` and `screens/event-detail.md` with the field, placement, and plate-mark stack.

Native apps port the existing web plate mark (IL euroband + hyphenated serial, 36 px, `--plate-*` tokens / Field Command colors).

## Architecture (units)

| Unit | Does | Depends on |
|---|---|---|
| Plate parse/validate | digits, 7/8, hyphen format, duplicate | existing `formatPlate` / `plateDigits` |
| `plateLookup` | one GET, parse JSON or WAF HTML, `{ model, color } \| null` | network |
| `event_treated_plates` | persist + RLS | owner XOR |
| Fill control | repeating field, commit, remove, leftover-on-complete | validate + lookup |
| Event detail stack | read-only plate marks | stored rows |
| `responder-fill` Edge | write plates on token save | service role |
| `save_shift_born_event_fill` | replace event-keyed plates | existing RPC |

## Testing

- Validate: 7 → format `XX-XXX-XX`; 8 → `XXX-XX-XXX`; 6/9 reject; duplicate digit match; leftover on complete vs draft.
- Lookup parser: hit (`שחור` / `REXTON`), empty records → null, HTML body → null; `713-86-301` → filter `71386301`.
- Save payload: order preserved; empty list allowed; XOR owner set correctly for standalone vs shift-born (unit tests on the mapper; RPC covered if an existing shift-born save test harness exists).

## Acceptance

1. Fill: add two plates with Enter / `הוספה`; third field stays empty; complete succeeds.
2. Complete with leftover 1–6 digits in the open field → error; clearing or committing it allows complete.
3. Known plate (e.g. `71386301`) shows plate mark + `REXTON · שחור` after lookup.
4. Unknown plate still commits; mark only, no caption.
5. Event detail shows those marks on the כונן card (standalone) or event block (shift-born).
6. Lead kind-counts UI unchanged.
7. iOS and Android fill behave the same; domain tests pass on both.

## Files (expected)

**op-yh-26:** migration; `responderFill` / `ResponderFillPage`; `responder-fill` Edge; `shiftBornFill` + RPC; `EventDetailPage`; `LicensePlate` usage; `plateLookup`; design-system screens + `06-components.md`.

**yahpaz-ios / yahpaz-android:** domain validation + lookup parser tests; fill repeating field; event/inbox detail row; plate mark component.
