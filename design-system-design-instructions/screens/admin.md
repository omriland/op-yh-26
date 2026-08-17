# Screen — Admin (ניהול): Users, Vehicles, Roles, Closed Lists

The unit's registry office. Admin-only. Tabs: `משתמשים`, `דוחות וסטטיסטיקות`, `ניהול דלק`, `הגדרות`. Managerial surfaces — **Command** theme on desktop, **Field** on mobile (admin can work from a phone, same components as cards).

## Navigation

- Desktop sidebar section `ניהול`: items `משתמשים`, `דוחות וסטטיסטיקות`, `ניהול דלק`. Pinned at sidebar block-end: `פרופיל`, then `הגדרות`.
- Mobile tab bar: 3–4 items. Daily work stays in the bar; the last tab is `עוד` when anything overflows (bottom sheet). Profile via app-bar menu.
  - כונן: `האירועים שלי` · `המשמרות שלי` · `אנשי קשר`
  - אחמ״ש: `האירועים שלי` · `אירועים` · `המשמרות שלי` · `עוד` (`משמרות` · `אנשי קשר` · `מפה` · `דוחות`)
  - מנהל: `האירועים שלי` · `אירועים` · `ניהול` · `עוד` (`המשמרות שלי` · `משמרות` · `אנשי קשר` · `מפה`)
- Mobile `ניהול` tab: segmented control at top for `משתמשים` | `דוחות וסטטיסטיקות` | `ניהול דלק` | `הגדרות`. `מפה` lives under כלים לאחמ״ש (after משמרות), not ניהול — אחמ״ש and מנהל.

## דוחות וסטטיסטיקות (Reports)

Library + generic runner (spec `2026-08-14-yahpaz-reports-library-design.md`). Admin door: this ניהול tab (full catalog). אחמ״ש-only door: **כלים לאחמ״ש → דוחות וסטטיסטיקות** (filtered kinds); mobile tab `דוחות`. Admin + אחמ״ש: ניהול only. Standalone **חריגים** nav is retired — those reports live in the library. No in-app report builder.

Kinds: אירועים שהוזנו ע״י אחמ״ש ולא נסגרו ע״י מתנדב (admin + אחמ״ש; PeriodPicker on `event_date`; one row per open volunteer; אחמ״ש-only sees own events) · חריגי ק״מ · אירועים כפולים (אירועים עם אותו הכונן, באותו מקום בחלון זמן של חצי שעה) · אירועים עם פערי דיווח ק״מ (admin only; PeriodPicker on `event_date`; hover/tap ק״מ מתנדב replaces lead `total_km`; spec `2026-08-16-yahpaz-km-discrepancy-report-design.md`). Runner: same inputs as live filters, search, CSV export. Empty library: `אין דוחות להצגה`. Spec: `2026-08-15-yahpaz-open-documentation-report-design.md`. סיכום ק״מ / פירוט ק״מ live in ניהול דלק → שימוש בדלק, not in this catalog.

Catalog: no caption under the title; search `חיפוש לפי שם דוח או תיאור` over title + includes (normalize gershayim/punctuation; all words; one-typo fuzzy on 3+ letter words). Title hits rank above description. No-results: `לא נמצאו דוחות תואמים` + ghost `ניקוי חיפוש`. Cards (not a table): title + includes, whole card tappable, no chevron. Mobile one column (`--space-3` gap); desktop two columns (`--space-6` gap).

## ניהול דלק (Hub)

Admin-only under ניהול (`ניהול דלק`, Fuel icon). Opening lands on a chooser: caption `אני רוצה:` and two catalog cards — allocate quarterly cards, or see/export usage. Back `כרטיסי דלק` returns to the chooser. Spec: `docs/superpowers/specs/2026-08-15-yahpaz-fuel-cards-hub-design.md`.

**Allocate:** existing quarterly workbook. Helper includes `נספרים רק אירועים שתועדו במלואם.` Only `events.status = done` + lead-entered `total_km`. Spec: `docs/superpowers/specs/2026-08-15-yahpaz-fuel-allocation-completed-only-design.md`.

**Usage:** `שימוש בדלק` — כונן · קילומטרים · אירועים · ליטרים (km÷6). Helper includes `מוצגים כל האירועים עם ק״מ, גם אם תועדו חלקית.` Period picker, totals, search, CSV. Same km inclusion as סיכום ק״מ (status not filtered).

## משתמשים (Users)

### List

- Title `משתמשים` + secondary `רענון` (refetch the table; keep current rows while loading) + primary `משתמש חדש`.
- Search input (name / callsign / email / volunteer status / availability `זמין` · `לא זמין`).
- Desktop table: שם מלא (optional presence disc at inline-start of the name: green `--status-done` `פעיל עכשיו` ≤ 3 min, orange `--status-partial` `פעיל לאחרונה` ≤ 15 min; `--radius-full` disc, size `--space-2`; never color-only — `title` + visually-hidden label) · או״ק (mono) · דוא״ל (LTR isolate) · טלפון (LTR isolate, mono) · תפקיד · סטטוס · **זמינות** · רכבים (count). Role column renders one small neutral chip (`--type-caption`, secondary-chip chrome — NOT stamps) for the **highest** role only: `מנהל־על` · `מנהל` · `אחמ״ש` · `כונן`. Status is a closed list (not a stamp): `מנהלה` · `חניכה בסיסית` · `חניכה טלפונית` · `חניכה ברכב פרטי` · `משמרות בלבד` · `מתנדב פעיל`. זמינות is a separate duty flag (`זמין` / `לא זמין`) with concentric discs (outer `--space-4` tint, inner `--space-2` solid; `--status-done` / `--status-alert`; no blur) plus the label; optional caption `חזרה ב־DD.MM.YYYY`. Click the cell (not the row) to edit inline (choice rows write immediately + optional `תאריך חזרה` on change; toast `הזמינות עודכנה.`; no save/cancel). Not last-action presence and not volunteer `סטטוס`.
- Mobile: user cards — presence disc (same rules) then avatar 40 + name + callsign with ⋮ overflow menu at inline-end (same actions as the desktop row), one highest-role chip + volunteer-status chip + availability control (same editor in a Dialog) + status chips, caption line with email. Vertical gaps `--space-3` between head / chips / email; no detail hairline under the head. Do not nest the availability control inside the details button.

### Create / Edit user (dialog on desktop, full screen on mobile)

Sections:

1. `פרטים` — שם מלא (required) · דוא״ל (required; sends invite) · או״ק · טלפון · סטטוס (required select: `מנהלה` · `חניכה בסיסית` · `חניכה טלפונית` · `חניכה ברכב פרטי` · `משמרות בלבד` · `מתנדב פעיל`; default `מתנדב פעיל`). Admin-only; users cannot change their own.
2. `תפקידים` — three checkboxes: `מנהל` / `אחמ״ש` / `כונן`. Checking a role also checks every lower role and greys those out. Helper: `בחירת תפקיד כוללת את התפקידים שמתחתיו.` At least one required. `super_admin` is not a checkbox.
3. `רכבים` — repeatable rows: לוחית רישוי (mono, LTR) + דגם + remove icon-button; ghost `הוספת רכב` below. A user may have several vehicles.
4. `כתובות` — always two slots `בית` / `עבודה` (optional). Each is Places-only (no free-text row). Ghost `הוספת כתובת` adds an extra row: `שם הכתובת` + Places field + remove. Empty slots are not stored. Caption: `בית ועבודה הם ברירת מחדל. אפשר להשאיר ריק או לבחור כתובת מגוגל בלבד.`

Actions: primary `שמירת משתמש` / secondary `ביטול`. New-user success toast: `המשתמש נוצר ונשלחה הזמנה בדוא״ל`.

Deactivation (not deletion) via overflow menu: `השבתת משתמש` → confirm `להשבית את המשתמש? הוא לא יוכל להתחבר, והנתונים ההיסטוריים יישמרו.`

Super Admin only (DB-granted `super_admin`, not in role checkboxes):

- Overflow `הגדרת סיסמה` → password + confirm + checkbox `חייב להחליף סיסמה בכניסה הבאה`. Spec: `2026-08-11-yahpaz-super-admin-set-password-design.md`.
- Overflow `צפייה כמשתמש זה` + avatar menu `צפייה כמשתמש` → real session swap; banner `צופה כ־…` + `חזרה לחשבון שלי`. Spec: `2026-08-11-yahpaz-super-admin-impersonation-design.md`.
- Avatar menu `צפייה בתפקיד אחר` → client-only role mask (כונן / אחמ״ש / מנהל) for nav + cards; banner `צופה כתפקיד …` + `חזרה לתפקיד שלי`. Hidden while impersonating. Does not swap Auth/RLS.
- Regular admins cannot mutate a Super Admin row (edit, OTP, invite resend, deactivate, delete). Hide those overflow items; hide `⋮` if the menu would be empty; row/card must not open the editor. Super Admins may still edit each other. Server: RLS + Edge 403 `לא ניתן לערוך מנהל־על.` Spec: `2026-08-15-yahpaz-super-admin-mark-and-lock-design.md`.

## מפה

אחמ״ש + מנהל, under כלים לאחמ״ש after `משמרות` (not a ניהול tab). Title `מפה`. Caption `חפשו כתובת כדי לראות מי הכוננים הקרובים. כל סיכה היא כתובת אחת של משתמש פעיל.` Interactive Google Map. Places-only search `חיפוש כתובת` (no free text). On pick: search pin labeled with the chosen address (`--status-partial` disc), center the address and fit a 30 km box in each direction, and list `כוננים קרובים` — one row per user (their nearest address) only if that address is within 30 km, nearest-first, distance `מ׳` / `ק״מ`. Empty in-range: `אין כוננים בטווח 30 ק״מ.` Tap a row to pan/zoom to that address. User pins: `--accent` disc + raised caption (`או״ק · בית/עבודה/שם`). Effective לא זמין stays on the map but uses `--status-draft` disc + inactive grey caption (`color-mix` 28% `--status-draft` on `--text-on-accent`, caption text `--status-draft`); hover/focus tooltip is `לא זמין`, or `לא זמין עד DD.MM.YYYY` when a future return date exists (tooltip border `--status-draft`). Hover/focus tooltip otherwise sits flush under the pin caption (`left: 50%` + `translateX(-50%)` in map pixel space): solid `--surface-raised` fill, `--text-primary`, `--accent` border + overlay shadow; `חניכה ברכב פרטי` uses `--status-alert` text/border. Active users only; hide `מנהלה` / `חניכה בסיסית` / `משמרות בלבד`. **Live responder pins** (latest GPS while their track page is open): `--status-done` disc `--space-6` with Lucide car icon (`--text-on-accent`, `--space-4`), caption `{או״ק || שם} · בדרך`, tooltip `{סוג · כביש מיקום} · HH:MM` (Asia/Jerusalem; tooltip border `--status-done`). Same person may also have address pin(s). Live pins are not hit targets and are not in `כוננים קרובים`. Pin gone when tracking stops (`ended_at` or un-assign) or when the last ping is older than 30s; it returns on the next ping. Empty: `אין כתובות להצגה` + `כשתמלאו כתובת למשתמש פעיל, היא תופיע כאן.` Missing key: `המפה אינה זמינה`. Canvas min-height 720px, `--radius-md`, hairline, `--surface-sunken`.

## הגדרות (Closed lists + broadcast)

Four admin-managed lookups: `שלוחות` · `סוגי אירוע` · `כבישים` · `סוגי רכב לטיפול`. Plus a second menu card for unit-wide broadcast.

### Layout

- Desktop: two stacked menu cards at inline-start (240 px, nav-item styling, no group headings) — closed lists in the first card, `תפוצה לכלל היחידה` in the second — + selected pane in the content area.
- Mobile: the same two menu cards on the הגדרות picker → tap opens that pane full-screen.

### Items view

- Title = list name + primary `הוספת פריט`. For `כבישים`, caption `מיובא אוטומטית מGov.il` at `--type-caption` / `--text-muted` next to the title (`Gov.il` is an LTR isolate).
- Items: simple rows, hairline-separated, 48 px: value text + overflow menu (עריכה / הסרה).
- System שלוחה `תחנה / אחר / משוכפל`: caption `מערכת`; no edit/delete menu (DB-locked). Spec: `docs/superpowers/specs/2026-08-11-yahpaz-system-districts-places-location-design.md`.
- Add/edit: inline row editor (input + `שמירה` / `ביטול`) — no dialog needed for a single field.
- Remove item in use by events: block with explanation `לא ניתן להסיר פריט שמשויך לאירועים קיימים.` (info banner, not error toast).
- Empty list: `אין פריטים ברשימה זו. הפריט הראשון ישמש בטפסים מיד לאחר הוספתו.`

### תפוצה לכלל היחידה

Admin-only compose + send log, inside הגדרות (not a top-level ניהול tab). Title `תפוצה לכלל היחידה`. Caption `שליחת הודעה למנהלים, לאחמ״שים או לכלל המשתמשים הפעילים.` No `הוספת פריט`.

Compose card: channel chips `אימייל` · `SMS` · `SMS + אימייל`; audience chips `כלל המשתמשים` · `מנהלים` · `אחמ״שים`. Subject `נושא` only when the channel includes email. Body `תוכן ההודעה`. Primary `שליחה` → confirm dialog `אישור שליחה` with recipient/skip counts. Success toast reports sent / skipped / failed. Log heading `שידורים קודמים`; empty `עדיין לא נשלחה תפוצה.` Spec: `docs/superpowers/specs/2026-08-15-yahpaz-unit-broadcast-design.md`.

## States

- Loading: table/card skeletons per component spec.
- Search no-results: `לא נמצאו משתמשים תואמים` + ghost `ניקוי חיפוש`.
- All mutations get success/failure toasts per the copy rules in `05-rtl-language.md`.
