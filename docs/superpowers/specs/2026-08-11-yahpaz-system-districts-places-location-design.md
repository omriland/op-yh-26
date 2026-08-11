# Yahpaz — System שלוחות + Google Places location

Date: 2026-08-11  
Status: Approved for implementation

## Goal

Lock one system שלוחה named **תחנה / אחר / משוכפל** so admins cannot rename or delete it. When a shift-lead selects it on the event form, מיקום becomes a Google Places autocomplete field (Hebrew, Israel-biased) with a free-text option always first. Persist Hebrew location text plus optional place_id / lat / lng.

## Decisions (locked)

| Decision | Choice |
|---|---|
| Places integration | Client-side Maps JS + Places; `VITE_GOOGLE_MAPS_API_KEY` (referrer-restricted) |
| Storage on Google pick | `location` (HE text) + `location_place_id` + `location_lat` + `location_lng` |
| Storage on free-text | `location` only; place fields null |
| When autocomplete shows | Only for district `code = station_other_duplicated` (name: תחנה / אחר / משוכפל) |
| Location required | Yes, when that system שלוחה is selected |
| District switch | Clear location + place fields when entering or leaving the system שלוחה |
| System district identity | Stable `districts.code = station_other_duplicated`, not Hebrew name alone |
| Admin lock | No rename / delete / deactivate; `sort_order` allowed |
| API missing / fail | Fall back to free-text; location still required in Places mode |

## Schema

### `districts`

- Add `code text unique null`
- Seed / attach one row: `station_other_duplicated` → `תחנה / אחר / משוכפל`
- Trigger: rows with `code IS NOT NULL` cannot change `name` or `active`, cannot be deleted; `sort_order` updates OK

### `events`

- Keep `location text`
- Add nullable: `location_place_id text`, `location_lat double precision`, `location_lng double precision`

## Admin (הגדרות → שלוחות)

- System rows remain visible
- Hide עריכה / מחיקה; optional muted caption `מערכת`
- Client rejects update/delete; DB trigger is source of truth

## Event form

- Lookups include district `code`
- Non-system שלוחה: plain מיקום text (optional), as today
- System שלוחה: Places combobox; required non-empty `location`
- Dropdown: free-text row always first (`שימוש ב־"…" כפי שהוזן`), then Google suggestions (HE name + address)
- Typing after a Google pick clears place fields until a new pick or free-text confirm
- Error HE: `יש לבחור או להזין מיקום.`

## Ops (Google Cloud)

1. Billing + enable Maps JavaScript API + Places API (New)
2. API key restricted to those APIs
3. HTTP referrers: `yahpz.com`, `www.yahpz.com`, `yahpaz-2026.netlify.app`, `localhost:5173`
4. Env: `VITE_GOOGLE_MAPS_API_KEY` (Netlify + `.env.local`)
5. Budget / quota alert recommended

## Out of scope

- Map preview / pin UI
- Autocomplete for normal שלוחות
- Backfill geocode for legacy free-text
- Changing כביש validation for these שלוחות

## Verification

- Unit: system detection by code; clear-on-switch; required location; free-text vs Google payload; closed-list guards
- Manual: admin lock; Places mode only for three codes; free-text vs pick; district switch clears field
