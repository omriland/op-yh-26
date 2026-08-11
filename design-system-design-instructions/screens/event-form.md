# Screen — Event Create / Edit (אירוע חדש · עריכת אירוע) — shift-lead

The form where the paper-form metaphor is most explicit: numbered sections (display-weight counters allowed here), dotted blanks, live autosave. Leads often start this in the field with partial data — the form must never punish incompleteness.

## Theme context

- Mobile: **Field**.
- Desktop: **Command** shell, but the form itself sits on a **Field paper panel** (`--surface-raised` card, max-width 720, centered in the content area) — the lead fills a paper form even in the dark records room. All inputs inside use Field-theme tokens (scope `data-theme="field"` on the panel).

## Layout

Title: `אירוע חדש` / `אירוע 12345 — עריכה`. Beside/below title: current stamp chip (small, unrotated) from derived status. Caption under title shows live save pulse (`שומר…` / `נשמר`) or the draft hint.

### חלק א׳ — פרטי האירוע

Form section with counter `חלק א׳`. Fields (types per `06-components.md`; HE labels are canonical):

| Field | Control | Notes |
|---|---|---|
| תאריך | date input | default today |
| מספר אירוע | numeric text | mono |
| שלוחה | select (districts) | |
| או״ק ניידת | text | mono |
| סוג אירוע | select (event_types) | |
| כביש | select (roads) | When שלוחה is `תחנה / אחר / משוכפל`, default to the road whose name contains `101` (still editable). |
| מיקום | text / Places combobox | Plain text for normal שלוחות. For system שלוחה `תחנה / אחר / משוכפל`: Google Places autocomplete (HE), free-text row always first, **required**. Spec: `2026-08-11-yahpaz-system-districts-places-location-design.md`. |
| הערות | textarea | optional |

`אחמ״ש` is not an input — it renders as a read-only ledger row (auto: creator's name + callsign) at the top of the section.

### חלק ב׳ — כוננים

- `הקצאת כוננים` — multi-select combobox over unit users (search by name/callsign). Selected responders render as a stacked list of **assignment rows**: avatar + name + callsign + remove icon-button (44×44, `aria-label="הסרת כונן"`).
- Per assigned responder, the lead-owned fields, collapsed into an expandable row (chevron, mirrored):
  - `זמן התחלה` / `זמן סיום` — native time inputs + label action `עכשיו`. UI shows time only; stored as wall datetimes: start on `event_date`, end on same day unless end clock &lt; start (then next day — confirm: `האם האירוע מסתיים ביום למחרת?`).
  - `קילומטרים` — numeric (manual in v1)
  - `רכבים שטופלו` — counter steppers, one per vehicle kind from the closed list
  - `אמצעים` — toggle
- Responder-owned fields do NOT appear here (plate, odometers, route, treatment detail) — the lead never fills them.

## Autosave & status

- **Live autosave** after the lead finishes a field (blur / select change / assign / remove / stepper / toggle). Also flush on tab hide / page hide / back.
- **Status derivation** (not a separate “open” action):
  - no responders assigned → `draft` (טיוטה) — not shown on responders’ “האירועים שלי”
  - ≥1 responder assigned → `in_progress` (or keep `partial` / `done` if already there)
- **Minimum to create:** תאריך + סוג אירוע + כביש. Autosave does not create a row until those three are set; explicit save / assign shows field errors if missing. Other fields may stay empty.

## Footer actions (sticky on mobile, above tab bar)

- Primary only: `שמירת אירוע` — flushes latest state, toast `האירוע נשמר`, navigate to event detail.
- No secondary “open” action.

## States & feedback

- Autosave success: quiet caption `נשמר` (no toast spam).
- Autosave / save failure: caption or toast `שמירת האירוע נכשלה. בדקו את החיבור ונסו שוב.` — form data preserved.
- Assigning a responder: allowed anytime; new participation starts `pending`; status leaves draft.
- Removing a responder who already entered data: confirm dialog `להסיר את הכונן? הנתונים שמילא יימחקו.`
- Leave after failed save: confirm `השמירה האחרונה נכשלה. לצאת בכל זאת?`
