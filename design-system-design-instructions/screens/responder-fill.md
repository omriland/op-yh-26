# Screen — My Events & Complete My Section (האירועים שלי · השלמת התיעוד שלי)

The responder's world. Optimized for one job: finish your part of the record, often later, from a phone. Always **Field** theme — this is the daylight document surface, on every device width.

## האירועים שלי (list)

Same event-card list component as `event-list.md`, filtered to the viewer's assignments, with one change: **the card's stamp reflects MY participation status**, not the event status. Shown to responders and to shift-lead/admin who also have a mine list. This surface is an **inbox**, then an **archive** — two tabs of the same personal list, not a second unit-events page.

- Tabs under the header (`role="tablist"`, chip chrome): `ממתינים לתיעוד` (open count as plain text after the label when count > 0, e.g. `ממתינים לתיעוד 3` — not a stamp) · `תועדו`. Default tab: `ממתינים לתיעוד`.
- Desktop: insight strip at top (accent rail + subtle tint): loud mono open-count only (no caption under the digit) + eyebrow `האירועים שלי` + `שלום, {first name}` + sentence `יש לך N אירועים לתעד.` (zero → `אין אירועים שממתינים לתיעוד.`). When open count ≥ 3, add note `שימו לב! אירועים שלא תועדו במלואם לא נכללים בהחזר הדלק הרבעוני`. Tabs sit under the strip.
- Mobile: no insight strip (too tall). Compact page title `האירועים שלי` + the same summary sentence + the fuel note when count ≥ 3. Tabs sit under that.
- **ממתינים לתיעוד:** raised event cards only. Card tap and stamp open event detail. Primary `השלמת התיעוד שלי` / `המשך התיעוד` open fill (`returnTo: 'list'`). On a shift-born card the primary names the shared report instead: `השלמת התיעוד` while nothing is filled, `המשך התיעוד` once anything is, none once the report is `הושלם`; it opens `תיעוד אירוע ממשמרת` (below), never the per-responder fill. Meta line is date · מספר אירוע (no שלוחה). Standalone / regular cards (`origin = manual`) carry a 3px `--accent` rail on inline-start plus `--accent-subtle` wash so they scan apart from shift-born cards — not green, not a new hue. **Overdue (web):** 48 hours after קילומטרים, that origin rail is replaced by `--status-alert` rail + `--status-alert-tint`; a sand-watch (`Hourglass`) sits inline-start of the event type on the same row; hover tip uses that same tint and reads `אירוע ממתין לתיעוד מעל ל־48 שעות`; shift-born overdue cards get the same red mark. Stamp stays `ממתין לתיעוד` / `טיוטה נשמרה`.
- Shift-born events on `ממתינים לתיעוד` group under a shift **subheader** (`משמרת` · date · שם משמרת · רכב) — heading + whitespace, never a card wrapping cards. Caption is the open count (`2 לתעד` / `אירוע אחד לתעד`). The group starts **open** when it has items to log. Shift-born type still shows `(משמרת)` in brackets next to the event type. No origin rail or wash on those cards. A shift-born event dated after today is on neither tab (its shift shows under `משמרות עתידיות` on המשמרות שלי) and does not light the nav attention dot until its shift date.
- **תועדו:** stacked list in one `list-rows` container (hairline dividers, not faded cards). Row tap → detail. No fill CTA. Search field (`חיפוש לפי מספר אירוע, כביש, מיקום`) filters the loaded window. Caption `תועדו · 30 יום אחרונים`. Secondary `הצג 30 יום נוספים` loads another 30-day window.
- Empty `ממתינים לתיעוד`: empty-state icon + `אין אירועים שממתינים לתיעוד.` + caption `אירוע חדש יופיע כאן כשישויך אליך.` If the archive has rows (or more windows exist), ghost `לצפייה באירועים שתועדו`. No celebration copy, no exclamation.
- Empty `תועדו` (no query): `אין אירועים שתועדו בתקופה זו`. Search miss: `אין אירועים שתועדו התואמים ל־“{query}”` + ghost `ניקוי חיפוש`.
- Desktop responder-only: same list centered, max-width 720. No table view — this surface stays personal, not managerial.

## השלמת התיעוד שלי (fill flow)

Entry: from the card fill button or from the responder's own card on event detail. **Manual events only.** Every route into this flow for a shift-born event (`origin = 'shift'`: card button, `/events/:id/fill` and `/mine/:id/fill`, post-login `fill_event`, an emailed fill link) opens `תיעוד אירוע ממשמרת` instead. A shift-born event never asks anyone for לוחית רישוי, מד אוץ, נתיב נסיעה, שעת סיום or ק״מ: the shift carries the one odometer pair.

### Layout

- Read-only context header first — a compact event summary card with all key ledger rows always visible (no collapse): תאריך · מספר אירוע · סוג אירוע · כביש · מיקום · אחמ״ש (main + secondaries in one caption) — so the responder is certain which event they're completing.
- Then one form section: `הפרטים שלי`.

| Field | Control | Notes |
|---|---|---|
| לוחית רישוי | select | Options = vehicles linked to this user only (plate · model). Not free-text. Prefill when exactly one vehicle. Empty roster → helper to contact admin. |
| מד אוץ התחלה | numeric, mono | |
| מד אוץ סיום | numeric, mono | must be ≥ מד אוץ התחלה — equal is valid (0 in both included); only a reversed pair errors: `מד אוץ סיום אינו יכול להיות קטן ממד אוץ התחלה` |
| נתיב נסיעה | textarea | placeholder `דרך צומת X וכביש Y וכו'` |
| פירוט הטיפול | textarea | the main narrative field — min-height 120 |
| מספרי כלי רכב | repeating | Optional. After פירוט הטיפול, before הערות. Compose placeholder `xx-xxx-xx` (7/8 digits) + `הוספה` (same 44px height as input, stays aligned with the input when the field shows an error under it); committed rows = Israeli plate mark + details slot (pending: skeleton; ready: logo + model · color; failed: small alert icon + hover tip `לא הצלחנו לייבא את פרטי הרכב`) + optional short `איפה הרכב הושאר` (`left_where`) before remove; leftover pending digits on `סיום דיווח` → `השלימו או מחקו את המספר בתחתית.` Read-only done: ledger value = `TreatedPlateStack` (empty → `—`). |
| מדיה | media annex | After plates, before הערות. Not required. Images only; required select `מתי צולמה` (`לפני הטיפול` · `במהלך/לאחר הטיפול`); optional plates (multi-select) + caption. Car select shows logo + plate + model/color. Writable for assigned responders after `סיום דיווח`. Absent on the email fill-link. Leftover drafts missing when-taken on complete → `בחרו מתי צולמה כל תמונה.` Cap 20. See `06-components.md` Media annex. |
| הערות לטיפול | textarea | optional |

Empty required fields show the dotted fill-in line — the blank on the form.

### Footer actions (sticky, mobile-first)

- Primary: `סיום דיווח` — validates ALL required fields; on success participation → `done`, stamp-press animation on the updated stamp, toast `הדיווח הושלם`, return to previous screen.
- Secondary: `שמירת טיוטה` — saves whatever exists, participation → `in_progress`, no validation blocking, toast `הטיוטה נשמרה`. This is the fill-later lifeline; it must always be one tap away.

### States

- **Already done:** the flow opens read-only (ledger rows, no inputs) with stamp `הושלם` when lead KM is filled, or `סיימת לתעד` when it is still null, and caption `הדיווח הושלם ב־09.08.2026, 14:30. רק אחמ״ש יכול לערוך לאחר סיום.` If the lead has not entered `total_km` yet, add caption `אחמ״ש טרם הזין ק״מ` under the green stamp (red). The event stays on `ממתינים לתיעוד` until the lead enters KM. Other fill fields stay locked. **מדיה** stays writable for the assigned responder (event not cancelled). Shift-lead/admin correct lead-owned fields via `עריכת אירוע`.
- **Connection failure on save:** error toast + data retained in the form; `סיום דיווח` re-enabled. No silent loss, ever.
- **The event closed meanwhile** (edge): show info banner `האירוע נסגר. לא ניתן לערוך את הדיווח.` and render read-only.

## תיעוד אירוע ממשמרת (shared report, shift-born events)

One report per shift-born event, written once for the whole crew (RPC `save_shift_born_event_fill`). Same Field panel as the fill flow: back `חזרה`, title `תיעוד אירוע ממשמרת`, caption `נשמר ע״י {שם}`, chip `ממשמרת`.

- **Who edits:** any crew member of the shift from the shift date on, and אחמ״ש / מנהל on any date. Once the report is `הושלם`, only אחמ״ש / מנהל edit it; the crew see it read-only. Anyone else sees it read-only. The editor is never shown to a viewer the RPC would refuse.
- **Before the shift date (crew):** read-only, with an info banner `ניתן לתעד החל מתאריך המשמרת.` No toast, no error. מדיה is not writable yet.
- **Entry:** event detail (leads, admins and crew are all handed this report instead of the detail page), shift detail `אירועים ממשמרת` rows, the inbox card button, and any per-responder fill route (see above).
- **Fields:** מספר אירוע · כביש (required) · מיקום (required) · פירוט הטיפול (required: 40 characters, or just non-empty on a cancelled event; no counter when cancelled) · מספרי כלי רכב · מדיה · רכבים שטופלו · הערות.
- **Footer:** primary `סיום דיווח` checks only כביש, מיקום and פירוט הטיפול, then marks the event and every crew row `הושלם`. No end time, no KM. Secondary `שמירת טיוטה` never blocks.
- **Stamp:** `shiftBornFillStamp` everywhere the event appears (`ממתין לתיעוד` · `טיוטה נשמרה` · `הושלם`). Never a per-responder stamp, never `חסר ק״מ`.
- **Server refusals** show as sent: `ניתן לתעד החל מתאריך המשמרת.` · `התיעוד כבר הושלם. רק אחמ״ש יכול לערוך.` · `אין הרשאה` · `מישהו שמר לפניך — רעננו`.
- **Device copy:** written only after an edit, with the version it was typed over. On reopen it is restored with caption `שוחזר מהמכשיר …`. If a teammate saved after it was typed, the conflict banner shows: `מישהו שמר את האירוע בזמן שמילאתם. הפרטים שהזנתם נשמרו כאן ולא נמחקו. בדקו אותם ולחצו שוב על שמירה כדי לשמור את הגרסה שלכם.`
- **Load failure:** `טעינת האירוע נכשלה. בדקו את החיבור ונסו שוב.` (not the permission empty state).
