# Screen — Event Create / Edit (אירוע חדש · עריכת אירוע) — shift-lead

The form where the paper-form metaphor is most explicit: numbered sections (display-weight counters allowed here), dotted blanks, live autosave. Leads often start this in the field with partial data — the form must never punish incompleteness.

## Theme context

- Mobile: **Field**.
- Desktop: **Command chrome** when the sidebar is showing; content (and immersive form screens without a sidebar) is **Field**. The form itself sits on a **Field paper panel** (`--surface-raised` card, max-width `calc(var(--form-max) * 1.3)`, centered in `.shell__main` / the content pane after the sidebar). All inputs inside use Field-theme tokens (scope `data-theme="field"` on the panel).

## Layout

Title: `אירוע חדש` / `אירוע 12345 — עריכה`. Beside/below title: current stamp chip (small, unrotated) from derived status. Caption under title shows live save pulse (`שומר…` / `נשמר`) or the draft hint.

### חלק א׳ — פרטי האירוע

Form section with counter `חלק א׳`. Fields (types per `06-components.md`; HE labels are canonical). Identity layout: **תאריך** is a full-width first row; **מספר אירוע** and **או״ק ניידת** share the next row (event id at inline-start / right in RTL, callsign at inline-end / left). Same pairing on desktop web, mobile web, and Android.

| Field | Control | Notes |
|---|---|---|
| תאריך | date input | default today; full row |
| מספר אירוע | numeric text | mono; same row as או״ק ניידת, inline-start |
| או״ק ניידת | text | mono; same row as מספר אירוע, inline-end |
| שלוחה | select (districts) | |
| סוג אירוע | select (event_types) | |
| פירוט | short text | optional; visible only when סוג אירוע is `אחר`. Stored in `event_type_detail`. Empty OK. |
| מיקום | combined combobox | Junction/interchange matches from the closed list first, then Google Places, then free text. For system שלוחה `תחנה / אחר / משוכפל`, **required**. A junction pick stores its canonical coordinates and auto-fills an empty כביש from the junction’s first numeric road when exactly one closed-list road matches; an existing road selection is never overwritten. Coordinates (`location_lat`/`location_lng`) stay stored for the map pin and are **not** shown as a form field. Map drag does not edit כביש/מיקום. |
| כביש | select (roads) | Appears after מיקום and remains required/editable. When שלוחה is `תחנה / אחר / משוכפל`, default to the road whose name contains `101` (still editable). |
| הערות | textarea | optional |

`אחמ״ש ראשי` and `אחמ״ש משני` share the first row of the section: main at **66%** of the row (inline-start / right in RTL), the secondary picker at **33%** (inline-end / left). Flex + logical properties (never `left`/`right`); on phone widths, where 33% cannot hold a readable name, the pair stacks to two full-width fields.

`אחמ״ש ראשי` is a searchable picker (active `shift_lead` users) when the viewer may change main: creating אחמ״ש, or the current main while no secondaries exist, or admin / Super Admin. After secondaries exist, only admin / Super Admin may change main. Creating אחמ״ש may pick another lead as main; the creator becomes a removable `אחמ״ש משני`. When the viewer cannot change main, it is a read-only ledger row (label stays `אחמ״ש` until a secondary exists for viewers who cannot manage secondaries).

`אחמ״ש משני` is a searchable **multi-select** picker (lead / admin / Super Admin only). Selected secondaries live **inside** the picker — they are pinned to the top of the open menu with a check, and never render as chips or rows on the form. Closed trigger stays one line: `שם` for one secondary, `שם +N` for more; placeholder `הוספה`. Toggling a pinned row removes that secondary; options below it add more; search filters both groups. Locked secondaries (auto-added when a non-main אחמ״ש persists a real field or crew change) are non-interactive in the menu — greyed row, greyed check, hint `נוסף אוטומטית בעריכה — לא ניתן להסיר` — and nobody removes them. A viewer who cannot manage secondaries sees them as read-only ledger rows.

### חלק ב׳ — כוננים

- `מתנדבים` — multi-select combobox over unit users (search by name/callsign). Selected responders render as a stacked list of **assignment rows**: avatar + name + callsign + remove icon-button (44×44, `aria-label="הסרת כונן"`).
- Per assigned responder, the lead-owned fields, collapsed into an expandable row (chevron, mirrored):
  - `זמן התחלה` / `זמן סיום` — 24-hour digit-masked `HH:mm` text inputs + label action `עכשיו` (not the native `type="time"` picker, which follows the device 12/24 preference). UI shows time only; stored as wall datetimes: start on `event_date`, end on same day unless end clock &lt; start (then next day — confirm: `האם האירוע מסתיים ביום למחרת?`).
  - `קילומטרים` — numeric (manual in v1). If the assigned responder has no active (non-archived) vehicles on their profile, the field is disabled, grayed (`--surface-sunken`), and shows placeholder `מתנדב ללא רכב`. No `total_km` is stored.
  - `אמצעים` — toggle, immediately after `קילומטרים`
  - `נת״צ` — event-level toggle (`bus_lane`), immediately after `אמצעים`
  - `רכבים שטופלו` — counter steppers, one per vehicle kind from the closed list
- Responder-owned fields do NOT appear here (plate, odometers, route, treatment detail) — the lead never fills them.

## Autosave & status

- **Live autosave** after the lead finishes a field (blur / select change / assign / remove / stepper / toggle). Also flush on tab hide / page hide / back.
- **Status derivation** (not a separate “open” action):
  - no responders assigned → `draft` (אירוע בהזנה) — not shown on responders’ “האירועים שלי”
  - ≥1 responder assigned → `in_progress` (or keep `partial` / `done` if already there)
- **Minimum to create:** תאריך + סוג אירוע + כביש. Autosave does not create a row until those three are set; explicit save / assign shows field errors if missing. Other fields may stay empty.
- **Back with no input:** if the lead opens `אירוע חדש` and leaves (חזרה or another nav item) without typing or changing any field, the empty row is deleted. A date-only cockpit insert is treated the same. Changing the date, a lookup, location, notes, a pin, assigning a כונן, picking another main אחמ״ש, or adding a secondary keeps the event.

## Footer actions (sticky on mobile, above tab bar)

- Primary only: `שמירת אירוע` — flushes latest state, toast `האירוע נשמר`, navigate to event detail.
- No secondary “open” action.

## States & feedback

- Autosave success: quiet caption `נשמר` (no toast spam).
- Autosave / save failure: caption or toast `שמירת האירוע נכשלה. בדקו את החיבור ונסו שוב.` — form data preserved.
- Assigning a responder: allowed anytime; new participation starts `pending`; status leaves draft.
- Removing a responder who already has any filled field: confirm dialog `האם אתה בטוח שברצונך להסיר את {שם}?` (`{שם}` = full name). Empty assignment removes immediately.
- Saving with a date of tomorrow or later (and that date not already saved): confirm `אירוע זה נוצר בתאריך עתידי`. Primary `להמשיך` persists; secondary / X / backdrop `חזרה לעריכה` restores the last saved date (today on a new form).
- Leave after failed save: confirm `השמירה האחרונה נכשלה. לצאת בכל זאת?`
- Opening an event created by another אחמ״ש (web form, cockpit stage after `לחצו לעריכה`, Android form): blocking confirm first. Title `האם אתה בטוח שברצונך לערוך אירוע שהוזן על ידי {שם}?` (`{שם}` = main אחמ״ש). Body `כל שינוי שתבצע יתועד ויישמר במערכת`. Primary `עריכה` unlocks the form for this visit; secondary / X / backdrop `ביטול` leaves without writing. The **main** אחמ״ש skips the prompt. A secondary אחמ״ש, and any other אחמ״ש, still see it.
