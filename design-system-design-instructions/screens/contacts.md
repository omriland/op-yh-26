# Screen — אנשי קשר (unit contacts)

Directory of other unit members. Personal nav item **אנשי קשר**, directly under **המשמרות שלי** on the desktop sidebar; **מפה** follows it. Available to every signed-in user. Field on mobile; Command chrome + Field content on desktop when the sidebar is showing.

## Navigation

- Desktop sidebar: `אנשי קשר` after `המשמרות שלי` in the personal group; `מפה` immediately after `אנשי קשר`.
- Mobile: in the tab bar for כונן (fits in four: האירועים שלי · המשמרות שלי · אנשי קשר · מפה); otherwise behind `עוד`.
- Title `אנשי קשר`.

## List

- Search (name / או״ק / phone / email). Placeholder `חיפוש לפי שם, או״ק, טלפון או דוא״ל`.
- Rows: active members only, excluding the viewer and invite-pending profiles.
- Fields: שם מלא · או״ק (mono when Latin) · טלפון (LTR isolate, formatted `050-1234567`) · דוא״ל (LTR isolate, `mailto:`).
- Missing phone: `—`. Call and WhatsApp actions omitted.
- Actions: `התקשרות` (`tel:+972…`) and `וואטסאפ` (`https://wa.me/972…`, new tab). WhatsApp only for Israeli mobiles (`05…`). WhatsApp control uses the WhatsApp glyph (`currentColor`). Instant `HoverTip` (`mode="always"`) on both actions: `חיוג ל{name}` / `שליחת וואטסאפ אל {name}`.

### Mobile

Cards: avatar + name + callsign, ledger rows for phone and email, full-width secondary buttons `התקשרות` / `וואטסאפ`.

### Desktop

Table: same columns + icon-only actions (44×44, Hebrew `aria-label`).

## States

- Loading: card / row skeletons.
- Empty: `אין אנשי קשר להצגה`.
- No search hits: `לא נמצאו אנשי קשר תואמים` + ghost `ניקוי חיפוש`.
- Load error: `טעינת אנשי הקשר נכשלה. בדקו את החיבור ונסו שוב.` + secondary `רענון`.
