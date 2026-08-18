# Screen — My Events & Complete My Section (האירועים שלי · השלמת הפרטים שלי)

The responder's world. Optimized for one job: finish your part of the record, often later, from a phone. Always **Field** theme — this is the daylight document surface, on every device width.

## האירועים שלי (list)

Same event-card list component as `event-list.md`, filtered to the viewer's assignments, with one change: **the card's stamp reflects MY participation status**, not the event status. Shown to responders and to shift-lead/admin who also have a mine list. This surface is an **inbox**, then an **archive** — two tabs of the same personal list, not a second unit-events page.

- Tabs under the header (`role="tablist"`, chip chrome): `ממתינים לתיעוד` (open count as plain text after the label when count > 0, e.g. `ממתינים לתיעוד 3` — not a stamp) · `תועדו`. Default tab: `ממתינים לתיעוד`.
- Desktop: insight strip at top (accent rail + subtle tint): loud mono open-count only (no caption under the digit) + eyebrow `האירועים שלי` + `שלום, {first name}` + sentence `יש לך N אירועים לתעד.` (zero → `אין אירועים שממתינים לתיעוד.`). When open count ≥ 3, add note `שימו לב! אירועים שלא תועדו במלואם לא נכללים בהחזר הדלק הרבעוני`. Tabs sit under the strip.
- Mobile: no insight strip (too tall). Compact page title `האירועים שלי` + the same summary sentence + the fuel note when count ≥ 3. Tabs sit under that.
- **ממתינים לתיעוד:** raised event cards only. Card tap and stamp open event detail. Primary `השלמת הפרטים שלי` / `המשך מילוי הפרטים` open fill (`returnTo: 'list'`). Meta line is date · מספר אירוע (no שלוחה). Standalone / regular cards (`origin = manual`) carry a 3px `--accent` rail on inline-start plus `--accent-subtle` wash so they scan apart from shift-born cards — not green, not a new hue. **Overdue (web):** 48 hours after קילומטרים, that origin rail is replaced by `--status-alert` rail + `--status-alert-tint`; shift-born overdue cards get the same red mark. Stamp stays `ממתין למילוי פרטים` / `טיוטה נשמרה`.
- Shift-born events on `ממתינים לתיעוד` group under a shift **subheader** (`משמרת` · date · שם משמרת · רכב) — heading + whitespace, never a card wrapping cards. Caption is the open count (`2 לתעד` / `אירוע אחד לתעד`). The group starts **open** when it has items to log. Shift-born type still shows `(משמרת)` in brackets next to the event type. No origin rail or wash on those cards.
- **תועדו:** stacked list in one `list-rows` container (hairline dividers, not faded cards). Row tap → detail. No fill CTA. Search field (`חיפוש לפי מספר אירוע, כביש, מיקום`) filters the loaded window. Caption `תועדו · 30 יום אחרונים`. Secondary `הצג 30 יום נוספים` loads another 30-day window.
- Empty `ממתינים לתיעוד`: empty-state icon + `אין אירועים שממתינים לתיעוד.` + caption `אירוע חדש יופיע כאן כשישויך אליך.` If the archive has rows (or more windows exist), ghost `לצפייה באירועים שתועדו`. No celebration copy, no exclamation.
- Empty `תועדו` (no query): `אין אירועים שתועדו בתקופה זו`. Search miss: `אין אירועים שתועדו התואמים ל־“{query}”` + ghost `ניקוי חיפוש`.
- Desktop responder-only: same list centered, max-width 720. No table view — this surface stays personal, not managerial.

## השלמת הפרטים שלי (fill flow)

Entry: from the card fill button or from the responder's own card on event detail.

### Layout

- Read-only context header first — a compact event summary card with all key ledger rows always visible (no collapse): תאריך · מספר אירוע · סוג אירוע · כביש · מיקום · אחמ״ש — so the responder is certain which event they're completing.
- Then one form section: `הפרטים שלי`.

| Field | Control | Notes |
|---|---|---|
| לוחית רישוי | select | Options = vehicles linked to this user only (plate · model). Not free-text. Prefill when exactly one vehicle. Empty roster → helper to contact admin. |
| מד אוץ התחלה | numeric, mono | |
| מד אוץ סיום | numeric, mono | must be ≥ מד אוץ התחלה — error: `מד אוץ סיום חייב להיות גדול ממד אוץ התחלה` |
| נתיב נסיעה | text | placeholder `דרך צומת X וכביש Y וכו'` |
| פירוט הטיפול | textarea | the main narrative field — min-height 120 |
| מספרי כלי רכב | repeating | Optional. After פירוט הטיפול, before הערות. Compose placeholder `xx-xxx-xx` (7/8 digits) + `הוספה` (same 44px height as input); committed rows = Israeli plate mark + optional model · color caption (`t-body`) + optional short `איפה הרכב הושאר` (`left_where`) before remove; leftover pending digits on `סיום דיווח` → `השלימו או מחקו את המספר בתחתית.` Read-only done: ledger value = `TreatedPlateStack` (empty → `—`). |
| הערות לטיפול | textarea | optional |

Empty required fields show the dotted fill-in line — the blank on the form.

### Footer actions (sticky, mobile-first)

- Primary: `סיום דיווח` — validates ALL required fields; on success participation → `done`, stamp-press animation on the updated stamp, toast `הדיווח הושלם`, return to previous screen.
- Secondary: `שמירת טיוטה` — saves whatever exists, participation → `in_progress`, no validation blocking, toast `הטיוטה נשמרה`. This is the fill-later lifeline; it must always be one tap away.

### States

- **Already done:** the flow opens read-only (ledger rows, no inputs) with stamp `הושלם` and caption `הדיווח הושלם ב־09.08.2026, 14:30. רק אחמ״ש יכול לערוך לאחר סיום.` Editing after completion is not available to responders (RLS + UI). Shift-lead/admin correct via `עריכת אירוע` (lead-owned fields).
- **Connection failure on save:** error toast + data retained in the form; `סיום דיווח` re-enabled. No silent loss, ever.
- **The event closed meanwhile** (edge): show info banner `האירוע נסגר. לא ניתן לערוך את הדיווח.` and render read-only.
