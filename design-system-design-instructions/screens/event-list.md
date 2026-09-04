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
- Toolbar (stacked — not a cramped one-row band): title/caption gap `--space-6`. Search field on its own full-width row (placeholder `אירוע, כביש, מיקום או שם`, magnifier affix). Status `SelectField` on the next row, remaining width, tap height ≥44 px, showing the current value (`הכול` · `ממתין לתיעוד` · `תועד חלקית` · `הושלם` · `אירוע בהזנה`) — tap opens the 5-option menu (not hover-only; not a full row of chips). These are filters, NOT stamps. אחמ״ש only (not admin / SuperAdmin): chip on that second row (wraps under if needed; `aria-label` = `הצג אירועים שנוצרו על ידי אחרים`, `aria-pressed` when on; visible label `אחרים` on mobile, full sentence on desktop ≥1025) — off (default) = own created events (`shift_lead_id`); on = full unit list. Admins and SuperAdmins do not see this control.
- List: event cards (per `06-components.md`), gap `--space-3`, grouped by date with sticky group headers (`--type-label`, `--text-muted`, e.g. `היום · 09.08.2026`).
- Bottom tab bar: daily destinations only — `האירועים שלי` (personal list) · `אירועים` (אחמ״ש / מנהל) · then `המשמרות שלי` or `ניהול` if they still fit. Remaining destinations (`משמרות`, `אנשי קשר`, `מפה`, `דוחות`) sit behind `עוד` — except כונן, who keep `אנשי קשר` and `מפה` in the bar. Profile via app-bar menu. Full role table: `admin.md`.

### Desktop (Command chrome)

- Sidebar: first item in `כלים לאחמ״ש` is a full-width outline `אירוע חדש` (plus icon + label; `--stroke-strong` border; same 36 px height, type, padding, and gap as sibling nav rows) — a create action, not a loud primary. On create (`/events/new`, query variants included) it is the current item (`aria-current="page"`, same active recipe as other rows); `אירועים` / `הקוקפיט` are not. After save→edit or leaving create, current follows the real route. Then `הקוקפיט`, `אירועים` (active on the list), `משמרות`, reports if shown. `האירועים שלי` stays in the personal block above. `פרופיל` and admin `הגדרות` are pinned at the sidebar block-end. Do not put a plus on the `אירועים` or `משמרות` rows — shift create (`משמרת חדשה`) lives on the shifts page, not in the sidebar. Hidden on the mobile tab bar.
- Content: title row (title + caption `מציג אירועים מ-30 הימים האחרונים. ניתן להשתמש בחיפוש לשליפת אירועים ישנים יותר` at `--type-caption` / `--text-muted`, then `אירוע חדש` primary) → compact **one-row** toolbar (search takes remaining width; status select shows current value; אחמ״ש `אחרים` chip when that control applies; title/caption gap `--space-4`) → **table** of events from the last 30 days by `event_date` (then `created_at`). Fetch still caps at 200 rows. Search queries the full database and hydrates matching rows that are outside that window. `טען עוד` expands the visible window by another 30 days.

| Column | Content | Notes |
|---|---|---|
| תאריך | `DD.MM.YYYY` | `--type-numeric` |
| מספר אירוע | police_event_id | mono |
| סוג אירוע | lookup label | shift-born appends ` (משמרת)` |
| כביש / מיקום | road + location | truncate 1 line |
| אחמ״ש | main only, `שם · או״ק`; if secondaries, append ` +N` (count). Desktop `HoverTip` on `+N` lists secondary names (Hebrew, RTL). | `—` when `origin = shift` (no meaningful lead on shift-born events). Mobile cards omit this column — secondaries live on detail/form. |
| כוננים | done-count fraction `2/3` | mono |
| סטטוס תיעוד | compact pipeline + stamp | event-level position dots + current stamp label (not viewer-relative) |

**Completion queue (אחמ״ש unit list):** events with missing required fields pin above the rest under `דורשים השלמת פרטים`, including `ממתין לתיעוד`. This is a ledger queue, not an alert: heading uses `--type-label` / `--text-secondary` (desktop as `<caption>` inside the table wrap; mobile as `h2` above the card stack). Data rows stay unwashed. Missing fields are a second line — desktop: full-width meta row under the data row (`--surface-sunken`, dotted hairline); mobile: own block under the card header (hairline, no rail, no tint brick). Line anatomy: marker `השלמה` in `--status-partial-on-tint` (never `--status-partial` on paper — fails contrast) + field names as dotted form-blanks (`--text-primary`, `1.5px dotted var(--status-partial)`). Not a stamp. Not stuffed under סוג אירוע. Pin set and field checks stay in `eventIncomplete.ts`.

Row click → event detail. Super Admin only (not regular admin / אחמ״ש): right-click a table row, or long-press a mobile card, opens a one-item menu `מחיקה` (destructive) at the pointer. Confirm dialog matches event detail: title `למחוק את האירוע 12345?` (or `למחוק את האירוע?` when no police id), body `הפעולה תמחק גם את נתוני המתנדבים המשויכים. לא ניתן לשחזר.`, destructive `מחיקה` / secondary `ביטול`. Success toast `האירוע נמחק`. Do not offer this on `האירועים שלי`. Sort default: `event_date` desc. Content max-width uses `page--wide` (~20% past default).

## Status logic (viewer-relative — from product spec)

- Desktop **table** column: compact 4-node pipeline + current stamp (`אירוע בהזנה` / `ממתין לתיעוד` / `תועד חלקית` / `הושלם`); no participation override. Exception for אחמ״ש: if the event would otherwise be `הושלם` but any responder `total_km` is still missing, the last node stays on the `done` slot but uses `--status-alert` and the label `חסר ק״מ`. Responder `done` in the DB is unchanged.
- Unit **cards** (mobile אחמ״ש list): same overlay — stamp `חסר ק״מ` / `--status-alert` instead of green `הושלם` when KM is missing. Mine-list / fill stamps stay `הושלם` for the responder. If their own `total_km` is still null, add caption `אחמ״ש טרם הזין ק״מ` under that green stamp (red `--status-alert`) — it does not replace `הושלם`. Those rows stay on `ממתינים לתיעוד` until the lead enters KM.
- Cards / detail / form stamps otherwise: Event `done` → `הושלם`; `partial` → `תועד חלקית`; `in_progress` → `ממתין לתיעוד`; `draft` → `אירוע בהזנה`.
- Cards / detail only: viewer's own open participation may still override to `ממתין לתיעוד שלך` / `טיוטה נשמרה`.

## States

- **Loading:** 5 card skeletons (mobile) / 6 row skeletons (desktop).
- **Empty (no events at all):** empty state — icon clipboard-list, `אין אירועים להצגה`, caption `אירוע חדש יופיע כאן ברגע שייווצר.`, plus `אירוע חדש` primary if role permits.
- **Empty (no events in the last 30 days, older rows loaded):** `לא נמצאו אירועים מ-30 הימים האחרונים` + secondary `טען עוד`.
- **Empty (filter):** `אין אירועים במצב זה` + ghost `ניקוי סינון`.
- **Load error:** empty-state pattern with `טעינת האירועים נכשלה. בדקו את החיבור ונסו שוב.` + secondary `רענון`.
