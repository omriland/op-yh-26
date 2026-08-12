# Events list search — responder / shift-lead name & callsign

Date: 2026-08-12  
Status: approved design

## Problem

On the unit events list (shift lead / admin, desktop Command search), the text filter only matches `police_event_id`, road name, and location. Leads often look up events by who was on them (כונן or אחמ״ש name / או״ק). That is not possible today.

## Goal

Extend the existing unit-list search so a query also matches:

- Shift lead (`profiles.full_name`, `profiles.callsign`)
- Any assigned responder (`profiles.full_name`, `profiles.callsign`)

Keep matching the existing fields (מספר אירוע, כביש, מיקום).

## Non-goals

- Mobile search UI (chips-only stays)
- Search on **האירועים שלי**
- Full-text ranking / Hebrew stemming
- Matching `patrol_callsign` (event patrol field, not a person)
- Moving status chips to the server

## Approach

Server-side RPC returns matching event ids; client intersects with the already-loaded unit list and status chip. Chosen over expanding the list select + client haystack so search stays authoritative in Postgres and scales if the list grows.

## Behavior

| Input | Result |
|---|---|
| Empty / whitespace-only query | No RPC; show full fetched list filtered only by status chip |
| Non-empty needle | Debounced (~250ms) RPC; keep events whose id ∈ result **and** pass status chip |
| Substring match | Case-insensitive `ilike '%needle%'` on all fields listed below |
| `%` / `_` in needle | Escaped so they are literal characters |
| No matches | Existing empty-filter UI (`אין אירועים במצב זה` + ניקוי סינון) |
| RPC failure | Do not blank the page; short Hebrew error toast; fall back to status-chip-only filtering (ignore text) until the next successful search |

### Match fields

An event matches if the needle hits any of:

1. `events.police_event_id`
2. `events.location`
3. `roads.name` (via `events.road_id`)
4. Shift-lead profile: `full_name`, `callsign`
5. Any `event_responders` → responder profile: `full_name`, `callsign`

### UI

- Desktop unit list search placeholder →  
  `חיפוש לפי מספר אירוע, כביש, מיקום, שם או או״ק`
- Visually-hidden label unchanged in spirit (`חיפוש אירועים`)
- No new controls

## Server

### RPC

```sql
search_unit_event_ids(p_needle text) returns setof uuid
```

- **Language:** SQL or plpgsql, `stable`
- **Security:** `security invoker` so existing `events` / related RLS still applies
- **Auth gate:** if caller lacks `shift_lead`, `admin`, or `super_admin` via `has_role`, return no rows
- **Grants:** `execute` to `authenticated`; revoke from `public`
- **Matching:** `ilike` with escaped needle across the fields above; `distinct` event ids

Empty needle at the SQL layer may return no rows; the client must not call the RPC when the trimmed needle is empty.

### Migration

New file under `supabase/migrations/` (timestamp after existing 2026-08-12 migrations).

## Client

1. Keep `fetchEvents()` as the unit list source of truth for rows/payload.
2. When `query.trim()` is non-empty (debounced ~250ms), call `supabase.rpc('search_unit_event_ids', { p_needle })`.
3. `visible` = events whose `id` is in the RPC id set **and** match the status chip.
4. When query is empty, skip RPC; status chip only. Unit-scope text search is RPC-only (remove the old client haystack for `scope === 'unit'`).
5. On RPC error: toast in Hebrew; do not clear the list; fall back to status-chip-only until the next successful search.

Suggested helper location: `src/lib/events.ts` (e.g. `searchUnitEventIds(needle: string): Promise<string[]>`). Wire in `EventsPage` for `scope === 'unit'` only.

## Testing

- **RPC / SQL:** match by responder name, responder callsign, shift-lead name; still match police id / road / location; non–shift-lead/admin/super_admin gets empty set; `%`/`_` literal.
- **Client:** debounce; id ∩ status; empty query does not call RPC; failure path does not wipe the list.

## Acceptance

1. Shift lead types a כונן name or או״ק → matching unit events appear (with status chip still applied).
2. Same for אחמ״ש name / או״ק.
3. Existing מספר אירוע / כביש / מיקום search still works.
4. Clearing search restores the full (status-filtered) list.
5. Responder-only users are unaffected (no unit search / RPC returns nothing if called).
