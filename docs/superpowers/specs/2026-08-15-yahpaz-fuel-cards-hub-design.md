# Yahpaz (יחפ״צ) — Fuel cards hub (ניהול כרטיסי דלק) — Design

**Date:** 2026-08-15  
**Repo:** `yhpz-2026`  
**Status:** Approved in brainstorming (Approach 1: hub + dedicated usage screen)  
**Depends on:** quarterly workbook (`2026-08-11-yahpaz-quarterly-fuel-request-design.md`); km rules (`2026-08-10-yahpaz-fuel-refund-report-design.md`)

## Problem

Admins open **ניהול כרטיסי דלק** for two different jobs: (1) allocate quarterly fuel cards, (2) see / export current km and fuel usage for a chosen period. Today the page drops them into the quarterly workbook. Usage already exists in **דוחות** as סיכום ק״מ, but without liters and without a comfortable period picker.

## Goals (v1)

- Admin-only hub: caption `אני רוצה:` and two large cards
- Path 1: existing quarterly workbook (allocation, lock, carry)
- Path 2: read-only usage table — כונן · קילומטרים · אירועים · ליטרים — plus CSV
- Period picker: טווח · חודש · שנה · אחרונים (7 / 30 / 90 ימים, 3 / 6 / 12 חודשים)
- Calendar from **react-day-picker** (Gregorian, RTL, Hebrew labels), skinned with רשומה tokens
- Hebrew-only RTL UI

## Non-goals (v1)

- Changing דוחות / the generic report runner
- Cards / suggested-cards column on usage
- Money, shift km, odometer math
- Schema, RLS, RPCs, Netlify Functions
- Unlock locked quarters
- Jewish (Hebrew) calendar
- Inventing a calendar widget from scratch

## Approach

**Fuel hub + dedicated usage screen.**  
`AppView` stays `fuel_quarter`. In-view state: `chooser` | `allocate` | `usage`. Leaving the admin tab and returning lands on the chooser. Period picker is a reusable component; reports do not adopt it in this slice.

## Hub

| Element | Hebrew |
|---|---|
| Nav + title | ניהול דלק |
| Caption | אני רוצה: |
| Card 1 title | לנהל ולהקצות כרטיסי דלק לרבעון |
| Card 1 helper | ניהול חלוקת כרטיסי דלק לפי רבעון. יתרות עוברות באופן אוטומטי לרבעון הבא. ניתן להעביר יתרה שלילית או חיובית. |
| Card 2 title | לראות / לייצא שימוש בדלק |
| Card 2 helper | ק״מ, אירועים וליטרים לפי תקופה |
| Back (both children) | כרטיסי דלק |

Cards: whole-card tap, no chevron, same catalog pattern as דוחות (two columns on desktop). Admin-only; no new URL.

## Allocate

Existing workbook, unchanged except helper copy (same three sentences as card 1). Year + quarter, save, lock, carry.

## Usage

| Element | Hebrew |
|---|---|
| Title | שימוש בדלק |
| Helper | קילומטרים, אירועים וליטרים לפי תאריך דיווח האירוע |
| CSV | ייצוא CSV |
| Search | חיפוש בדוח (live, client-side) |
| Invalid range | טווח תאריכים לא תקין |
| Load fail | טעינת השימוש בדלק נכשלה. בדקו את החיבור ונסו שוב. + רענון |
| Empty | אין נתונים להצגה |

- Default period: **1st of current month → today** (local), same as סיכום ק״מ
- Columns: כונן · קילומטרים · אירועים · ליטרים (`km / 6`, one decimal)
- Totals line: סה״כ ק״מ · סה״כ ליטרים · כמה כוננים עם ק״מ (`total_km > 0`)
- Rows: all **active** users; idle = 0 / 0 / 0.0
- Km rules unchanged: `event_responders.total_km` not null (`0` counts); filter `events.created_at`; no status/cancelled filter; shifts excluded
- Desktop table (Command); mobile cards (Field)
- CSV: UTF-8 BOM, headers = columns, rows after search, filename `שימוש-דלק.csv`

## Period picker

Closed control shows a Hebrew label for the current period:

| Mode | Example |
|---|---|
| טווח | `01.08.2026–15.08.2026` |
| חודש | `אוגוסט 2026` |
| שנה | `2026` |
| אחרונים (ימים) | `7 הימים האחרונים` |
| אחרונים (חודשים) | `3 החודשים האחרונים` |

Open: inline panel (desktop overlay chrome `--surface-overlay` + elevation 2; mobile full-width). Mode chips: **טווח** · **חודש** · **שנה** · **אחרונים**.

| Mode | Behavior |
|---|---|
| טווח | `react-day-picker` `mode="range"`, Gregorian, `dir=rtl`, Hebrew locale (not `react-day-picker/hebrew`). Two months desktop, one mobile. Apply when both ends are set. |
| חודש | Month + year → 1st–last day of that month |
| שנה | One year → 1 בינואר–31 בדצמבר |
| אחרונים | Chips: 7 / 30 / 90 ימים · 3 / 6 / 12 חודשים. Inclusive, ending today. Last N days = today − (N−1) through today. Last N months = same calendar day N months ago through today. |

- Days after today are disabled. Resolved `to` is always `min(computed, today)`.
- Output is always `{ from, to }` local `YYYY-MM-DD` for `loadFuelRefundReport`.
- Style DayPicker with semantic tokens only (`classNames` + CSS). No library default theme colors.

## Architecture

| Piece | Role |
|---|---|
| `FuelQuarterPage` | Hub state chooser / allocate / usage |
| `FuelQuarterWorkbook` | Existing workbook UI |
| `FuelUsagePanel` | Totals, search, CSV, table/cards |
| `PeriodPicker` | Modes + DayPicker → `{from, to}` |
| `periodRange.ts` | Pure period → range + labels (unit-tested) |
| `fuelUsage.ts` | Liters + totals from refund rows (unit-tested) |
| `fuelRefundReport` | Unchanged fetch/aggregation |
| `KM_PER_LITER` (`6`) | `liters = km / 6` |

No schema. No nav change.

## Permissions

UI + existing RLS: `admin` only.

## Testing

- Period math: current/past month, current/past year, each preset, clamp `to` to today
- Liters and totals on known km rows
- Existing refund / quarter tests stay green

## Error handling

- Invalid range → inline copy; no fetch
- Load failure → empty-state + רענון
- Picker cannot select a future day

## Later (not v1)

- Reuse `PeriodPicker` on דוחות date-range kinds
- Usage detail grain (per participation)
- Deep-link / URL for hub pane
