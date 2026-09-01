# Screen — Profile (פרופיל)

Own-account registry card. Not a management surface. Field on mobile; desktop follows the host shell (Command chrome + Field content, same as other logged-in lists).

## Entry

Desktop sidebar footer → `פרופיל` (above admin `הגדרות`). Mobile: app-bar avatar menu. Not a bottom-tab item.

## Layout

One `--type-title`: `פרופיל`. Then a `stack-4` of cards (`margin-block-start: --space-10`).

1. **Identity** — avatar `lg`, `full_name` (`--type-section`), `או״ק` + callsign (mono unless Hebrew). No hairline under the identity row. Ledger: `דוא״ל` (LTR isolate) · `טלפון` (numeric). Role chips: `מנהל` / `אחמ״ש` / `כונן` only — never `super_admin`. Empty roles: `—`.
2. **חיבורים** — `--type-section` heading, immediately after identity (not after vehicles). Caption `--type-caption` / `--text-muted`: `חיבור חד־פעמי לבוט בטלגרם. אחרי האישור אפשר לדווח אירועים בצ׳אט.` Loading: skeleton. Error: body muted. Empty: body `עדיין לא מחוברים.` + caption `פתחו את הבוט בטלגרם ושלחו קישור חיבור. אחרי האישור יופיע כאן החיבור לביטול.` Admin may also show primary `רישום בוט` (opens הגדרות on the `רישום בוט` pane). **No connect CTA** on the profile — connect is bot-link only. Connected: ledger `יישום` · `בתוקף עד` + destructive `בטל גישה`. Confirm dialog: `לבטל את הגישה?` body `הבוט לא יוכל יותר להשלים דיווחים בשמך עד לחיבור מחדש מטלגרם.` **Temporarily UI-disabled:** card uses `.card--disabled` (40% opacity, `inert`, `aria-disabled`) so the section stays visible but greyed and non-interactive. Buttons inside are disabled. No backend change.
3. **סיכום פעילות** — `--type-section` heading (no form-section hairline). Two equal columns (mobile included), hairline between cells. Labels `--type-label` / `--text-secondary`: `אירועים שטופלו` · `קילומטרים`. Values `--type-numeric-lg` (`.t-num-lg`) via `formatNumber`. Not tappable. Zeros stay (`0` / `0`). Caption `--type-caption` / `--text-muted`: `עודכן היום ב־HH:mm` / `עודכן אתמול ב־HH:mm` / `עודכן ב־DD.MM.YYYY, HH:mm`. Hide caption when `lifetime_stats_updated_at` is null. Snapshot columns only — no live aggregate.
4. **כתובות** — `--type-section` heading (no form-section hairline). Read-only ledger: בית / עבודה / custom label + formatted address. Empty: `לא רשומות כתובות. פנו למנהל המערכת להוספת כתובת.` Admin-managed only.
5. **רכבים** — `--type-section` heading (no form-section hairline) with ghost `הוספת רכב` + Plus icon in `.profile-vehicles__head`. Default is read-only ledger: model as label (archived: `{model} (בארכיון)`), `LicensePlate` as value, then star (when two or more active) and pencil (`עריכת רכב`). Pencil opens that row only as the same `vehicle-row` as admin users (plate + model); unsaved (`!id`) rows stay in that form. Edit actions: check `שמירת רכב` (persist + exit) and trash `הסרת רכב`. Blur still persists when both fields are valid. Add appends a blank row in edit; if an empty unsaved row already exists, focus it instead. Empty: `עדיין לא רשומים רכבים.` + the add control (not «פנו למנהל»). Trash only in edit: delete when the plate is unused on events/shifts; otherwise archive (confirm copy from `vehicles.ts`). Archived display: restore `שחזור מהארכיון` (no pencil). Edit of archived: fields disabled, caption `בארכיון — לא ניתן לשייך לאירועים חדשים`. Archived cars stay off fill / shift / assignment dropdowns. When **two or more** active vehicles: caption `--type-caption` / `--text-muted` `לחצו על הכוכב כדי לבחור רכב ראשי לאירועים ולמשמרות.` Each active saved display row gets a 44×44 star (`icon-btn`): empty = `הגדר כרכב ברירת מחדל`, filled `--accent` = `רכב ראשי` (`aria-pressed`). Archived / unsaved rows have no star. One default at a time. Successful save exits edit. Toast `הרכב הראשי עודכן.` / `הרכב נשמר.`
6. **התנתקות** — secondary block button + LogOut (mirrored).

## States

- Profile missing: title + card skeletons (`aria-busy`, `טוען פרופיל`).
- Vehicles loading: one skeleton row in the vehicles card.
- Stats ride on the profile row — no separate spinner or error.
