# Screen — Admin (ניהול): Users, Vehicles, Roles, Closed Lists

The unit's registry office. Admin-only. Tabs: `משתמשים`, `דוחות וסטטיסטיקות`, `ניהול דלק`, `הגדרות`. Managerial surfaces — **Command chrome** (app bar + sidebar) + **Field** content on desktop, **Field** on mobile (admin can work from a phone, same components as cards).

## Navigation

- Desktop sidebar section `ניהול`: items `משתמשים`, `דוחות וסטטיסטיקות`, `ניהול דלק`. Pinned at sidebar block-end: `פרופיל`, then `הגדרות`.
- Mobile tab bar: 3–4 items. Daily work stays in the bar; the last tab is `עוד` when anything overflows (bottom sheet). Profile via app-bar menu.
  - כונן: `האירועים שלי` · `המשמרות שלי` · `אנשי קשר` · `מפה`
  - אחמ״ש: `האירועים שלי` · `אירועים` · `המשמרות שלי` · `עוד` (`משמרות` · `אנשי קשר` · `מפה` · `דוחות`)
  - מנהל: `האירועים שלי` · `אירועים` · `ניהול` · `עוד` (`המשמרות שלי` · `משמרות` · `אנשי קשר` · `מפה`)
- Mobile `ניהול` tab: segmented control at top for `משתמשים` | `דוחות וסטטיסטיקות` | `ניהול דלק` | `הגדרות`. `מפה` is personal nav after `אנשי קשר` (not ניהול / not כלים לאחמ״ש) — every signed-in user.

## דוחות וסטטיסטיקות (Reports)

Library + generic runner (spec `2026-08-14-yahpaz-reports-library-design.md`). Admin door: this ניהול tab (full catalog). אחמ״ש-only door: **כלים לאחמ״ש → דוחות וסטטיסטיקות** (filtered kinds); mobile tab `דוחות`. Admin + אחמ״ש: ניהול only. Standalone **חריגים** nav is retired — those reports live in the library. No in-app report builder.

Kinds: אירועים שהוזנו ע״י אחמ״ש ולא נסגרו ע״י מתנדב (admin + אחמ״ש; PeriodPicker on `event_date`; one row per open volunteer; אחמ״ש-only sees own events) · חריגי ק״מ · אירועים כפולים (אירועים עם אותו הכונן, באותו מקום בחלון זמן של חצי שעה) · אירועים עם פערי דיווח ק״מ (admin only; PeriodPicker on `event_date`; hover/tap ק״מ מתנדב replaces lead `total_km`; spec `2026-08-16-yahpaz-km-discrepancy-report-design.md`). Runner: same inputs as live filters, search, CSV export. Empty library: `אין דוחות להצגה`. Spec: `2026-08-15-yahpaz-open-documentation-report-design.md`. סיכום ק״מ / פירוט ק״מ live in ניהול דלק → שימוש בדלק, not in this catalog.

Catalog: no caption under the title; search `חיפוש לפי שם דוח או תיאור` over title + includes (normalize gershayim/punctuation; all words; one-typo fuzzy on 3+ letter words). Title hits rank above description. No-results: `לא נמצאו דוחות תואמים` + ghost `ניקוי חיפוש`. Cards (not a table): title + includes, whole card tappable, no chevron. Mobile one column (`--space-3` gap); desktop two columns (`--space-6` gap).

## ניהול דלק (Hub)

Admin-only under ניהול (`ניהול דלק`, Fuel icon). Opening lands on a chooser: caption `אני רוצה:` and two catalog cards — allocate quarterly cards, or see/export usage. Back `כרטיסי דלק` returns to the chooser. Spec: `docs/superpowers/specs/2026-08-15-yahpaz-fuel-cards-hub-design.md`.

**Allocate:** existing quarterly workbook. Helper includes `נספרים רק אירועים שתועדו במלואם.` Only `events.status = done` + lead-entered `total_km`. Spec: `docs/superpowers/specs/2026-08-15-yahpaz-fuel-allocation-completed-only-design.md`. After the quarter picker: two-column KPIs (same chrome as סיכום פעילות) — `סה״כ ק״מ` (sum of quarter km for the whole unit) · `כרטיסים ליחידה` (`suggestedCards` on that same total, not the sum of per-row מומלץ). On a locked quarter, caption `({n} חולקו בפועל)` sits next to that KPI (sum of issued `cards`). Search does not change the KPIs.

**Usage:** `שימוש בדלק` — כונן · קילומטרים · אירועים · ליטרים (km÷6). Helper includes `מוצגים כל האירועים עם ק״מ, גם אם תועדו חלקית.` Period picker, totals, search, CSV. Same km inclusion as סיכום ק״מ (status not filtered).

## משתמשים (Users)

### List

- Title `משתמשים` + secondary `רענון` (refetch the table; keep current rows while loading) + primary `משתמש חדש`.
- Search input (name / callsign / email / volunteer status / availability `זמין` · `לא זמין`).
- Desktop table: שם מלא (optional presence disc at inline-start of the name: green `--status-done` `פעיל עכשיו` ≤ 3 min, orange `--status-partial` `פעיל לאחרונה` ≤ 15 min; `--radius-full` disc, size `--space-2`; never color-only — `title` + visually-hidden label). Super Admin only (not while impersonating): Android robot after the disc when `last_android_seen_at` is set; `HoverTip` `0.3.6 · עדכני` if `version_code` matches `/android/version.json` `latestVersionCode`, else the version name only. · או״ק (mono) · טלפון (LTR isolate, mono) · תפקיד · סטטוס · **זמינות** · רכבים (count). Email is not a list column — it appears only on create/edit. Users `ממתין להרשמה` (`invite_pending`) have no availability: empty `—` in the column, no control on the card, and they do not match `זמין` / `לא זמין` search. Role column renders one small neutral chip (`--type-caption`, secondary-chip chrome — NOT stamps) for the **highest** role only: `מנהל־על` · `מנהל` · `אחמ״ש` · `כונן`. Status is a closed list (not a stamp): `מנהלה` · `חניכה בסיסית` · `חניכה טלפונית` · `חניכה ברכב פרטי` · `משמרות בלבד` · `מתנדב פעיל`. זמינות is a separate duty flag (`זמין` / `לא זמין`) with concentric discs (outer `--space-4` tint, inner `--space-2` solid; `--status-done` / `--status-alert`; no blur) plus the label; optional caption `חזרה ב־DD.MM.YYYY`. Click the cell (not the row) to edit inline (choice rows write immediately + optional `תאריך חזרה` on change; toast `הזמינות עודכנה.`; no save/cancel). Not last-action presence and not volunteer `סטטוס`.
- Mobile: user cards — presence disc (same rules) then Super Admin Android mark (same hover as desktop) then avatar 40 + name + callsign with ⋮ overflow menu at inline-end (same actions as the desktop row), one highest-role chip + volunteer-status chip + availability control (same editor in a Dialog; omit for `ממתין להרשמה`) + status chips. No email on the card (email is create/edit only). Vertical gap `--space-3` between head and chips; no detail hairline under the head. Do not nest the availability control inside the details button.

### Create / Edit user (dialog on desktop, full screen on mobile)

Sections:

1. `פרטים` — שם מלא (required) · דוא״ל (required; sends invite on create, hint `נשלחת הזמנה לכתובת זו. הקישור בתוקף ל־24 שעות.`; Super Admin may change after create) · או״ק · טלפון · סטטוס (required select: `מנהלה` · `חניכה בסיסית` · `חניכה טלפונית` · `חניכה ברכב פרטי` · `משמרות בלבד` · `מתנדב פעיל`; default `מתנדב פעיל`). Admin-only; users cannot change their own. Regular admins: דוא״ל is read-only after create (`לא ניתן לשנות דוא״ל לאחר יצירה.`).
2. `תפקידים` — three checkboxes: `מנהל` / `אחמ״ש` / `כונן`. Checking a role also checks every lower role and greys those out. Helper: `בחירת תפקיד כוללת את התפקידים שמתחתיו.` At least one required. `super_admin` is not a checkbox.
3. `רכבים` — repeatable rows: לוחית רישוי (mono, LTR) + דגם + remove icon-button; ghost `הוספת רכב` below. A user may have several vehicles.
4. `כתובות` — always two slots `בית` / `עבודה` (optional). Each is Places-only (no free-text row). Ghost `הוספת כתובת` adds an extra row: `שם הכתובת` + Places field + remove. Empty slots are not stored. Caption: `בית ועבודה הם ברירת מחדל. אפשר להשאיר ריק או לבחור כתובת מגוגל בלבד.`

Actions: primary `שמירת משתמש` / secondary `ביטול`. New-user success toast: `המשתמש נוצר ונשלחה הזמנה בדוא״ל`.

Deactivation (not deletion) via overflow menu: `השבתת משתמש` → confirm `להשבית את המשתמש? הוא לא יוכל להתחבר, והנתונים ההיסטוריים יישמרו.`

Super Admin only (DB-granted `super_admin`, not in role checkboxes):

- Overflow `הגדרת סיסמה` → password + confirm + checkbox `חייב להחליף סיסמה בכניסה הבאה`. Spec: `2026-08-11-yahpaz-super-admin-set-password-design.md`.
- Edit-user `דוא״ל` stays writable. Save calls Edge `set_email` (Auth + `profiles.email`, `email_confirm: true`). Hint `שינוי דוא״ל מעדכן גם את פרטי ההתחברות.` Duplicate → `כתובת הדוא״ל כבר בשימוש.` Regular admins stay locked. No confirmation mail.
- Overflow `צפייה כמשתמש זה` + avatar menu `צפייה כמשתמש` → real session swap; banner `צופה כ־…` + `חזרה לחשבון שלי`. Spec: `2026-08-11-yahpaz-super-admin-impersonation-design.md`.
- Avatar menu `צפייה בתפקיד אחר` → client-only role mask (כונן / אחמ״ש / מנהל) for nav + cards; banner `צופה כתפקיד …` + `חזרה לתפקיד שלי`. Hidden while impersonating. Does not swap Auth/RLS.
- Regular admins cannot mutate a Super Admin row (edit, OTP, invite resend, deactivate, delete). Hide those overflow items; hide `⋮` if the menu would be empty; row/card must not open the editor. Super Admins may still edit each other. Server: RLS + Edge 403 `לא ניתן לערוך מנהל־על.` Spec: `2026-08-15-yahpaz-super-admin-mark-and-lock-design.md`.

## מפה

Every signed-in user, personal nav after `אנשי קשר` (not ניהול / not כלים לאחמ״ש). Live GPS pins stay אחמ״ש + מנהל. Title `מפה`. Caption `חפשו כתובת כדי לראות מי הכוננים הקרובים. כל סיכה היא כתובת אחת של משתמש פעיל.` Interactive Google Map (hides Google POI and transit — shops, attractions, bus/rail icons; unit police layer unchanged). Places-only search `חיפוש כתובת` (no free text). On pick: search pin labeled with the chosen address (`--status-partial` disc), center the address and fit a 30 km box in each direction, and list `כוננים קרובים` — one row per user (their nearest address) only if that address is within 30 km, nearest-first, distance `מ׳` / `ק״מ`. Empty in-range: `אין כוננים בטווח 30 ק״מ.` Tap a row to pan/zoom to that address. User pins: disc color by volunteer status (visible without hover) — `מתנדב פעיל` and `חניכה ברכב פרטי` use `--text-on-accent` fill + `--stroke-strong` ring + raised caption (`או״ק · בית/עבודה/שם`); `חניכה טלפונית` uses `--status-done-tint` fill, `--status-done` ring, matching caption (`--status-done-on-tint`) and tooltip border. Effective לא זמין stays on the map but uses `--status-draft` disc + inactive grey caption (`color-mix` 28% `--status-draft` on `--text-on-accent`, caption text `--status-draft`); hover/focus tooltip is `לא זמין`, or `לא זמין עד DD.MM.YYYY` when a future return date exists (tooltip border `--status-draft`). Hover/focus tooltip otherwise sits flush under the pin caption (`left: 50%` + `translateX(-50%)` in map pixel space): solid `--surface-raised` fill, `--text-primary`, `--accent` border + overlay shadow (phone-training tooltip border `--status-done`). Active users only; hide `מנהלה` / `חניכה בסיסית` / `משמרות בלבד` and `ממתין להרשמה`. **Live responder pins** (latest GPS while their track page is open): `--status-done` disc `--space-6` with Lucide car icon (`--text-on-accent`, `--space-4`), caption `{או״ק || שם} · בדרך`, tooltip `{סוג · כביש מיקום} · HH:MM` (Asia/Jerusalem; tooltip border `--status-done`). Same person may also have address pin(s). Live pins are not hit targets and are not in `כוננים קרובים`. Pin gone when tracking stops (`ended_at` or un-assign) or when the last ping is older than 30s; it returns on the next ping. Empty: `אין כתובות להצגה` + `כשתמלאו כתובת למשתמש פעיל, היא תופיע כאן.` Missing key: `המפה אינה זמינה`. Canvas min-height 720px, `--radius-md`, hairline, `--surface-sunken`. Pin color key (always on): `מתנדב פעיל / חניכה ברכב פרטי` white disc; `חניכה טלפונית` `--status-done-tint`; `לא זמין` `--status-draft` (same `--space-3` disc + `--stroke-strong` ring as the others). Tapping a cluster zooms to at least zoom 11 so addresses uncluster. שכבות: `אבני קילומטר` **on** by default; `תחנות משטרה` **off** by default. When אבני קילומטר is on: nothing at zoom ≤ 13; from zoom ≥ 14, in-view numbered-road kilometre posts as IL roadside stones (fixed CSS size: 2px red rim, white panel, black km; no post, no chevron). Hover `כביש {n} · ק״מ {k}`. If more than 400 posts are in view, wait until zoom ≥ 15. Ramps are not shown. Spec: `docs/superpowers/specs/2026-08-27-yahpaz-mile-posts-map-layer-design.md`.

## הגדרות (Closed lists + broadcast + bot)

Four admin-managed lookups: `שלוחות` · `סוגי אירוע` · `כבישים` · `סוגי רכב לטיפול`. Plus a second menu card for unit-wide broadcast, and a third for Telegram bot registration.

### Layout

- Desktop: three stacked menu cards at inline-start (240 px, nav-item styling, no group headings) — closed lists in the first card, `תפוצה לכלל היחידה` in the second, `רישום בוט` in the third — + selected pane in the content area.
- Mobile: the same three menu cards on the הגדרות picker → tap opens that pane full-screen.

### Items view

- Title = list name + primary `הוספת פריט`. For `כבישים`, caption `מיובא אוטומטית מGov.il` at `--type-caption` / `--text-muted` next to the title (`Gov.il` is an LTR isolate).
- Items: simple rows, hairline-separated, 48 px: value text + overflow menu (עריכה / הסרה).
- **שלוחות order:** ghost icon-buttons `העלאה` / `הורדה` (ChevronUp / ChevronDown) at inline-end, before the overflow menu. First row disables up; last disables down. System שלוחה `תחנה / אחר / משוכפל` can be reordered (sort position is not locked) but still has no edit/delete menu. Persisted as `districts.sort_order`; event-form and Android שלוחה dropdowns follow this order, not alpha.
- System שלוחה `תחנה / אחר / משוכפל`: caption `מערכת`; no edit/delete menu (DB-locked). Spec: `docs/superpowers/specs/2026-08-11-yahpaz-system-districts-places-location-design.md`.
- Add/edit: inline row editor (input + `שמירה` / `ביטול`) — no dialog needed for a single field.
- Remove item in use by events: block with explanation `לא ניתן להסיר פריט שמשויך לאירועים קיימים.` (info banner, not error toast).
- Empty list: `אין פריטים ברשימה זו. הפריט הראשון ישמש בטפסים מיד לאחר הוספתו.`

### תפוצה לכלל היחידה

Admin-only compose + send log, inside הגדרות (not a top-level ניהול tab). Title `תפוצה לכלל היחידה`. Caption `שליחת הודעה למנהלים, לאחמ״שים או לכלל המשתמשים הפעילים.` No `הוספת פריט`.

Compose card: channel chips `אימייל` · `SMS` · `SMS + אימייל`; audience chips `כלל המשתמשים` · `מנהלים` · `אחמ״שים`. Subject `נושא` only when the channel includes email. Body `תוכן ההודעה`. Preview/confirm add `N עם האפליקציה` when someone in the audience has אבן דרך (push is extra, not a channel chip). Primary `שליחה` → confirm dialog `אישור שליחה` with recipient/skip/app counts. Success toast reports sent / skipped / failed / התראות. Log heading `שידורים קודמים`; empty `עדיין לא נשלחה תפוצה.` Specs: `docs/superpowers/specs/2026-08-15-yahpaz-unit-broadcast-design.md`, `docs/superpowers/specs/2026-08-17-yahpaz-unit-broadcast-push-design.md`.

### רישום בוט

Admin-only unit wiring, inside הגדרות (not on פרופיל). Title `רישום בוט`. No caption. No `הוספת פריט`. Empty: `עדיין לא רשום בוט.` List error: muted body with the API error. Rows: ledger `שם` / `מזהה` (LTR isolate) / `בוט` `@username` + secondary `חידוש טוקן` + destructive `הסרה`. Confirm `להסיר את הבוט?` / `החיבורים הקיימים יבוטלו. אפשר לרשום את אותו בוט מחדש אחר כך.` Primary destructive `הסרה` (loading `מסיר…`) / secondary `ביטול`. Success toast `הבוט הוסר`. Create fields: `שם היישום`, `שם משתמש בטלגרם` (hint `בלי @`, isolate). Secondary `יצירת יישום` (loading `יוצר…`). Token dialog is English LTR (for the bot builder): `This token is shown only once` / `The new token is shown only once` / `Save the token with whoever is building the bot. Volunteers do not need it.` Ledger `Client ID` · `Token`. Primary `Got it`. Close `Close`. Impersonation: banner `צפייה כמשתמש — לא ניתן לרשום בוט.` + disabled create/rotate/delete. Volunteers connect on פרופיל after a bot exists. Access token TTL is 60 days.

## States

- Loading: table/card skeletons per component spec.
- Search no-results: `לא נמצאו משתמשים תואמים` + ghost `ניקוי חיפוש`.
- All mutations get success/failure toasts per the copy rules in `05-rtl-language.md`.
