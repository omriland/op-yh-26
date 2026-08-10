# Screen — Event List / Home (אירועים)

The landing screen after login. Role-filtered: shift-leads/admins see unit events; responders land on "האירועים שלי" (see `responder-fill.md` — same list component, filtered to own assignments).

## Theme context

- Mobile (all roles): **Field**.
- Desktop shift-lead/admin: **Command** (sidebar shell).
- Desktop responder-only users: **Field**, centered single column (no sidebar; top bar + content max-width 720).

## Layout

### Mobile

- Top app bar (standard).
- Title row: `אירועים` (`--type-title`) at inline-start; if role can create → primary button `אירוע חדש` (icon-plus + label) at inline-end. On narrow widths the button may compress to icon-only 44×44 with `aria-label="אירוע חדש"`.
- Filter row: horizontally scrollable chips (`scrollbar-hide`), height 36 px, secondary-chip chrome: `הכול` · `ממתין לתיעוד` · `הושלם חלקית` · `הושלם` · `טיוטה`. Active chip = `--accent-subtle` bg + `--accent` text + `--accent` border. These are filters, NOT stamps — they use normal chip chrome, not stamp styling.
- List: event cards (per `06-components.md`), gap `--space-3`, grouped by date with sticky group headers (`--type-label`, `--text-muted`, e.g. `היום · 09.08.2026`).
- Bottom tab bar: `אירועים` (active) · `האירועים שלי` (if shift-lead and/or responder — leads also go on events) · `ניהול` (admin only) · `פרופיל`.

### Desktop (Command)

- Sidebar: `אירועים` (active), `האירועים שלי` (if shift-lead and/or responder), section `ניהול` → `משתמשים`, `הגדרות` (admin only).
- Content: title row (title + `אירוע חדש` primary) → filter chips + search input (width 280, icon magnifier, placeholder `חיפוש לפי מספר אירוע, כביש או מיקום`) → **table**:

| Column | Content | Notes |
|---|---|---|
| תאריך | `DD.MM.YYYY` | `--type-numeric` |
| מספר אירוע | police_event_id | mono |
| סוג אירוע | lookup label | |
| כביש / מיקום | road + location | truncate 1 line |
| אחמ״ש | shift-lead name | |
| כוננים | done-count fraction `2/3` | mono |
| סטטוס תיעוד | stamp chip | viewer-relative label |

Row click → event detail. Sort default: `event_date` desc.

## Status logic (viewer-relative — from product spec)

- Event `done` → stamp `הושלם`.
- Event `partial` viewed by shift-lead/admin → `הושלם חלקית`.
- Event with viewer's own participation open → `ממתין לתיעוד שלך` (overrides event-level label for that viewer).
- Event `in_progress` → `ממתין לתיעוד`; `draft` → `טיוטה` (visible to its lead + admin only).

## States

- **Loading:** 5 card skeletons (mobile) / 6 row skeletons (desktop).
- **Empty (no events at all):** empty state — icon clipboard-list, `אין אירועים להצגה`, caption `אירוע חדש יופיע כאן ברגע שייווצר.`, plus `אירוע חדש` primary if role permits.
- **Empty (filter):** `אין אירועים במצב זה` + ghost `ניקוי סינון`.
- **Load error:** empty-state pattern with `טעינת האירועים נכשלה. בדקו את החיבור ונסו שוב.` + secondary `רענון`.
