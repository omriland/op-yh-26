# Yahpaz (יחפ״צ) — Duty availability (זמינות) — Design

**Date:** 2026-08-17  
**Repo:** `yhpz-2026`  
**Status:** Approved in brainstorming (Approach A: columns on `profiles` + effective status on read + `pg_cron` write-back)  
**Depends on:** רשומה (`design-system-design-instructions/`), volunteer status (`20260816150459_volunteer_status.sql`), impersonation (`2026-08-11-yahpaz-super-admin-impersonation-design.md`)

## Problem

Volunteers need a single, self-serve **duty availability** flag — **זמין** or **לא זמין** — so the unit can later decide who to show on the map, in contacts, and in assignment. Admins need to see and override it on משתמשים without opening the user editor.

This is not last-action presence (`פעיל עכשיו` / `פעיל לאחרונה`) and not volunteer classification (`סטטוס`: מנהלה / חניכה / …).

## Goals (v1)

- Each profile has exactly one of **זמין** / **לא זמין**
- The volunteer sets it themselves
- Desktop: compact selector **next to the app-bar avatar**
- Mobile: same editor **inside the avatar menu** (not on the bar)
- **לא זמין** may include a return **calendar date**, or no date
- Return date → automatically **זמין** at **00:00 Asia/Jerusalem** that day
- **זמין** never has a return date
- Admins: new **זמינות** column on משתמשים; **inline** edit with the same fields (status + optional date)
- Hebrew-only RTL, רשומה tokens only
- Store and show only — do not yet filter map / contacts / assignment

## Non-goals (v1)

- Hiding or ranking לא זמין users on מפה, אנשי קשר, event/shift assignment, cockpit, or reports
- History / audit log of availability changes
- Recurring “unavailable every weekend”
- Time-of-day (date only)
- Push / email when someone goes unavailable
- Availability on פרופיל as a second editor (navbar / menu is enough)
- Changing the existing presence disc

## Decisions (locked)

| Topic | Choice |
|---|---|
| Storage | Columns on `profiles` |
| Statuses | `available` / `unavailable` |
| Return | `available_from date` nullable; **זמין** always `null`; **לא זמין** `null` or a date **after today** (Israel) |
| Flip moment | 00:00 Asia/Jerusalem **on** `available_from` |
| Read | Effective status: if return date is today or earlier, treat as **זמין** even before cron |
| Write-back | `pg_cron` hourly: persist overdue rows to `available` + `null` |
| Self-serve desktop | Control next to avatar |
| Self-serve mobile | Row inside avatar menu → Dialog |
| Admin | Same editor, inline from the table cell / card chip |
| Impersonation | Navbar / menu control **view-only** (like תפוצה). Admins still edit from משתמשים. |
| Default | Existing and new users: **זמין** |

## Schema

On `public.profiles`:

| Column | Type | Default |
|---|---|---|
| `availability` | `public.availability_status` enum (`available`, `unavailable`) `not null` | `available` |
| `available_from` | `date` | `null` |

Hebrew labels: `available` → `זמין`; `unavailable` → `לא זמין`.

### Constraints

Israel “today”: `(timezone('Asia/Jerusalem', now()))::date`.

CHECK:

- `availability = 'available'` ⇒ `available_from IS NULL`
- `availability = 'unavailable'` ⇒ `available_from IS NULL` **or** `available_from >` Israel today

Client and trigger use the same rule. Picking **today** is invalid (`בחרו תאריך מהמחר או השאירו ריק.`) because 00:00 that day has already passed.

### Effective status

Pure helper (SQL + TypeScript, same cases):

| Stored | `available_from` vs Israel today | Effective |
|---|---|---|
| `available` | `null` | זמין |
| `unavailable` | `null` | לא זמין |
| `unavailable` | future | לא זמין |
| `unavailable` | today or past | זמין |

UI always renders **effective** status. After cron, stored matches effective.

### Cron

`public.apply_due_availability()` — `security definer`, `search_path = public`.

```sql
update public.profiles
set availability = 'available',
    available_from = null
where availability = 'unavailable'
  and available_from is not null
  and available_from <= (timezone('Asia/Jerusalem', now()))::date;
```

Hourly `pg_cron` (same DST-safe hourly schedule family as lifetime stats: `5 * * * *`). Cheap `UPDATE`; overdue rows are a no-op after the first flip. Other protect triggers ignore this write because they only fire on their own columns.

### Write permission

`BEFORE UPDATE` trigger on `profiles` when `availability` / `available_from` change:

- Service role / `auth.uid()` null → allow
- `has_role(auth.uid(), 'admin')` → allow (any row)
- `auth.uid() = NEW.id` → allow (own row)
- else exception `אין הרשאה לעדכון זמינות.`

Also re-check the CHECK rule and force `available_from = null` when setting `available`.

Other profile columns unchanged. Clients `update` **only** these two columns from the availability editor. Admin user-dialog save must not wipe them: omit the columns so they stay as stored.

RLS already allows self or admin `UPDATE` on `profiles` (`profiles_update_own_or_admin`). Inline save and navbar save use that path; the trigger is the extra gate.

## UI

### Indicator (`AvailabilityDot`)

Not the presence disc. Two concentric circles, **no blur, no extra shadow**:

- Outer: `--space-4` (16 px), `--radius-full`, fill `--status-done-tint` / `--status-alert-tint`
- Inner: `--space-2` (8 px), `--radius-full`, fill `--status-done` / `--status-alert`

Never color-only: visible **זמין** / **לא זמין** next to the disc; `title` + visually-hidden text. Works on Field (users table) and Command (app bar).

### Editor (`AvailabilityEditor`)

Shared by app bar, avatar menu, and משתמשים:

1. Choice chips / radios: `זמין` · `לא זמין` — write immediately on click; success toast `הזמינות עודכנה.`
2. If לא זמין: date field `תאריך חזרה` (`type="date"`, `min` = tomorrow Israel) + helper `ללא תאריך — השאירו ריק.` — write on change; editor stays open so a date can still be set
3. Choosing זמין clears the date and closes the editor

No `שמירה` / `ביטול`. Dialog (mobile menu + mobile users card) and desktop popover share the same editor. Choice rows: padding-inline `--space-4`, padding-block `--space-2`.

Disabled while impersonating. Caption: `צפייה כמשתמש — לא ניתן לשנות זמינות.`

### Desktop app bar

Separate control **inline-start of the avatar** (still at the user cluster on inline-end of the bar). Disc + label, min height 40 px, tap target ≥ 40 px desktop. Does **not** open the user menu. `aria-label="זמינות"`, `aria-expanded` on the popover.

### Mobile avatar menu

Row under the name/callsign header: disc + **זמין** / **לא זמין** (+ caption `חזרה ב־DD.MM.YYYY` when a future date exists). Tap opens Dialog with `AvailabilityEditor`. Not a date picker inside the menu.

### משתמשים

Column **זמינות** immediately after **סטטוס**.

Cell: disc + label; if effective לא זמין and future `available_from`, caption `חזרה ב־DD.MM.YYYY` (`--type-caption`, `--text-muted`). Click the cell (not the whole row) opens the editor popover; choice/date writes immediately; row updates without full reload if possible.

Mobile card: same chip in the chip row (with role + volunteer-status). Tap opens Dialog.

Search: include `זמין` / `לא זמין` so the existing users search finds them.

Create-user dialog: no extra field; default **זמין**.

## Copy

| Surface | Hebrew |
|---|---|
| Status | `זמין` / `לא זמין` |
| Column / control | `זמינות` |
| Date | `תאריך חזרה` |
| Date helper | `ללא תאריך — השאירו ריק.` |
| Date error | `בחרו תאריך מהמחר או השאירו ריק.` |
| Return caption | `חזרה ב־DD.MM.YYYY` |
| Success | `הזמינות עודכנה.` |
| Failure | `עדכון הזמינות נכשל.` |
| Impersonation | `צפייה כמשתמש — לא ניתן לשנות זמינות.` |
| Trigger | `אין הרשאה לעדכון זמינות.` |

## Errors

- Invalid date: field error, no write
- Network / RLS / trigger: failure toast, draft stays open
- Cron miss: UI still correct via effective status; next hourly job writes the row

## Tests

- Effective status: available; unavailable no date; unavailable future; unavailable today; unavailable past
- Write validation: זמין clears date; today rejected; tomorrow accepted; past rejected
- Trigger: self ok; admin on other ok; non-admin on other rejected
- `apply_due_availability`: flips due rows; leaves future and open-ended unavailable
- Search matches `זמין` / `לא זמין`

## Design-system follow-through (implementation)

Update `design-system-design-instructions/screens/admin.md` (column + inline editor) and app-bar notes in `06-components.md`. Indicator measurements live there; no new color tokens.

## Out of scope (later)

Do not hide לא זמין users from מפה, אנשי קשר, or assignment pickers. Maps already gray those pins (`לא זמין` / `לא זמין עד` hover). Ranking / filtering is later.
