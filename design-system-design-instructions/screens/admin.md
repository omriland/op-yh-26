# Screen — Admin (ניהול): Users, Vehicles, Roles, Closed Lists

The unit's registry office. Admin-only. Two areas: `משתמשים` and `הגדרות` (closed lists). Managerial surfaces — **Command** theme on desktop, **Field** on mobile (admin can work from a phone, same components as cards).

## Navigation

- Desktop sidebar section `ניהול`: items `משתמשים`, `טבלה מסכמת`, `דרישת דלק`, `הגדרות`.
- Mobile tab bar (admin): `משתמשים` only among admin destinations; segmented control at top for `משתמשים` | `טבלה מסכמת` | `דרישת דלק` | `הגדרות`. Full mobile tab set: `האירועים שלי` · `המשמרות שלי` · `אירועים` · `משמרות` · `משתמשים` (role-gated). Profile via app-bar menu.

## טבלה מסכמת (Fuel summary / detail)

Admin-only report (nav label `טבלה מסכמת`; Fuel icon lives on `דרישת דלק`). Date range (`מתאריך` / `עד תאריך`) on event **`created_at`** (when reported). Segment **סיכום** | **פירוט**:

- **סיכום** — table of all active users: קילומטרים (`total_km` only) · אירועים.
- **פירוט** — one row per participation with `total_km` set: כונן · תאריך · שעה · מיקום · סוג אירוע · סה״כ ק״מ · הערות.

Odometers are not shown. Specs: `docs/superpowers/specs/2026-08-10-yahpaz-fuel-refund-report-design.md`, `docs/superpowers/specs/2026-08-11-yahpaz-monthly-fuel-detail-report-design.md`.

## דרישת דלק (Quarterly fuel request)

Admin-only workbook under ניהול (`דרישת דלק`, Fuel icon). Year + calendar quarter picker. Rows with opening balance, three month km columns, liters (÷6), editable cards (floor liters÷15 default), remaining, card numbers. Save draft / lock quarter (carry remaining). Spec: `docs/superpowers/specs/2026-08-11-yahpaz-quarterly-fuel-request-design.md`.

## משתמשים (Users)

### List

- Title `משתמשים` + primary `משתמש חדש`.
- Search input (name / callsign / email).
- Desktop table: שם מלא · או״ק (mono) · דוא״ל (LTR isolate) · טלפון (LTR isolate, mono) · תפקידים · רכבים (count). Roles column renders small neutral chips (`--type-caption`, secondary-chip chrome — NOT stamps): `מנהל` · `אחמ״ש` · `כונן`.
- Mobile: user cards — avatar 40 + name + callsign with ⋮ overflow menu at inline-end (same actions as the desktop row), roles chips row, caption line with email. Vertical gaps `--space-3` between head / chips / email; no detail hairline under the head.

### Create / Edit user (dialog on desktop, full screen on mobile)

Sections:

1. `פרטים` — שם מלא (required) · דוא״ל (required; sends invite) · או״ק · טלפון.
2. `תפקידים` — three checkboxes: `מנהל` / `אחמ״ש` / `כונן`. At least one required; combos allowed. Helper: `ניתן לשלב תפקידים.`
3. `רכבים` — repeatable rows: לוחית רישוי (mono, LTR) + דגם + remove icon-button; ghost `הוספת רכב` below. A user may have several vehicles.

Actions: primary `שמירת משתמש` / secondary `ביטול`. New-user success toast: `המשתמש נוצר ונשלחה הזמנה בדוא״ל`.

Deactivation (not deletion) via overflow menu: `השבתת משתמש` → confirm `להשבית את המשתמש? הוא לא יוכל להתחבר, והנתונים ההיסטוריים יישמרו.`

Super Admin only (DB-granted `super_admin`, not in role checkboxes):

- Overflow `הגדרת סיסמה` → password + confirm + checkbox `חייב להחליף סיסמה בכניסה הבאה`. Spec: `2026-08-11-yahpaz-super-admin-set-password-design.md`.
- Overflow `צפייה כמשתמש זה` + avatar menu `צפייה כמשתמש` → real session swap; banner `צופה כ־…` + `חזרה לחשבון שלי`. Spec: `2026-08-11-yahpaz-super-admin-impersonation-design.md`.

## הגדרות (Closed lists)

Four admin-managed lookups: `שלוחות` · `סוגי אירוע` · `כבישים` · `סוגי רכב לטיפול`.

### Layout

- Desktop: list-of-lists at inline-start (240 px, nav-item styling) + selected list's items in the content area.
- Mobile: the four lists as cards → tap opens the list's items full-screen.

### Items view

- Title = list name + primary `הוספת פריט`.
- Items: simple rows, hairline-separated, 48 px: value text + overflow menu (עריכה / הסרה).
- System שלוחה `תחנה / אחר / משוכפל`: caption `מערכת`; no edit/delete menu (DB-locked). Spec: `docs/superpowers/specs/2026-08-11-yahpaz-system-districts-places-location-design.md`.
- Add/edit: inline row editor (input + `שמירה` / `ביטול`) — no dialog needed for a single field.
- Remove item in use by events: block with explanation `לא ניתן להסיר פריט שמשויך לאירועים קיימים.` (info banner, not error toast).
- Empty list: `אין פריטים ברשימה זו. הפריט הראשון ישמש בטפסים מיד לאחר הוספתו.`

## States

- Loading: table/card skeletons per component spec.
- Search no-results: `לא נמצאו משתמשים תואמים` + ghost `ניקוי חיפוש`.
- All mutations get success/failure toasts per the copy rules in `05-rtl-language.md`.
