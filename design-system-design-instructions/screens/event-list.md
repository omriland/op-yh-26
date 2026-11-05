# Screen — Event List / Home (אירועים)

The landing screen after login. Role-filtered: shift-leads/admins land on unit `אירועים`; responders land on "האירועים שלי" (see `responder-fill.md` — inbox/archive tabs, not this date-grouped unit list).

## Theme context

- Mobile (all roles): **Field**.
- Desktop shift-lead/admin: **Command chrome** (app bar + sidebar) + **Field** content.
- Desktop responder-only users: **Field**, centered single column (no sidebar; top bar + content max-width 720).

## Layout

### Mobile

- Top app bar (standard).
- Title row: `אירועים` (`--type-title`) at inline-start; if role can create → primary button `אירוע חדש` (icon-plus + label) at inline-end. Keep the label on every width — do not compress to icon-only. Caption (`מציג אירועים מ-30 הימים האחרונים…`) sits on the same intro line as the title at `--type-caption` / `--text-muted`.
- Filters: title/caption gap `--space-6`, then the `תצוגה:` row and the filter row described in **Filters and saved views** below. On phones the filter row wraps: search takes the full first line, pills follow, every target ≥44 px, and each pill's menu or panel opens as the bottom sheet.
- List: event cards (per `06-components.md`), gap `--space-3`, grouped by date with sticky group headers (`--type-label`, `--text-muted`, e.g. `היום · 09.08.2026`).
- Bottom tab bar: daily destinations only — `האירועים שלי` (personal list) · `אירועים` (אחמ״ש / מנהל) · then `המשמרות שלי` or `ניהול` if they still fit. Remaining destinations (`משמרות`, `אנשי קשר`, `מפה`, `דוחות`) sit behind `עוד` — except כונן, who keep `אנשי קשר` and `מפה` in the bar. Profile via app-bar menu. Full role table: `admin.md`.

### Desktop (Command chrome)

- Sidebar: first item in `כלים לאחמ״ש` is a full-width outline `אירוע חדש` (plus icon + label; `--stroke-strong` border; same 36 px height, type, padding, and gap as sibling nav rows) — a create action, not a loud primary. On create (`/events/new`, query variants included) it is the current item (`aria-current="page"`, same active recipe as other rows); `אירועים` / `הקוקפיט` are not. After save→edit or leaving create, current follows the real route. Then `הקוקפיט`, `אירועים` (active on the list), `משמרות`, reports if shown. `האירועים שלי` stays in the personal block above. `פרופיל` and admin `הגדרות` are pinned at the sidebar block-end. Do not put a plus on the `אירועים` or `משמרות` rows — shift create (`משמרת חדשה`) lives on the shifts page, not in the sidebar. Hidden on the mobile tab bar.
- Content: title row (title + caption `מציג אירועים מ-30 הימים האחרונים. ניתן להשתמש בחיפוש לשליפת אירועים ישנים יותר` at `--type-caption` / `--text-muted`, then `אירוע חדש` primary) → `תצוגה:` row → one filter row (see below; title/caption gap `--space-4`) → **table** of events from the last 30 days by `event_date` (then `created_at`). Fetch still caps at 200 rows. Search queries the full database and hydrates matching rows that are outside that window. `טען עוד` expands the visible window by another 30 days.

| Column | Content | Notes |
|---|---|---|
| תאריך | `DD.MM.YYYY` | `--type-numeric` |
| מספר אירוע | police_event_id | mono |
| סוג אירוע | lookup label | shift-born appends ` (משמרת)` |
| כביש / מיקום | road + location | truncate 1 line |
| אחמ״ש | main only, `שם · או״ק`; if secondaries, append ` +N` (count). Desktop `HoverTip` on `+N` lists secondary names (Hebrew, RTL). | `—` when `origin = shift` (no meaningful lead on shift-born events). Mobile cards omit this column — secondaries live on detail/form. |
| כוננים | done-count fraction `2/3` | mono |
| סטטוס תיעוד | compact pipeline + stamp | event-level position dots + current stamp label (not viewer-relative) |

**Completion queue (אחמ״ש unit list):** events with missing required fields pin above the rest under `דורשים השלמת פרטים`, including `ממתין לתיעוד`. This is a ledger queue, not an alert: heading uses `--type-label` / `--text-secondary` (desktop as `<caption>` inside the table wrap; mobile as `h2` above the card stack). Data rows stay unwashed. Missing fields are a second line — desktop: full-width meta row under the data row (`--surface-sunken`, dotted hairline); mobile: own block under the card header (hairline, no rail, no tint brick). Line anatomy: marker `השלמה` in `--status-partial-on-tint` (never `--status-partial` on paper — fails contrast) + field names as dotted form-blanks (`--text-primary`, `1.5px dotted var(--status-partial)`). Not a stamp. Not stuffed under סוג אירוע. Pin set and field checks stay in `eventIncomplete.ts`. Shift-born events never enter this queue and never show `חסר ק״מ`: their shared report has no או״ק, שלוחה, times or KM, and its own stamp says when it still needs work.

Row click → event detail. Super Admin only (not regular admin / אחמ״ש): right-click a table row, or long-press a mobile card, opens a one-item menu `מחיקה` (destructive) at the pointer. Confirm dialog matches event detail: title `למחוק את האירוע 12345?` (or `למחוק את האירוע?` when no police id); with assigned volunteers, body `יש מתנדבים משובצים באירוע. הפעולה תמחק גם את הנתונים שלהם. האם למחוק? לא ניתן לשחזר.`, otherwise `לא ניתן לשחזר את האירוע לאחר המחיקה.`; destructive `מחיקה` / secondary `ביטול`. Success toast `האירוע נמחק`. Do not offer this on `האירועים שלי`. Sort default: `event_date` desc. Content max-width uses `page--wide` (~20% past default).

## Filters and saved views (תצוגה · סינון)

Unit list only. Modelled on the opeaz operations table (view picker, a search + pill row, הוספת סינון), drawn in רשומה tokens. These are filters, not stamps.

- **View row:** `תצוגה:` (`--type-body`, `--text-secondary`) + a button (`LayoutList` 16 + current name 600 + chevron; `--stroke-strong`, `--radius-sm`, 44 / 40 px). Menu (`menuitemradio`, current one in `--accent-subtle` / `--accent` with a check): `ברירת מחדל` (description = this role's caption), the user's saved views by name, `אין עדיין תצוגות שמורות…` when none, a hairline, then `שמירה כתצוגה חדשה` while the screen matches no view and `מחיקת התצוגה ״שם״` (`--status-alert`) while a saved view is current. Choosing another view while the current filter is unsaved asks first: warning AlertDialog `להחליף תצוגה?` · `החלפת תצוגה` / `ביטול`.
- **Filter row** (wraps; `--space-2` gap): search (`Search` 16, placeholder `חיפוש לסינון`, accessible name says what it searches; 14rem from 641 px, full width below) → **תקופה** pill → **status** pill → `משמרות` toggle → `אחרים` toggle (אחמ״ש who is not admin) → added rule pills → `+ הוספת סינון` → `ניקוי סינון` (only when anything differs from ברירת מחדל or search has text) → `שמירת תצוגה` at inline-end while unsaved.
- **Pill anatomy:** one bordered control (`--stroke-strong`, `--radius-sm`, `--surface-raised`, 44 / 40 px, `--type-body`): icon 16 · label `--text-secondary` · 1 px separator · value 600 · chevron, or an `X` (`הסרת הסינון …`, 40 / 36 px hit) once it carries a value. Applied = pressed-chip ink (`--accent` border, label and value on `--accent-subtle`). Open = `--accent` border. Toggles use `aria-pressed` and swap their icon for a check when on.
- **תקופה pill** (always there): `12 שעות אחרונות` (אחמ״ש default, with older events still missing his details) · `30 ימים אחרונים` (admin default; for אחמ״ש it is the old ישנים יותר) · `יום מסוים` · `טווח תאריכים`. Day / range show DateFields (stacked in the panel); a typed date that is not a real date shows `תאריך לא תקין` and the date filter is withheld until it is fixed. While other rules apply, the two windows are disabled with `סינונים פעילים מחפשים בכל התאריכים…` and the pill reads `כל התאריכים`. `X` returns to the default window.
- **Status pill:** dot (8 px, `--radius-stamp`, status ink) + `כל הסטטוסים` or the status; menu lists each with its one-line explanation.
- **הוספת סינון:** borderless text button. Popover: `סינון לפי…` field (focused) then the unused fields with icons (`אחמ״ש`, `כונן`, `מספר אירוע`, `מספר רכב שטופל`, `סוג רכב שטופל`), filtered as you type, ↑ ↓ and Enter. Choosing one adds its pill and opens its panel with the first field focused.
- **Rule panel:** header (field name in `--type-label` + `הסרת הסינון`), then: checkbox list for אחמ״ש / סוג רכב (search above it past 6 options; `ניקוי הבחירה` once something is ticked), or a text field for כונן (`שם או או״ק מכיל`), מספר רכב (digits, LTR isolate) and מספר אירוע (segmented `שווה ל־` / `מכיל`, digits, LTR isolate). Changes apply at once; typing applies 300 ms after the last key; a half-typed value leaves the list as it is and, after leaving the field, says why (`יש להזין לפחות 2 תווים.`).
- **Popover:** `--surface-overlay`, hairline, `--radius-md`, `--shadow-overlay`, 18rem (22rem for תקופה), 4 px under its pill, flips to stay on screen; item rows 44 / 40 px. Click outside or Escape closes it and returns focus to the pill. Below 1025 px every menu and panel is the existing bottom sheet.
- **Save:** Dialog `שמירת תצוגה`, field `שם התצוגה` focused (required, ≤40, unique per user, never `ברירת מחדל`; `כבר קיימת תצוגה בשם זה.`), hint `נשמרים התקופה, הסטטוס, הסינונים והבחירות שבשורה. לא נשמר טקסט החיפוש.`, toast `התצוגה נשמרה`. **Delete:** AlertDialog `danger`, `למחוק את התצוגה ״שם״?`, body `הסינון שעל המסך יישאר כפי שהוא.`, toast `התצוגה נמחקה`.
- **Behaviour:** `ברירת מחדל` is today's list unchanged. With rules the caption becomes `מציג אירועים לפי תנאי הסינון, מכל התאריכים.` (at the 200-row cap: `מוצגים 200 האירועים האחרונים שתואמים לסינון. הוסיפו תנאי כדי להגיע לישנים יותר.`), the window and `טען עוד` do not apply, and an empty result reads `אין אירועים שתואמים לסינון` + `הסירו תנאי או בחרו תצוגה אחרת.` + ghost `ניקוי סינון`. An אחמ״ש rule decides whose events show, so `אחרים` reads on and is disabled while it exists.

## Status logic (viewer-relative — from product spec)

- Desktop **table** column: compact 4-node pipeline + current stamp (`אירוע בהזנה` / `ממתין לתיעוד` / `תועד חלקית` / `הושלם`); no participation override. Exception for אחמ״ש: if the event would otherwise be `הושלם` but any responder `total_km` is still missing, the last node stays on the `done` slot but uses `--status-alert` and the label `חסר ק״מ`. Responder `done` in the DB is unchanged.
- Unit **cards** (mobile אחמ״ש list): same overlay — stamp `חסר ק״מ` / `--status-alert` instead of green `הושלם` when KM is missing. Mine-list / fill stamps for a finished responder whose own `total_km` is still null use `סיימת לתעד` (green) plus caption `אחמ״ש טרם הזין ק״מ` (red `--status-alert`). Once the lead enters KM the stamp becomes `הושלם`. Those rows stay on `ממתינים לתיעוד` until the lead enters KM.
- Cards / detail / form stamps otherwise: Event `done` → `הושלם`; `partial` → `תועד חלקית`; `in_progress` → `ממתין לתיעוד`; `draft` → `אירוע בהזנה`.
- Cards / detail only: viewer's own open participation may still override to `ממתין לתיעוד שלך` / `טיוטה נשמרה`.

## States

- **Loading:** 5 card skeletons (mobile) / 6 row skeletons (desktop).
- **Empty (no events at all):** empty state — icon clipboard-list, `אין אירועים להצגה`, caption `אירוע חדש יופיע כאן ברגע שייווצר.`, plus `אירוע חדש` primary if role permits.
- **Empty (no events in the last 30 days, older rows loaded):** `לא נמצאו אירועים מ-30 הימים האחרונים` + secondary `טען עוד`.
- **Empty (filter):** `אין אירועים במצב זה` + ghost `ניקוי סינון`.
- **Load error:** empty-state pattern with `טעינת האירועים נכשלה. בדקו את החיבור ונסו שוב.` + secondary `רענון`.
