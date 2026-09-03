# 05 — RTL & Language

## Document setup

```html
<html lang="he" dir="rtl">
```

Set once at the root. Never override `dir` per-component except for the LTR isolates listed below.

## CSS rules

- **Logical properties only**: `margin-inline-start/end`, `padding-inline-*`, `inset-inline-*`, `border-inline-*`, `border-start-start-radius` etc., `text-align: start/end`. The physical keywords `left`/`right` are forbidden in layout code.
- Flex/grid handle RTL automatically — never "fix" order with `flex-direction: row-reverse` to compensate for direction.
- Scroll-linked UI (carousels, tab overflow) must be tested in RTL; use `scroll-padding-inline`.

## LTR isolates (the only `dir` overrides allowed)

These values are inherently LTR and must be wrapped in `<span dir="ltr">` (or `unicode-bidi: isolate` + `direction: ltr`):

| Value | Example |
|---|---|
| License plates | `12-345-67` |
| Phone numbers | `050-1234567` |
| Email addresses | `name@example.com` |
| URLs | `yahpz.com` |
| Passwords | Latin secrets — isolate the whole control so the show/hide affix sits at inline-end (visual right) |

Numbers alone (odometer, ק״מ, counts) do NOT need isolation — bare digits render fine in RTL flow.

## Icon mirroring

- **Mirror in RTL:** arrows, chevrons (back = chevron pointing right in RTL), "send", list-order icons, undo/redo.
- **Never mirror:** clock, phone, search magnifier, checkmarks, user/avatar, vehicle icons, media playback.
- Icon set: use a single consistent 24 px outline set (Lucide recommended), stroke 1.75, `currentColor`. No emoji, no mixed icon families.

## Formatting

| Data | Format | Example |
|---|---|---|
| Dates | `DD.MM.YYYY` | `09.08.2026` |
| Date + time | `DD.MM.YYYY, HH:mm` (24h, `hourCycle: h23`) | `09.08.2026, 14:30` |
| Time only (inputs + display) | `HH:mm` 24h — never AM/PM | `14:30`, `08:05` |
| Relative (lists) | Hebrew relative for < 7 days | `לפני שעתיים`, `אתמול` |
| Kilometers | number + spaced unit | `142 ק״מ` |
| Plate | mono, LTR isolate, hyphenated | `12-345-67` |

Use `Intl.DateTimeFormat('he-IL')` and `Intl.NumberFormat('he-IL')` — never hand-format.

## Hebrew copy — voice & register

The register is **official but human**: the tone of a professional duty log, not a startup and not a legal document.

- Active voice, plain verbs. Buttons say exactly what happens: `שמירת אירוע`, `מתנדבים`, `סיום דיווח` — not `שלח` or `אישור` alone.
- An action keeps its name through the whole flow: a button `שמירת אירוע` produces the toast `האירוע נשמר`.
- No exclamation marks. No emoji. No English words in UI strings.
- Errors state what happened and what to do: `שמירת האירוע נכשלה. בדקו את החיבור ונסו שוב.` Never `אופס!` and never vague `אירעה שגיאה`.
- Permission denials are explicit: `אין לך הרשאה לפעולה זו.` — forbidden actions never fail silently into empty screens.
- Empty states invite action: `אין אירועים להצגה. אירוע חדש יופיע כאן ברגע שייווצר.`
- Address users in plural-neutral imperative (`בדקו`, `נסו`) or infinitive labels (`להוספת רכב`), consistently — pick per-context from the screen blueprints.

## Canonical status vocabulary (fixed — do not rephrase)

| Context | Status | Hebrew label |
|---|---|---|
| Event | `draft` | `אירוע בהזנה` |
| Event | `in_progress` | `ממתין לתיעוד` |
| Event | `partial` | `תועד חלקית` |
| Event | `done` | `הושלם` |
| My participation (responder viewing own open row) | `pending` | `ממתין לתיעוד שלך` |
| My participation (own draft saved) | `in_progress` | `טיוטה נשמרה` |
| Participation (viewing another's open row) | `pending`/`in_progress` | `ממתין לכונן` |
| Participation | `done` | `הושלם` |
