# Screen — Search (חיפוש)

One search box for admins (`admin`, `super_admin`) that finds events, old-site archive reports and people from fuzzy clues, and exports matched events to CSV. Not a chat: a box, what the search understood, and the records. Spec: `docs/superpowers/specs/2026-11-01-yahpaz-admin-smart-search-design.md`.

## Theme context

- Desktop: **Command chrome** (sidebar) + **Field** content, `page--wide`.
- Mobile: **Field**.

## Entry

- Desktop sidebar `ניהול`: `חיפוש` is the first row (Lucide `Search`, 20 px, standard nav row). Mobile: first item in the admin `עוד` sheet. See `admin.md`.
- `⌘K` / `Ctrl+K` from any screen opens `/search` with the field focused. On `/search` itself it focuses and selects the field and keeps the query and results.
- Route `/search?q=…`. The query is written to the URL only on submit, so back / forward / reload re-run that query.

## Anatomy (desktop)

```
חיפוש                                                     (--type-title)
חיפוש אירועים ואנשים בשפה חופשית, מספר אירוע או לוחית רישוי.   (--type-caption, --text-muted)

[🔍  למשל: אירוע בכביש 531 בשבוע שעבר                     ] [חיפוש]

הבנתי:  [כביש 531 ✕] [25.10.2026–31.10.2026 ✕] [סוזוקי ✕]

אירועים · נמצאו 3 ───────────────────────────── [ייצוא ל־CSV]
EventsTable rows, each with a full-width line under it: נמצא לפי: …

ארכיון האתר הישן · נמצאו 7 ──────────────────── [ייצוא ל־CSV]
תאריך · מספר אירוע · כביש / מיקום · כוננים · רכבים · נזק
each row with a full-width line under it: נמצא לפי: …

אנשים · נמצאו 1 ───────────────────────────────────────────
שם מלא · או״ק · תפקיד · סטטוס · פעיל לאחרונה
```

- **Field:** standard text-input chrome at full width (44 px), magnifier affix at **inline-start**, visually hidden label `חיפוש אירועים ואנשים`. Placeholder is picked once per visit from: `למשל: אירוע בכביש 531 בשבוע שעבר` · `למשל: סוזוקי שנפגעה בינואר` · `למשל: 12-345-67`. Enter or `חיפוש` submits.
- **`חיפוש`:** the page's only primary, at inline-end of the field on the same row on every width, 44 px tall to match the field. Loading: `מחפש…`.
- **`הבנתי:` chip row** (AI lane only): `--type-label` label + neutral chips — secondary-chip chrome (`1px --stroke-strong`, `--radius-sm`, 36 px tall, `--type-caption`, `--text-secondary`). **Never stamps.** Each chip has a `✕` remove control with a 44 × 44 hit area and `aria-label="הסרת {label}"`. Only the number or date part of a chip is mono (`לוחית` stays sans; the plate is an LTR isolate). Removing a chip re-runs the database search with the edited filter — no second AI call. Chips are read-only while a search runs and in the unsupported state.
- **Lane captions** (in place of the chip row, `--type-caption` / `--text-muted`): direct lane `חיפוש ישיר לפי מספר`; AI unavailable `החיפוש החכם אינו זמין כרגע. מוצגות תוצאות חיפוש טקסט.`
- **Section rule:** `--type-section` heading `{name} · נמצאו N`, then a hairline filling the row, then (events and archive only) secondary `ייצוא ל־CSV` at inline-end. On mobile the button sits under the heading. Loading: `מייצא…`.
- **Sections and order:** `sectionOrder` — the targeted entity first; for `both`: events, archive, people; a date range that ends before the first new-system event puts the archive first. A section with zero rows is hidden (the page shows the empty state when all are empty).
- **Events:** `EventsTable` with its 7 columns unchanged, plus a full-width meta row under each data row (`colSpan` 7, same anatomy as the completion-queue meta row: dotted hairline above, `--space-2` block padding, no alert rail). The line is `--type-caption`: label `נמצא לפי:` in `--text-secondary`, then the reason in `--text-primary` as plain text (the reason is one string; no separate mono parts). A `הושלם` row's meta row shares its `--status-done-tint`. Hovering either row highlights both; clicking either opens the event. No extra column and no horizontal scroll. Without `foundBy`, `EventsTable` renders exactly as before. Row → event detail.
- **Archive:** standard table recipe with 6 columns that share the width equally (`table-layout: fixed`, so it always fits the content column at a 1280 px viewport), long cells ellipsize with a `HoverTip`. `נמצא לפי` is not a column: it is the same full-width meta row as the events table (`colSpan` 6, dotted hairline above, `--space-2` block padding, `--type-caption`, label in `--text-secondary`, reason in `--text-primary`). Hovering either row highlights both; clicking either opens the report; only the data row takes focus. Date and event number mono; a missing event number shows `—`. No stamps — the archive has no status. Rows are focusable (`Enter` / `Space`). Row → the legacy report (below).
- **People:** the `משתמשים` row style — presence disc at inline-start of the name, או״ק (mono), one highest-role neutral chip, volunteer status, `פעיל לאחרונה` as `DD.MM.YYYY, HH:mm` (mono) or `—`. Rows focusable. Row → that user's edit dialog on `משתמשים`.
- **Cap hit:** a section with exactly 200 rows gets `מוצגות 200 התוצאות הראשונות. צמצמו את החיפוש או ייצאו ל־CSV.` above its table (`--type-caption` / `--text-muted`).
- **Export intent:** when the filter's intent is `export`, the events `ייצוא ל־CSV` (or the archive one when there are no events) becomes the page's single primary and `חיפוש` drops to secondary. Nothing downloads until it is clicked.

## Archive report

Clicking an archive row replaces the results with the existing `LegacyEventReport` for that `event_fk` (`legacy_report_search('id', fk)`), under the same field: ghost `תוצאות החיפוש` (ChevronRight) at inline-start, secondary `הדפסה / PDF` at inline-end. Printing outputs the report alone (`.legacy-print-root`). While loading: a card of ledger-row skeletons. Failure: toast `טעינת הדוח נכשלה. בדקו את החיבור ונסו שוב.`

## Mobile

Same order, stacked. Field and `חיפוש` share one row; chips wrap. Events render as standard event cards with a `--type-caption` line `נמצא לפי: …` under row 3. Archive rows render as cards: road · location (`--type-section`), cars · damage (`--type-body`, `--text-secondary`), date · `אירוע N` · people (`--type-caption`, numbers mono), then `נמצא לפי: …`. People render as user cards (presence disc, avatar 40, name, או״ק; role + status chips; `פעיל לאחרונה …` caption). Whole card is one tap target; pressed = `--surface-sunken`. No tables.

## States

| State | Rendering |
|---|---|
| Before first search (also a blank, whitespace or punctuation-only query — nothing is called) | Empty state, icon `Search`, `חפשו אירוע או אדם`, caption `אפשר לכתוב כמו שמספרים: "רכב סוזוקי שנפגע בינואר", מספר אירוע או לוחית.` |
| Searching | Chip-row skeleton (until the interpretation is known) plus 6 row skeletons (desktop) or 5 card skeletons (mobile). Button `מחפש…`. |
| No results | `לא נמצאו תוצאות`, caption `נסו להסיר אחד מהתנאים למעלה.`, ghost `ניקוי החיפוש`. |
| Cap hit | Caption above that table: `מוצגות 200 התוצאות הראשונות. צמצמו את החיפוש או ייצאו ל־CSV.` |
| Too long (> 300 characters) | Inline field error `החיפוש ארוך מדי. נסו לקצר.` (`--status-alert`, `role="alert"`, field `aria-invalid`). No results area. |
| Unsupported question | Info banner `שאלות כמו "כמה" עדיין לא נתמכות. אפשר לחפש אירועים או אנשים.`, any extracted chips (read-only), ghost `הצגת האירועים המתאימים` (runs the search with intent `find`). |
| AI unavailable or timed out | Direct-lane results plus caption `החיפוש החכם אינו זמין כרגע. מוצגות תוצאות חיפוש טקסט.` |
| Error | Load-error pattern: `החיפוש נכשל. בדקו את החיבור ונסו שוב.` + secondary `רענון`. |
| Export done | Toast `הקובץ יוצא`. Failure: toast `הייצוא נכשל. בדקו את החיבור ונסו שוב.` |

## CSV

`חיפוש-אירועים-YYYY-MM-DD.csv` (events-table columns + `נמצא לפי`, `לוחיות`, `יצרן ודגם`, `כוננים`, `ק״מ`, `פירוט הטיפול`) and `חיפוש-ארכיון-YYYY-MM-DD.csv` (archive-table columns + `פעולות שבוצעו`). Up to 5,000 rows, BOM, Hebrew-safe (`toCsv` / `downloadCsv`). ID numbers never appear.
