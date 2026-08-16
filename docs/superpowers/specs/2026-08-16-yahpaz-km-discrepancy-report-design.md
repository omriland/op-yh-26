# Yahpaz (יחפ״צ) — KM discrepancy report (אירועים עם פערי דיווח ק״מ) — Design

**Date:** 2026-08-16  
**Repo:** `yhpz-2026`  
**Status:** Approved in brainstorming (Approach 1: library kind + optional row action)  
**Depends on:** Reports library (`2026-08-14-yahpaz-reports-library-design.md`), PeriodPicker (`periodRange` / שימוש בדלק), auto-odometer (`2026-08-11-auto-odometer-end-design.md`)

## Problem

Admins need a chase list of participations where the shift-lead’s kilometers and the volunteer’s odometer delta do not match — and a one-click way to adopt the volunteer’s number as the official lead `total_km` (the number refunds already use).

## Goals (v1)

- New report kind in **דוחות וסטטיסטיקות**
- **Admin only** (`audience: admin`). אחמ״ש-only do not see the card
- One row per **volunteer-on-event** with a km gap
- PeriodPicker on **`events.event_date`**
- Compare lead `total_km` to responder km = `odometer_end − odometer_start`
- Include cancelled events, marked **בוטל**
- Hover / tap on **ק״מ מתנדב** → confirm → write lead `total_km` to that delta → row drops
- Tap row (other cells) → existing event detail; back keeps period + search
- Hebrew-only RTL, רשומה
- Code-only kind: lib + registry line. No in-app report builder. No schema / RPC / Netlify Functions

## Non-goals (v1)

- Changing the locked rule that **refunds and km sums use only `total_km`**. This report is the one approved exception that *reads* odometers, and the write updates `total_km` so later sums stay on that field
- Auto-sync when a lead later edits `total_km` on the event form (still out of scope per auto-odometer spec)
- Editing odometers from this report
- אחמ״ש or responder access
- Money, liters, shift km
- Configurable tolerance (any inequality counts)
- Audit log of replacements
- In-app report builder

## Kind

| Field | Value |
|---|---|
| `id` | `km_discrepancy` |
| Title | אירועים עם פערי דיווח ק״מ |
| Includes | אירועים בהם יש פער בין דיווח האחמ״ש לבין הק״מ שהזין המתנדב |
| Audience | `admin` |
| Date input | PeriodPicker → inclusive `{ from, to }` on `events.event_date` |
| Default period | 1st of current local month → today (`defaultPeriod()`) |
| Drill-in | `eventId` on every row (row click, not the action cell) |
| CSV filename | `פערי-דיווח-קמ.csv` |

Catalog visibility is unchanged: user sees a kind iff they are `admin`, or they are `shift_lead` and `audience === 'admin_and_shift_lead'`. This kind is `admin` only, so אחמ״ש-only never see it. `super_admin` is not a separate audience.

## Inclusion

A source participation becomes a row when **all** are true:

| Rule | Detail |
|---|---|
| Participation | `status = done` |
| Lead km | `total_km IS NOT NULL` (zero counts as entered) |
| Odometers | `odometer_start` and `odometer_end` both set |
| Gap | `(odometer_end − odometer_start) !== total_km` — any difference, including 1 ק״מ |
| Event date | `event_date` inclusive in `{ from, to }` |
| Event status | any (`draft` / `in_progress` / `partial` / `done`) |
| Cancelled | **included** |

“אחמ״ש finished filling” = `total_km` is set. There is no separate lead-done stamp.

Exclude: open participations (`pending` / `in_progress`), missing lead km, missing either odometer, equal numbers.

## Columns

| Header | Source | Empty |
|---|---|---|
| מספר אירוע | `police_event_id`; if cancelled: `בוטל · {id}` (same mark pattern as חריגי ק״מ on type). Cancelled with no id: `בוטל` | `—` if not cancelled and id missing |
| תאריך | `event_date` (`formatDate`) | — |
| כביש ומיקום | `road_name · location` (skip blanks) | `—` |
| מתנדב | `full_name · callsign` | `—` if both missing |
| אחמ״ש | shift-lead `full_name · callsign` | `—` if both missing |
| ק״מ אחמ״ש | `total_km` (`formatNumber`) | never empty for included rows |
| ק״מ מתנדב | `odometer_end − odometer_start` (`formatNumber`) | never empty for included rows |
| הפרש | מתנדב − אחמ״ש, signed (`formatNumber`; negative shows minus) | never empty; `0` cannot appear (excluded) |

**Sort.** `event_date` desc, then absolute הפרש desc, then מתנדב name asc.

**Search.** Live, client-side, after load. Existing runner substring-on-all-cells (`filterReportRows`). Placeholder: `חיפוש לפי מתנדב, מספר אירוע או מיקום`.

**CSV.** The eight columns above; values after period + search; UTF-8 BOM; no hover/action column; disabled when no rows.

## Replace action

Official km remains `event_responders.total_km`. The action copies the odometer delta into that field.

| Step | Behavior |
|---|---|
| Desktop hover | `HoverTip` `mode="always"` on **ק״מ מתנדב**: `החלפת הקילומטרים של האחמ״ש במספר זה` |
| Activate | Click / tap **ק״מ מתנדב** (not the rest of the row). `stopPropagation` so event detail does not open |
| Mobile | No hover. Same tap opens the confirm. Tip text is the dialog body lead-in |
| Confirm | Existing `Dialog`. Title: `החלפת קילומטרים?`. Body: `הקילומטרים שהזין האחמ״ש יוחלפו ב־{n} ק״מ לפי מד האוץ של המתנדב.` Actions: `ביטול` (close) · `החלפה` (primary) |
| Write | `UPDATE event_responders SET total_km = {n}` for that assignment id. **Do not** change `odometer_start` / `odometer_end`, participation status, or event status. `{n}` is the delta already shown on the row, recomputed in the write helper (do not trust a stale typed cell) |
| Success | Close dialog. Toast: `הקילומטרים עודכנו`. Drop that row from the loaded list (no full reload). Period + search stay |
| Failure | Keep the row. Toast: `עדכון הקילומטרים נכשל. בדקו את החיבור ונסו שוב.` Dialog closes |
| Auth | UI only on this admin-only kind. Existing RLS already lets `admin` (and `shift_lead`) update `event_responders`; no migration |

`fill_ready` email does not fire: `total_km` was already set.

## Runner

Desktop table (Command) / mobile cards (Field), same generic runner.

The action cell is the **only** new runner capability. Other kinds stay read-only.

On mobile cards, the card is no longer a single full-surface button when the kind has an action: title + non-action fields open event detail; **ק״מ מתנדב** is its own control.

| State | Copy |
|---|---|
| Invalid period | `טווח תאריכים לא תקין` |
| Load fail | `טעינת הדוח נכשלה. בדקו את החיבור ונסו שוב.` + `רענון` |
| No rows | `אין נתונים להצגה` |
| Loading | existing table/card skeletons |

## Architecture

Extend the generic runner; do not add a one-off page.

1. **`src/lib/kmDiscrepancyReport.ts`** (+ tests) — fetch, inclusion, delta, sort, and `applyLeadKmFromOdometer(assignmentId)` (re-read odometers, compute delta, update `total_km` only if a gap still exists; if already equal, treat as success and let the runner drop the row).
2. **`ReportKind` / `ReportTableRow`** — optional action: column id + apply. Runner renders `HoverTip` + confirm + toast. Kinds without an action are unchanged.
3. **Query** — events in the date range; join participations with `status = done`, `total_km` not null, both odometers set; client-side gap filter is allowed. No new tables, RPCs, or migrations. RLS unchanged.
4. **Registry** — one new kind in `REPORT_KINDS`. Update audience tests: admin sees four kinds; אחמ״ש-only still sees the three `admin_and_shift_lead` kinds only.

## Testing

- Include: `done` + both odometers + `total_km` set + delta ≠ lead + in-range `event_date`
- Include cancelled when the gap rules hold; מספר אירוע prefixed `בוטל ·`
- Exclude: `pending` / `in_progress`, null `total_km`, missing odometer, equal numbers, `event_date` outside range
- Grain: two gapped volunteers on one event → two rows; one gapped + one matching → one row
- הפרש = responder − lead (signed)
- Audience: admin sees `km_discrepancy`; אחמ״ש-only does not; responder sees none
- Apply: writes only `total_km`; equal-already is success; failed update keeps the row (unit the helper; UI confirm is manual)
- Existing lib tests for other reports stay the source of truth for those reports

## Later (not v1)

- אחמ״ש visibility
- Tolerance / “ignore 1 ק״מ”
- Auto-sync odometers when lead edits `total_km` after `done`
- Audit of replacements
