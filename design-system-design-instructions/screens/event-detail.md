# Screen — Event Detail (פרטי אירוע)

The record itself. This screen is where the document metaphor is strongest: an event block (the letterhead + event fields) followed by one responder card per assigned responder.

## Theme context

- Mobile: **Field**.
- Desktop shift-lead/admin: **Command chrome** (app bar + sidebar) + **Field** content.
- Desktop responder: **Field**, max-width 720 centered.

## Layout

### Header (the letterhead)

- Back navigation: ghost icon-button (chevron, mirrored) + `אירועים`.
- Title row: `אירוע 12345` (`--type-title`; the number in Frank Ruhl Libre is acceptable here — it's part of the letterhead) with the **header stamp** (large, rotated −8°, per `06-components.md`) at inline-end showing the viewer-relative status.
- Sub-line (`--type-caption`, `--text-muted`): `09.08.2026 · כביש 6 · מחלף שורק`.
- Actions (per role): shift-lead/admin get secondary `עריכת אירוע`; admin additionally destructive-ghost `מחיקה` inside an overflow menu (kebab, `aria-label="פעולות נוספות"`).
- **Map hero (coords only):** when `location_lat`/`location_lng` exist, a full-bleed Static Map hero under the app bar (edge-to-edge of `main`), natural map colors at reduced opacity + darkening scrim (no hue filters); letterhead overlays the band; display-only. Spec: `docs/superpowers/specs/2026-08-11-yahpaz-event-detail-map-hero-design.md`.

### Event block (פרטי האירוע)

Card with form-section heading `פרטי האירוע` sitting on its rule. Content = **ledger rows** (dl/dt/dd):

`אחמ״ש` · `תאריך` · `מספר אירוע` (mono) · `שלוחה` · `או״ק ניידת` (mono) · `סוג אירוע` · `כביש` · `מיקום` · `הערות` (notes render full-width below the ledger as a paragraph, `--type-body`, with label above).

**מדיה** sits on this event block after notes (crew-wide, including shift-born): two contact-sheet bands `לפני הטיפול` / `במהלך/לאחר הטיפול`, 3-up square thumbs. Empty → `אין תמונות לאירוע זה.` Assigned responders may add after their fill is done; admin / shift-lead view without being assigned. Cancelled events are view-only. Desktop lightbox is wide (`--content-max`): photo at inline-start, `תיאור` + assigned vehicles at inline-end.

**Shift-born only:** ledger row `מספרי כלי רכב` on this event block (shared crew list) — vertical stack of Israeli plate marks + optional model · color captions; empty → `—`. Not repeated on כונן cards.

Missing values → `—` muted (per ledger spec). Draft events show the dotted fill-in line on missing required rows for the lead viewing their own draft.

### Responder cards (כוננים)

Section heading `כוננים (3)` with the done-fraction at inline-end in mono (`2/3 הושלמו`, `--type-caption`).

One **responder card** per `event_responders` row (per `06-components.md`):

- Collapsed header (default for every card that is not the viewer’s own כונן row): avatar + full name + callsign (mono caption) + stamp (viewer-relative: own open row → `ממתין לתיעוד שלך`; other's open row → `ממתין לכונן`; done → `הושלם`) + chevron. Whole header is the toggle (`aria-expanded`).
- Default open: viewer’s own assignment only. אחמ״ש / מנהל, and events the viewer is not assigned to: all cards start collapsed.
- Expanded body: ledger rows `לוחית רישוי` (mono, LTR isolate) · `מד אוץ התחלה` · `מד אוץ סיום` (כונן sees these two only on their own card; hidden on other כוננים. אחמ״ש / מנהל see them on every card) · `קילומטרים` (hidden for כונן-only viewers — lead-entered `total_km` is אחמ״ש / מנהל only) · `נתיב נסיעה` · `אמצעים` (`כן`/`לא`) · `רכבים שטופלו` (comma list `גרר × 2, פרטי × 1`) · **standalone only:** `מספרי כלי רכב` immediately after `רכבים שטופלו` (plate-mark stack; empty → `—`) · `פירוט הטיפול` + `הערות לטיפול` as paragraphs.
- Footer (expanded only):
  - Viewer's own open card → full-width primary `השלמת הפרטים שלי` → responder fill flow.
  - Shift-lead on any card → ghost `עריכת שדות אחמ״ש`.

Desktop: event block and responder column side by side — event block 5/12 at inline-start (sticky), responder cards stacked in the remaining 7/12. Mobile: single column, event block first.

## Live status behavior

When the last open responder completes (or the viewer completes their own section and returns), the header stamp updates with the **stamp-press animation** (`07-motion.md`). Event flips to `הושלם` automatically when all responders are done — no manual "close event" button exists.

## States

- **Loading:** ledger-row skeletons in the event block + 2 card skeletons.
- **Not found / no permission:** empty state `אין לך הרשאה לצפות באירוע זה או שהאירוע אינו קיים.` + secondary `חזרה לאירועים`. (RLS denials are explicit — never render an empty record.)
- **Delete confirm (admin):** dialog `למחוק את האירוע 12345?` body `הפעולה תמחק גם את נתוני הכוננים המשויכים. לא ניתן לשחזר.` — destructive `מחיקה` / secondary `ביטול`. Success toast `האירוע נמחק`.
