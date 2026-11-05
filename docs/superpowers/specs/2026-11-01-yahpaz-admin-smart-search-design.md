# Yahpaz — Admin smart search (חיפוש)

Status: draft for Omri's review · 2026-11-01

## Why

Admins regularly need one event or one person and only remember fragments of it:
"the event on road 531 last week", "a damaged Suzuki in January", a plate, a
responder's name, a police event number. Today the unit events list has one
text box. It matches police event number, location, road, lead and responder
names, but not plates, car make, dates or treatment text, and it can't combine
clues ("531" + "last week"). Admins end up scrolling the table, or asking
someone who was there.

We want a single search box where an admin types the way they'd ask a
colleague, and gets the records back. It should feel like asking an LLM, while
costing almost nothing per query and never sending unit records to the model.

## Decisions already made (by Omri)

- **Admins only for now** (`admin` and `super_admin`). Shift leads and responders
  do not see it.
- **Scope of v1: find and export.** Find one or a few events or people from
  fuzzy clues. Export a matched set of events to CSV.
- **Not in v1: free-form questions whose answer is a number or fact** ("how many
  fuel cards did the unit use last quarter"). They're deferred because a wrong
  number gives no way to check it.
- **AI-based, but light on tokens.**
- **The old-site archive (`legacy.*`) is in v1.** Yahpaz launched on 1 Nov 2026,
  so for months nearly all real history, including damage locations, lives in
  the archive.
- **The admin's typed sentence goes to the provider as typed**, even when it
  contains a name, plate or phone number. Records from the database never go.
- **Provider: OpenAI**, called from a Supabase Edge Function. The key is the
  Supabase function secret `OPENAI_API_KEY`, which Omri provides and is set with
  `supabase secrets set`. It is never a Netlify or `VITE_` variable.

## Goals

1. One search box finds events by any mix of date or date range, police event
   number, road, location, event type, district, treated plate, treated car
   make, model or color, responder, shift lead, and words in the treatment text.
2. The same box searches the **old-site archive**: date, event number, road,
   location, callsigns, free-text car description, action text, and **damage
   locations**. Archive results are labeled and open the existing legacy report.
3. It finds people by name, callsign, phone or email, and shows when each was last active.
4. A plate, a police event number, or any digits-only query returns results with
   **no AI call** in under 1 second.
5. A natural-language query returns results in about 3 seconds or less, and
   **always shows what the search understood**, as chips the admin can remove.
6. The model sees only the admin's sentence plus a short fixed vocabulary. It
   never sees event rows, names from the database, or plates from the database.
7. The matched events (new and archive) export to CSV in one click.
8. Admin-only is enforced on the server: the Edge Function and both database
   functions refuse non-admins. Archive lookups are written to the existing
   `legacy.report_lookup_audit`.

## Non-goals (v1)

- Aggregate or "how many / how much" answers (fuel cards, km totals, counts).
- Shift leads or responders using it.
- Follow-up turns and conversation memory. Each search stands alone.
- Vector or semantic search over free text.
- Searching shifts, fuel quarters, broadcasts or audit history.

## Anti-goals (a failure even if it "works")

- A confident list of wrong results with no sign of what the search understood.
- Any record from the database (names, plates, treatment text, archive rows)
  sent to the AI provider. Only the admin's own sentence goes.
- Unmasked ID numbers (ת.ז.) from the archive anywhere in results or CSV.
- The AI key reaching the browser (any `VITE_` variable).
- A chat UI. This is a search box with results, not a conversation.
- Automatic file downloads. Export is always an explicit click.

## Constraints

- Stack is fixed: Vite + React + TS SPA, Supabase (Auth, Postgres, RLS, Edge
  Functions), Netlify static hosting. The AI call lives in a **Supabase Edge
  Function** (like `admin-users` and `plate-lookup`), with the key as a
  Supabase function secret.
- The design system in `design-system-design-instructions/` is binding: Hebrew
  only, RTL, logical CSS properties, tokens only, both theme contexts, all
  states, and tap targets of 44 px or more. Plates, IDs and dates use the mono
  numeric style.
- The unit timezone is `Asia/Jerusalem`. All relative dates ("last week",
  "yesterday", "January") resolve in that timezone.
- Treated-car `manufacturer` comes from the government plate registry in
  **Hebrew** (e.g. `סוזוקי יפן`). An English make typed by the admin must be
  matched in Hebrew, so the model outputs the Hebrew make.

## How it works

### Two lanes

```
admin types → presses Enter
        │
        ├─ digits / plate-like / dashes only ─────────► Direct lane (no AI)
        │                                                filter = { text: q }
        │
        └─ anything else ──► Edge Function `smart-search`
                               (admin check → model → validate JSON)
                               returns filter + chips
                                        │
   client calls, in parallel, with the admin's own session:
     RPC `admin_search(filter)`          → new events + people
     RPC `admin_search_archive(filter)`  → old-site archive rows
                                        │
                     results per section + "found by" reason
```

- The **Edge Function only translates**. It returns a filter and never queries
  unit data. The browser then runs the database function with the admin's own
  session, so RLS and `has_role` checks apply exactly as everywhere else.
- **Removing a chip re-runs the database function with the edited filter. There
  is no second AI call.**
- If the Edge Function fails or times out (5 s), the page falls back to the
  direct lane with the raw text and says so (see States).

### The filter (the only thing the model may output)

JSON, validated against a strict schema in the Edge Function. Unknown keys are
dropped. Invalid values are dropped and the rest is kept.

| Key | Meaning | Matched against |
|---|---|---|
| `intent` | `find` · `export` · `unsupported_question` | UI behavior only |
| `entity` | `events` · `people` · `both` | which result sections run |
| `date_from`, `date_to` | ISO dates, inclusive | `events.event_date` |
| `police_event_id` | text | `events.police_event_id` |
| `road` | text, e.g. `531` | `roads.name` |
| `location_text` | words | `events.location` |
| `event_type` | one of the event-type names sent in the prompt | `event_types.name` |
| `district` | one of the district names sent in the prompt | `districts.name` |
| `plate` | digits | `event_treated_plates.plate_digits` (substring) |
| `vehicle_text` | make, model or color words; the model emits Hebrew **and** Latin spellings (registry `manufacturer` is Hebrew, `model` is often Latin) | plates' `manufacturer`, `model`, `color` |
| `person` | name or callsign as typed | `profiles.full_name`, `callsign` (main lead, secondary leads in `event_secondary_leads`, responders) |
| `person_role` | `responder` · `lead` · `any` | which link to match the person on |
| `text` | free words, e.g. `נזק` | `events.treatment_detail`, `events.notes`, `event_responders.treatment_detail`, `treatment_notes`, `events.location` |
| `status` | event status | `events.status` (new only) |
| `include_cancelled` | boolean, default false | `events.is_cancelled` (new only) |
| `damaged` | boolean: any damage recorded | archive `event_car_hits.value = true`; on new events it adds `נזק` to `text` |
| `damage_location` | one of the 17 `HIT_TYPES` labels sent in the prompt | archive `event_car_hits.hit_id` |
| `source` | `new` · `archive` · `both` (default `both`) | which event functions run |

**On the archive**, the same keys map to `legacy.vol_events`: `event_date`,
`event_number` (police event id), `road_number`, `location`, `call_sign` /
`coordinator` (resolved to names through `legacy.users`), the legacy event
type, `actions_taken` + `problems` (for `text`), and `cars_in_hits.license_plate`
(free text such as `סוזוקי לבנה 1234567`, used for both `plate` and
`vehicle_text`). `district` maps through `legacy.branches` if its names line up,
and is otherwise ignored for archive rows. *(Mapping details left to the
builder.)*

**Prompt contents:** today's date in Asia/Jerusalem, the schema, the event-type,
district and 17 damage-location name lists (small closed lists, read from the DB and cached in the
function), and ~15 worked examples in Hebrew and English. **No** roads list,
no people, no plates. The model writes what the admin said, and the database
resolves it with `ilike` plus the existing Hebrew/English keyboard variants
(`searchQueryVariants`).

**Date rules for the prompt:** a month with no year means the most recent past
occurrence ("ינואר" on 1 Nov 2026 means January 2026). "Last week" means the
previous Sunday-to-Saturday week (the Israeli week). A quarter means calendar
quarters (Q3 = Jul–Sep). The resolved dates always appear as a chip, so a wrong
guess is visible.

### Hebrew is the input language

Admins will type in Hebrew (Omri, 2026-11-01). English is the exception, not
the norm. Concretely:

- **The prompt is written for Hebrew input.** Worked examples are Hebrew-first
  (about 12 Hebrew, 3 English or mixed), and the golden set is at least 80%
  Hebrew.
- **Prefixes are stripped.** Hebrew glues ב / ה / ו / כ / ל / מ / ש onto words
  (`בכביש 531`, `שנפגע`, `בסוזוקי`, `לדני`). The model outputs bare values
  (`531`, `סוזוקי`, `דני`). The direct lane, which has no model, also tries
  each word with one leading prefix letter removed.
- **Hebrew time phrases** have explicit examples: `אתמול`, `שלשום`, `השבוע`,
  `בשבוע שעבר`, `החודש`, `בחודש שעבר`, `בינואר`, `רבעון 3` / `רבעון שלישי`,
  `בקיץ`, `לפני חודשיים`, and numeric `14.1` / `14/1/26`. Day-first always.
  Hebrew-calendar dates (`ט״ו בשבט`) are out of scope and fall through to `text`.
- **Gershayim and geresh** (`ק״מ`, `אחמ״ש`, `ת״א`) are normalized the same way
  `normalizeReportQuery` already does, so `אחמש` and `אחמ״ש` match alike.
- **Wrong keyboard layout:** Hebrew typed on an English layout goes through the
  existing `searchQueryVariants` on the direct lane. The model is told that a
  Latin gibberish query may be Hebrew typed on the wrong layout.
- **Damage words expand.** The model maps `נזק`, `נפגע`, `פגוע`, `פגיעה`,
  `מעוך` and `תאונה` to `damaged: true`, plus the same words in `text` for new
  events. Body-part words (`פגוש`, `דלת נהג`, `שמשה`) map to `damage_location`.
- **Unsupported questions are detected in Hebrew**: `כמה`, `מה הסכום`, and so
  on. One exception: `מתי X התחבר לאחרונה` becomes a people search for X,
  because the person row already shows last activity.
- **Chip labels and every message are Hebrew**, whatever language the query
  was in.

**Cost:** about 1,500 input tokens (mostly cacheable) and under 150 output
tokens per natural-language search, using the provider's smallest model with
structured JSON output. The direct lane costs nothing.

### Database function `admin_search(p_filter jsonb)`

- `security invoker`, and it returns empty unless
  `has_role(auth.uid(), 'admin' | 'super_admin')`, matching
  `search_unit_event_ids`.
- Every filter key is ANDed. Within `text`, `vehicle_text` and `person`, each
  word must match somewhere (all words, any field).
- `text` from the direct lane matches across everything: police event number,
  plate digits and plate number, make, model, location, road, names and
  callsigns, and treatment text. This is today's `search_unit_event_ids`
  widened.
- It returns event ids with a short `found_by` reason (e.g.
  `לוחית 12-345-67 · סוזוקי סוויפט`, `כונן: דני כהן`) and people rows (id,
  name, callsign, highest role, volunteer status). Last-active times come from
  the existing `admin_list_last_active()`, because `user_presence` is not
  readable directly.
- The cap is **200 events and 50 people** per search. The client hydrates the
  rows with the existing `EVENT_LIST_SELECT`.
- The CSV export calls the same function with a higher cap (5,000) and its own
  wider select.
- Demo events (`is_demo`) are excluded.

### Database function `admin_search_archive(p_filter jsonb)`

- `security definer` (the `legacy` schema isn't reachable any other way), with
  the same admin / super_admin gate as `legacy_report_search`. It raises
  `42501` for anyone else.
- It takes the same filter and returns one summary row per old report
  (`event_fk`): date, event number, road, location, callsigns with names, car
  descriptions, a damage summary (e.g. `פגוש קדמי, דלת נהג`) and `found_by`.
  ID numbers are never returned.
- Every call inserts one row into `legacy.report_lookup_audit` with a new
  `search_kind` of `smart`, the filter (passed through `legacy.mask_id_like`) and
  the result fks. If a check constraint limits `search_kind`, the migration
  widens it.
- The cap is **200 rows** for the screen and 5,000 for CSV.
- Clicking a row opens the existing legacy report, using
  `legacy_report_search('id', event_fk)` and the `LegacyEventReport` component
  as they are today.

### Logging

A small table, `smart_search_log`, stores admin id, raw query, returned filter,
lane, event and people counts, latency, and whether the admin removed a chip
afterwards. It is admin-read only, used to tune the prompt examples and nothing
else.

## UI

### Where it lives

- **Desktop:** a standard nav row `חיפוש` (Lucide `Search`, 20 px) as the
  **first row of the `ניהול` sidebar section**, using the existing nav-row
  recipe with no new component. `Ctrl+K` / `⌘K` from any screen opens `/search`
  with the input focused. *(My call.)*
- **Mobile:** `חיפוש` is the first item in the admin's `עוד` sheet. *(My call.)*
- The route is `/search?q=…`. The query lives in the URL so back/forward and
  reload keep the results and an admin can share the link with another admin.
- `screens/admin.md` (nav lists) is updated in the same slice. A new blueprint,
  `screens/search.md`, is written from this section.

### Page anatomy (desktop, Field content, `page--wide`)

```
┌──────────────────────────────────────────────────────────────┐
│ חיפוש                                                         │
│ חיפוש אירועים ואנשים בשפה חופשית, מספר אירוע או לוחית רישוי.     │
│                                                              │
│ [🔍  למשל: אירוע בכביש 531 בשבוע שעבר                  ] [חיפוש]│
│                                                              │
│ הבנתי:  [כביש 531 ✕] [25.10.2026–31.10.2026 ✕] [סוזוקי ✕]      │
│                                                              │
│ ── אירועים · נמצאו 3 ─────────────────────── [ייצוא ל־CSV] ──  │
│ תאריך │ מספר אירוע │ סוג │ כביש / מיקום │ אחמ״ש │ כוננים │ סטטוס │ נמצא לפי │
│ …existing EventsTable rows + one extra column…               │
│                                                              │
│ ── ארכיון האתר הישן · נמצאו 7 ────────────── [ייצוא ל־CSV] ──  │
│ תאריך │ מספר אירוע │ כביש / מיקום │ כוננים │ רכבים │ נזק │ נמצא לפי │
│ 14.01.2026 │ 4471 │ 531 · מחלף רעננה │ 214 דני כהן │ סוזוקי לבנה │ פגוש קדמי │ … │
│                                                              │
│ ── אנשים · נמצאו 1 ────────────────────────────────────────  │
│ ● דני כהן · 214 · אחמ״ש · מתנדב פעיל · פעיל לאחרונה 31.10 22:14 │
└──────────────────────────────────────────────────────────────┘
```

- **Title and caption:** `--type-title` plus a caption in `--type-caption` /
  `--text-muted`.
- **Input:** the standard text input chrome at full width, magnifier affix at
  inline-start, primary button `חיפוש` at inline-end (the only primary on the
  page). Enter submits. Placeholder examples rotate per visit from a fixed list
  of 3. *(My call.)*
- **`הבנתי:` chip row:** neutral chips (secondary-chip chrome, `--type-caption`,
  **never stamps**), each with a 44 px remove target (`✕`, `aria-label="הסרת
  {label}"`). Dates use mono numerals. Removing a chip re-runs the database
  function. The row is hidden on the direct lane, which shows only the caption
  `חיפוש ישיר לפי מספר` instead.
- **Events section:** a section rule with heading `אירועים · נמצאו N` and a
  secondary button `ייצוא ל־CSV` at inline-end. The table reuses `EventsTable`
  unchanged and adds one column, `נמצא לפי` (truncated to one line, `HoverTip`
  for the full reason). Row click opens event detail.
- **Archive section:** a section rule with heading `ארכיון האתר הישן · נמצאו N`
  and its own secondary `ייצוא ל־CSV`. It's a plain table using the standard
  table recipe with columns תאריך · מספר אירוע · כביש / מיקום · כוננים · רכבים ·
  נזק · נמצא לפי. These rows have no stamps, because the archive has no status.
  Row click opens the legacy report. The section is hidden when `source = new`
  or when it has zero rows and the new-events section has results.
  *(Separate section, not merged into the events table: my call. The two
  record shapes differ too much to share columns honestly.)*
- **People section:** a section rule with heading `אנשים · נמצאו N` and rows in
  the `משתמשים` list style: presence disc, name, callsign (mono), highest-role
  chip, volunteer status, `פעיל לאחרונה DD.MM HH:mm` (or `—`). Row click opens
  that user's edit dialog on `/admin/users`.
- **Section order:** whichever entity the filter targeted comes first. For
  `both`, the order is new events, archive, people. A date range that falls
  entirely before the first new event puts the archive first. *(My call.)*
- **`intent = export`:** results render normally, and `ייצוא ל־CSV` becomes the
  page's primary button (the `חיפוש` button drops to secondary). Nothing
  downloads until it is clicked.

### Mobile

The layout is the same, stacked. The input and the `חיפוש` button sit on one
row, chips wrap, events render as standard event cards with a `--type-caption`
line `נמצא לפי: …` under row 3, and people render as user cards. Export stays a
secondary button under the events heading.

### States (Hebrew copy)

| State | Rendering |
|---|---|
| Before first search | Empty state, icon `Search`, `חפשו אירוע או אדם`, caption `אפשר לכתוב כמו שמספרים: "רכב סוזוקי שנפגע בינואר", מספר אירוע או לוחית.` |
| Searching | Chip row skeleton plus 6 row skeletons (desktop) or 5 card skeletons (mobile). The button shows `מחפש…`. |
| No results | `לא נמצאו תוצאות`, caption `נסו להסיר אחד מהתנאים למעלה.`, ghost `ניקוי החיפוש`. |
| Cap hit | Caption above the table: `מוצגות 200 התוצאות הראשונות. צמצמו את החיפוש או ייצאו ל־CSV.` |
| Unsupported question | An info line in place of results: `שאלות כמו "כמה" עדיין לא נתמכות. אפשר לחפש אירועים או אנשים.` Any chips the model did extract still show, with a ghost `הצגת האירועים המתאימים`. |
| AI unavailable or timed out | Results from the direct lane plus caption `החיפוש החכם אינו זמין כרגע. מוצגות תוצאות חיפוש טקסט.` |
| Error | The standard load-error pattern, `החיפוש נכשל. בדקו את החיבור ונסו שוב.` plus secondary `רענון`. |
| Export done | Toast `הקובץ יוצא`. |

### CSV

- Filename: `חיפוש-אירועים-YYYY-MM-DD.csv`.
- Columns: the events-table columns plus `לוחיות`, `יצרן ודגם`, `כוננים`
  (names), `ק״מ`, `פירוט הטיפול`.
- Archive file: `חיפוש-ארכיון-YYYY-MM-DD.csv`, with the archive-table columns
  plus `פעולות שבוצעו`. ID numbers never appear.
- Both files use the existing `toCsv` / `downloadCsv` (BOM, Hebrew-safe).

## Testing and success criteria

- **Unit (vitest):** filter validation (unknown keys dropped, bad dates dropped,
  `event_type` outside the list dropped), the direct-lane classifier, chip
  labels, and the CSV row mapping.
- **Database:** a non-admin calling `admin_search` gets nothing, a non-admin
  calling `admin_search_archive` gets `42501`, and a non-admin calling
  `smart-search` gets 403. Every archive search writes one audit row.
- **Golden set:** about 40 real-style queries, most aimed at archive data since
  that's where the volume is today, (Hebrew, English, mixed, with
  typos), each with its expected filter, in a script run by hand against the
  real provider. It is not part of CI. The target is at least 90% exact match on
  the date, road, plate, person and vehicle keys before launch.
- **Latency:** direct lane p95 under 1 s, AI lane p95 under 3 s.

## Left to the builder

- Exact prompt wording and the worked examples.
- Indexes needed for `admin_search` (for example `pg_trgm` on the text columns)
  after measuring with real data volume.
- How `found_by` is assembled, within the format above.
- The keyboard-shortcut implementation, as long as it doesn't clash with
  existing `keydown` handlers (Dialog, SelectField, OverflowMenu).
- Whether to share code with `search_unit_event_ids` or keep it separate.

## Later (not v1)

1. **Questions with numeric answers** (fuel cards, km, counts, last login),
   each answer shown with the records behind it.
2. Opening to shift leads, scoped to the events they can already see.
