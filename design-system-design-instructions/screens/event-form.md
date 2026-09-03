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
| כביש | select (roads) | When שלוחה is `תחנה / אחר / משוכפל`, default to the road whose name contains `101` (still editable). |
| מיקום | text / Places combobox | Plain text for normal שלוחות. For system שלוחה `תחנה / אחר / משוכפל`: Google Places autocomplete (HE), free-text row always first, **required**. Spec: `2026-08-11-yahpaz-system-districts-places-location-design.md`. Coordinates (`location_lat`/`location_lng`) stay stored for the map pin and are **not** shown as a form field. Map drag does not edit כביש/מיקום. Spec: `2026-08-24-yahpaz-event-location-pin-design.md`. |
| הערות | textarea | optional |

`אחמ״ש` is not an input — it renders as a read-only ledger row (auto: creator's name + callsign) at the top of the section.

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
- **Back with no input:** if the lead opens `אירוע חדש` and leaves (חזרה or another nav item) without typing or changing any field, the empty row is deleted. A date-only cockpit insert is treated the same. Changing the date, a lookup, location, notes, a pin, or assigning a כונן keeps the event.

## Footer actions (sticky on mobile, above tab bar)

- Primary only: `שמירת אירוע` — flushes latest state, toast `האירוע נשמר`, navigate to event detail.
- No secondary “open” action.

## States & feedback

- Autosave success: quiet caption `נשמר` (no toast spam).
- Autosave / save failure: caption or toast `שמירת האירוע נכשלה. בדקו את החיבור ונסו שוב.` — form data preserved.
- Assigning a responder: allowed anytime; new participation starts `pending`; status leaves draft.
- Removing a responder who already entered data: confirm dialog `להסיר את הכונן? הנתונים שמילא יימחקו.`
- Leave after failed save: confirm `השמירה האחרונה נכשלה. לצאת בכל זאת?`
- Opening an event created by another אחמ״ש (web form, cockpit stage after `לחצו לעריכה`, Android form): blocking confirm first. Title `האם אתה בטוח שברצונך לערוך אירוע שהוזן על ידי {שם}?`. Body `כל שינוי שתבצע יתועד ויישמר במערכת`. Primary `עריכה` unlocks the form for this visit; secondary / X / backdrop `ביטול` leaves without writing. Own events skip the prompt.
