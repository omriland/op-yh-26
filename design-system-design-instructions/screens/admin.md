# Screen — Admin (ניהול): Users, Vehicles, Roles, Closed Lists

The unit's registry office. Admin-only. Tabs: `משתמשים`, `דוחות וסטטיסטיקות`, `ניהול דלק`, `הגדרות`, `תפוצה לכלל היחידה`. Managerial surfaces — **Command** theme on desktop, **Field** on mobile (admin can work from a phone, same components as cards).

## Navigation

- Desktop sidebar section `ניהול`: items `משתמשים`, `דוחות וסטטיסטיקות`, `ניהול דלק`, `הגדרות`, `תפוצה לכלל היחידה`, `פרופיל`.
- Mobile tab bar (admin): `משתמשים` only among admin destinations; segmented control at top for `משתמשים` | `דוחות וסטטיסטיקות` | `ניהול דלק` | `הגדרות` | `תפוצה לכלל היחידה`. Full mobile tab set: `האירועים שלי` · `המשמרות שלי` · `אירועים` · `משמרות` · `משתמשים` (role-gated). Profile via app-bar menu.

## תפוצה לכלל היחידה

Admin-only compose + send log. Command on desktop, Field on mobile. Title `תפוצה לכלל היחידה`. Caption `שליחת הודעה למנהלים, לאחמ״שים או לכלל המשתמשים הפעילים.`

Compose card: channel chips `אימייל` · `SMS` · `SMS + אימייל`; audience chips `כלל המשתמשים` · `מנהלים` · `אחמ״שים`. Subject `נושא` only when the channel includes email. Body `תוכן ההודעה`. Primary `שליחה` → confirm dialog `אישור שליחה` with recipient/skip counts. Success toast reports sent / skipped / failed. Log heading `שידורים קודמים`; empty `עדיין לא נשלחה תפוצה.` Spec: `docs/superpowers/specs/2026-08-15-yahpaz-unit-broadcast-design.md`.

## דוחות וסטטיסטיקות (Reports)

Library + generic runner (spec `2026-08-14-yahpaz-reports-library-design.md`). Admin door: this ניהול tab (full catalog). אחמ״ש-only door: **כלים לאחמ״ש → דוחות וסטטיסטיקות** (filtered kinds); mobile tab `דוחות`. Admin + אחמ״ש: ניהול only. Standalone **חריגים** nav is retired — those reports live in the library. No in-app report builder.

Kinds: אירועים שהוזנו ע״י אחמ״ש ולא נסגרו ע״י מתנדב (admin + אחמ״ש; PeriodPicker on `event_date`; one row per open volunteer; אחמ״ש-only sees own events) · חריגי ק״מ · אירועים כפולים (אירועים עם אותו הכונן, באותו מקום בחלון זמן של חצי שעה). Runner: same inputs as live filters, search, CSV export. Empty library: `אין דוחות להצגה`. Spec: `2026-08-15-yahpaz-open-documentation-report-design.md`. סיכום ק״מ / פירוט ק״מ live in ניהול דלק → שימוש בדלק, not in this catalog.

Catalog: no caption under the title; search `חיפוש לפי שם דוח או תיאור` over title + includes (normalize gershayim/punctuation; all words; one-typo fuzzy on 3+ letter words). Title hits rank above description. No-results: `לא נמצאו דוחות תואמים` + ghost `ניקוי חיפוש`. Cards (not a table): title + includes, whole card tappable, no chevron. Mobile one column (`--space-3` gap); desktop two columns (`--space-6` gap).

## ניהול דלק (Hub)

Admin-only under ניהול (`ניהול דלק`, Fuel icon). Opening lands on a chooser: caption `אני רוצה:` and two catalog cards — allocate quarterly cards, or see/export usage. Back `כרטיסי דלק` returns to the chooser. Spec: `docs/superpowers/specs/2026-08-15-yahpaz-fuel-cards-hub-design.md`.

**Allocate:** existing quarterly workbook. Helper: ניהול חלוקת כרטיסי דלק לפי רבעון. יתרות עוברות באופן אוטומטי לרבעון הבא. ניתן להעביר יתרה שלילית או חיובית. Year + quarter, opening balance, month km, liters, editable cards, remaining, card numbers, save / lock. Spec: `docs/superpowers/specs/2026-08-11-yahpaz-quarterly-fuel-request-design.md`.

**Usage:** `שימוש בדלק` — כונן · קילומטרים · אירועים · ליטרים (km÷6). Period picker (טווח / חודש / שנה / אחרונים) via react-day-picker, Gregorian RTL. Totals, search, CSV. Same km rules as סיכום ק״מ.

## משתמשים (Users)

### List

- Title `משתמשים` + primary `משתמש חדש`.
- Search input (name / callsign / email).
- Desktop table: שם מלא · או״ק (mono) · דוא״ל (LTR isolate) · טלפון (LTR isolate, mono) · תפקיד · רכבים (count). Role column renders one small neutral chip (`--type-caption`, secondary-chip chrome — NOT stamps) for the **highest** role only: `מנהל־על` · `מנהל` · `אחמ״ש` · `כונן`.
- Mobile: user cards — avatar 40 + name + callsign with ⋮ overflow menu at inline-end (same actions as the desktop row), one highest-role chip + status chips, caption line with email. Vertical gaps `--space-3` between head / chips / email; no detail hairline under the head.

### Create / Edit user (dialog on desktop, full screen on mobile)

Sections:

1. `פרטים` — שם מלא (required) · דוא״ל (required; sends invite) · או״ק · טלפון.
2. `תפקידים` — three checkboxes: `מנהל` / `אחמ״ש` / `כונן`. Checking a role also checks every lower role and greys those out. Helper: `בחירת תפקיד כוללת את התפקידים שמתחתיו.` At least one required. `super_admin` is not a checkbox.
3. `רכבים` — repeatable rows: לוחית רישוי (mono, LTR) + דגם + remove icon-button; ghost `הוספת רכב` below. A user may have several vehicles.

Actions: primary `שמירת משתמש` / secondary `ביטול`. New-user success toast: `המשתמש נוצר ונשלחה הזמנה בדוא״ל`.

Deactivation (not deletion) via overflow menu: `השבתת משתמש` → confirm `להשבית את המשתמש? הוא לא יוכל להתחבר, והנתונים ההיסטוריים יישמרו.`

Super Admin only (DB-granted `super_admin`, not in role checkboxes):

- Overflow `הגדרת סיסמה` → password + confirm + checkbox `חייב להחליף סיסמה בכניסה הבאה`. Spec: `2026-08-11-yahpaz-super-admin-set-password-design.md`.
- Overflow `צפייה כמשתמש זה` + avatar menu `צפייה כמשתמש` → real session swap; banner `צופה כ־…` + `חזרה לחשבון שלי`. Spec: `2026-08-11-yahpaz-super-admin-impersonation-design.md`.
- Regular admins cannot mutate a Super Admin row (edit, OTP, invite resend, deactivate, delete). Hide those overflow items; hide `⋮` if the menu would be empty; row/card must not open the editor. Super Admins may still edit each other. Server: RLS + Edge 403 `לא ניתן לערוך מנהל־על.` Spec: `2026-08-15-yahpaz-super-admin-mark-and-lock-design.md`.

## הגדרות (Closed lists)

Four admin-managed lookups: `שלוחות` · `סוגי אירוע` · `כבישים` · `סוגי רכב לטיפול`.

### Layout

- Desktop: list-of-lists at inline-start (240 px, nav-item styling) + selected list's items in the content area.
- Mobile: the four lists as cards → tap opens the list's items full-screen.

### Items view

- Title = list name + primary `הוספת פריט`. For `כבישים`, caption `מיובא אוטומטית מGov.il` at `--type-caption` / `--text-muted` next to the title (`Gov.il` is an LTR isolate).
- Items: simple rows, hairline-separated, 48 px: value text + overflow menu (עריכה / הסרה).
- System שלוחה `תחנה / אחר / משוכפל`: caption `מערכת`; no edit/delete menu (DB-locked). Spec: `docs/superpowers/specs/2026-08-11-yahpaz-system-districts-places-location-design.md`.
- Add/edit: inline row editor (input + `שמירה` / `ביטול`) — no dialog needed for a single field.
- Remove item in use by events: block with explanation `לא ניתן להסיר פריט שמשויך לאירועים קיימים.` (info banner, not error toast).
- Empty list: `אין פריטים ברשימה זו. הפריט הראשון ישמש בטפסים מיד לאחר הוספתו.`

## States

- Loading: table/card skeletons per component spec.
- Search no-results: `לא נמצאו משתמשים תואמים` + ghost `ניקוי חיפוש`.
- All mutations get success/failure toasts per the copy rules in `05-rtl-language.md`.
