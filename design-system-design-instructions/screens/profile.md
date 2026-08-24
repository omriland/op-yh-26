# Screen — Profile (פרופיל)

Own-account registry card. Not a management surface. Field on mobile; desktop follows the host shell (Command chrome + Field content, same as other logged-in lists).

## Entry

Desktop sidebar footer → `פרופיל` (above admin `הגדרות`). Mobile: app-bar avatar menu. Not a bottom-tab item.

## Layout

One `--type-title`: `פרופיל`. Then a `stack-4` of cards (`margin-block-start: --space-10`).

1. **Identity** — avatar `lg`, `full_name` (`--type-section`), `או״ק` + callsign (mono unless Hebrew). No hairline under the identity row. Ledger: `דוא״ל` (LTR isolate) · `טלפון` (numeric). Role chips: `מנהל` / `אחמ״ש` / `כונן` only — never `super_admin`. Empty roles: `—`.
2. **סיכום פעילות** — `--type-section` heading (no form-section hairline). Two equal columns (mobile included), hairline between cells. Labels `--type-label` / `--text-secondary`: `אירועים שטופלו` · `קילומטרים`. Values `--type-numeric-lg` (`.t-num-lg`) via `formatNumber`. Not tappable. Zeros stay (`0` / `0`). Caption `--type-caption` / `--text-muted`: `עודכן היום ב־HH:mm` / `עודכן אתמול ב־HH:mm` / `עודכן ב־DD.MM.YYYY, HH:mm`. Hide caption when `lifetime_stats_updated_at` is null. Snapshot columns only — no live aggregate.
3. **כתובות** — `--type-section` heading (no form-section hairline). Read-only ledger: בית / עבודה / custom label + formatted address. Empty: `לא רשומות כתובות. פנו למנהל המערכת להוספת כתובת.` Admin-managed only.
4. **רכבים** — `--type-section` heading (no form-section hairline). Ledger of model + plate. Archived: `{model} (בארכיון)`. Empty: `לא רשומים רכבים. פנו למנהל המערכת להוספת רכב.`
5. **חיבורים** — `--type-section` heading. Empty: `אין יישומים מחוברים.` Each grant: ledger `יישום` · `בתוקף עד` (formatDateTime) + destructive `בטל גישה`. Confirm dialog: `לבטל את הגישה?` / `הבוט לא יוכל להשלים דיווחים בשמך עד שתאשרו מחדש.` Footer: destructive `בטל גישה` + secondary `ביטול`.
6. **יישומים לשותפים** (admin only) — `--type-section`. Empty: `עדיין לא רשום יישום שותף.` Rows: ledger name / `מזהה` (LTR isolate) / `בוט` `@username` + secondary `חידוש סוד`. Create fields: `שם היישום`, `שם משתמש בטלגרם` (hint `בלי @`, isolate). Secondary `יצירת יישום` (loading `יוצר…`). Secret dialog shows client id + secret once: `הסוד יוצג פעם אחת בלבד` / `שמרו את הסוד אצל השותף. לא נציג אותו שוב.` Primary `הבנתי`.
7. **התנתקות** — secondary block button + LogOut (mirrored).

## States

- Profile missing: title + card skeletons (`aria-busy`, `טוען פרופיל`).
- Vehicles loading: one skeleton row in the vehicles card.
- Stats ride on the profile row — no separate spinner or error.
