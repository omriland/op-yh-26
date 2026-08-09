# Screen — Event Detail (פרטי אירוע)

The record itself. This screen is where the document metaphor is strongest: an event block (the letterhead + event fields) followed by one responder card per assigned responder.

## Theme context

- Mobile: **Field**.
- Desktop shift-lead/admin: **Command**.
- Desktop responder: **Field**, max-width 720 centered.

## Layout

### Header (the letterhead)

- Back navigation: ghost icon-button (chevron, mirrored) + `אירועים`.
- Title row: `אירוע 12345` (`--type-title`; the number in Frank Ruhl Libre is acceptable here — it's part of the letterhead) with the **header stamp** (large, rotated −8°, per `06-components.md`) at inline-end showing the viewer-relative status.
- Sub-line (`--type-caption`, `--text-muted`): `09.08.2026 · כביש 6 · מחלף שורק`.
- Actions (per role): shift-lead/admin get secondary `עריכת אירוע`; admin additionally destructive-ghost `מחיקה` inside an overflow menu (kebab, `aria-label="פעולות נוספות"`).

### Event block (פרטי האירוע)

Card with form-section heading `פרטי האירוע` sitting on its rule. Content = **ledger rows** (dl/dt/dd):

`אחמ״ש` · `תאריך` · `מספר אירוע` (mono) · `שלוחה` · `או״ק ניידת` (mono) · `סוג אירוע` · `כביש` · `מיקום` · `הערות` (notes render full-width below the ledger as a paragraph, `--type-body`, with label above).

Missing values → `—` muted (per ledger spec). Draft events show the dotted fill-in line on missing required rows for the lead viewing their own draft.

### Responder cards (כוננים)

Section heading `כוננים (3)` with the done-fraction at inline-end in mono (`2/3 הושלמו`, `--type-caption`).

One **responder card** per `event_responders` row (per `06-components.md`):

- Header: avatar + full name + callsign (mono caption) + stamp (viewer-relative: own open row → `ממתין למילוי פרטים`; other's open row → `ממתין לכונן`; done → `הושלם`).
- Body ledger rows: `לוחית רישוי` (mono, LTR isolate) · `קמ התחלה` · `קמ סיום` · `קילומטרים` · `נתיב נסיעה` · `אמצעים` (`כן`/`לא`) · `רכבים שטופלו` (comma list `גרר × 2, פרטי × 1`) · `פירוט הטיפול` + `הערות לטיפול` as paragraphs.
- Footer: 
  - Viewer's own open card → full-width primary `השלמת הפרטים שלי` → responder fill flow.
  - Shift-lead on any card → ghost `עריכת שדות אחמ״ש`.

Desktop (Command): event block and responder column side by side — event block 5/12 at inline-start (sticky), responder cards stacked in the remaining 7/12. Mobile: single column, event block first.

## Live status behavior

When the last open responder completes (or the viewer completes their own section and returns), the header stamp updates with the **stamp-press animation** (`07-motion.md`). Event flips to `הושלם` automatically when all responders are done — no manual "close event" button exists.

## States

- **Loading:** ledger-row skeletons in the event block + 2 card skeletons.
- **Not found / no permission:** empty state `אין לך הרשאה לצפות באירוע זה או שהאירוע אינו קיים.` + secondary `חזרה לאירועים`. (RLS denials are explicit — never render an empty record.)
- **Delete confirm (admin):** dialog `למחוק את האירוע 12345?` body `הפעולה תמחק גם את נתוני הכוננים המשויכים. לא ניתן לשחזר.` — destructive `מחיקה` / secondary `ביטול`. Success toast `האירוע נמחק`.
