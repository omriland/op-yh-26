# Screen — Profile (פרופיל)

Own-account registry card. Not a management surface. Field on mobile; desktop follows the host shell (Command chrome + Field content, same as other logged-in lists).

## Entry

Desktop sidebar footer → `פרופיל` (above admin `הגדרות`). Mobile: app-bar avatar menu. Not a bottom-tab item.

## Layout

One `--type-title`: `פרופיל`. Then a `stack-4` of cards (`margin-block-start: --space-10`).

1. **Identity** — avatar `lg`, `full_name` (`--type-section`), `או״ק` + callsign (mono unless Hebrew). No hairline under the identity row. Ledger: `דוא״ל` (LTR isolate) · `טלפון` (numeric). Role chips: `מנהל` / `אחמ״ש` / `כונן` only — never `super_admin`. Empty roles: `—`.
2. **חיבור לטלגרם** — `--type-section` heading, immediately after identity (not after vehicles). Caption `--type-caption` / `--text-muted`: `דיווח אירועים בצ׳אט, בלי להיכנס למפרט.` Loading: skeleton. Error: body muted. No registered bot: body `עדיין לא מחוברים.` Volunteer caption: `החיבור ייפתח כאן אחרי שהמנהל ירשום את הבוט.` Admin caption: `רשמו את הבוט בהגדרות.` plus primary `רישום בוט` (opens הגדרות on the `רישום בוט` pane). Disconnected with a registered bot: primary block `חבר לטלגרם` (one app) or `חבר את {name}` (several), MessageSquare icon (not mirrored), loading `מחבר…`. Connected: ledger `יישום` · `בתוקף עד` + destructive `בטל גישה`. Confirm dialog unchanged. Impersonation: connect disabled; toast `לא ניתן לחבר יישום בזמן התחזות.`
3. **סיכום פעילות** — `--type-section` heading (no form-section hairline). Two equal columns (mobile included), hairline between cells. Labels `--type-label` / `--text-secondary`: `אירועים שטופלו` · `קילומטרים`. Values `--type-numeric-lg` (`.t-num-lg`) via `formatNumber`. Not tappable. Zeros stay (`0` / `0`). Caption `--type-caption` / `--text-muted`: `עודכן היום ב־HH:mm` / `עודכן אתמול ב־HH:mm` / `עודכן ב־DD.MM.YYYY, HH:mm`. Hide caption when `lifetime_stats_updated_at` is null. Snapshot columns only — no live aggregate.
4. **כתובות** — `--type-section` heading (no form-section hairline). Read-only ledger: בית / עבודה / custom label + formatted address. Empty: `לא רשומות כתובות. פנו למנהל המערכת להוספת כתובת.` Admin-managed only.
5. **רכבים** — `--type-section` heading (no form-section hairline). Ledger of model + plate. Archived: `{model} (בארכיון)`. Empty: `לא רשומים רכבים. פנו למנהל המערכת להוספת רכב.`
6. **התנתקות** — secondary block button + LogOut (mirrored).

## States

- Profile missing: title + card skeletons (`aria-busy`, `טוען פרופיל`).
- Vehicles loading: one skeleton row in the vehicles card.
- Stats ride on the profile row — no separate spinner or error.
