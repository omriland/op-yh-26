# Screen — הקוקפיט (shift-lead inbox)

Live-ops inbox for אחמ״ש. Not a second event model — the existing event form sits in the stage. Public URL: `/cockpit` / `/cockpit/:eventId` (refresh restores the selected event). The reel is a **יומן משמרת** (dispatch log / time tape), not a second events list.

## Theme context

- Desktop: **Command** app bar (no app sidebar). Content is **Field** — יומן sits on `--surface-page` paper. The form keeps its **Field paper panel** (`data-theme="field"` on `.event-form__panel`). App bar wordmark is `אבן דרך - הקוקפיט` in `--font-brand`. Nav label is `הקוקפיט`. Every row shows a bin as part of the row (active `--accent-subtle` covers the event, bin, and delete hint). Delete is blocked only while responders are allocated (`יש כוננים משובצים. הסירו אותם תחילה.`). After they are removed, two-click delete works (`לחצו שוב למחיקה.`).
- Mobile: same components stacked (יומן above stage). Nav item is desktop-sidebar only.

## Layout

Full-bleed in `.shell__main` (no page padding). Desktop: row — יומן `calc(var(--sidebar-width) * 1.5)` at inline-start, hairline at inline-end; stage flexes and scrolls. Mobile: column — יומן `max-height: 40%`, hairline at block-end.

### יומן משמרת

- No `גלגלת` heading. Head: Jerusalem clock (`--type-numeric-lg`, `aria-label="שעון ירושלים"`) + caption `N בחלון` + primary **אירוע חדש** (plus icon). Loading verb: `יוצר…`. `aria-label` on the aside is `יומן משמרת`.
- Rows (scan, not cards): police id as hero (`--type-numeric-lg`); if none, `אירוע חדש` in `--text-muted` (`--type-body-strong`, never mono). One line `סוג · כביש · מיקום` (`--type-body`, `--text-secondary`, ellipsis). Stamp chip + אחמ״ש `שם · או״ק` (`t-caption`, callsign `mono`). Age on a dotted ledger leader: `עכשיו` / `לפני דקה` / `לפני N דק׳`.
- Current row: `--accent-subtle` + `--accent` ink, 2px accent bar at inline-start (same recipe as sidebar), `aria-current="true"`. Desktop: 2px accent at inline-end that meets the stage hairline (open-folder cue).
- Empty: `אין אירועים מהשעתיים האחרונות.`
- Load error: `לא ניתן לטעון את הגלגלת` / `בדקו את החיבור ונסו שוב.` / `נסיון נוסף`.
- Keyboard (ignored while typing in a field / combobox, and with ⌘/Ctrl/Alt): `N` (physical KeyN) creates; `↑`/`↓` move in the log; `Backspace`/`Delete` arms or confirms delete on the current row. `Escape` closes the map drawer when it is open (and the user is not typing).

### מפה (drawer)

Tab `מפה` on the visual left edge (`inset-inline-end`, Command). Opens a sheet over the stage: search + `כוננים קרובים` (same 30 km Places logic as the unit map) + interactive map. Pins: active-user addresses (hide `מנהלה` / `חניכה בסיסית` / `משמרות בלבד`); disc color by volunteer status without hover — `מתנדב פעיל` and `חניכה ברכב פרטי` `--text-on-accent` fill + `--stroke-strong` ring; `חניכה טלפונית` `--status-done-tint` fill + `--status-done` ring/caption/tooltip; hover tooltip flush under the caption, solid `--surface-raised` + `--accent` border (phone-training tooltip `--status-done`). Effective לא זמין stays visible with `--status-draft` disc + inactive grey caption (`color-mix` 28% `--status-draft` on `--text-on-accent`, caption text `--status-draft`); hover `לא זמין` or `לא זמין עד DD.MM.YYYY` (tooltip border `--status-draft`). Open גלגלת events (`--status-alert`, label = `סוג · מספר כביש מיקום`, e.g. `תאונה · 4 שורק`). Hide an event when every assigned responder has `ended_at`. Events with stored coords use those as a fallback; open גלגלת events are geocoded from current כביש + מיקום via Places (`כביש {number} {location}`), except when `location_pin_source` is `shift_lead` or `responder` (human-corrected pin — Google must not move it). Event pins are draggable; drop saves the canonical pin without editing כביש or מיקום. Tap an event pin to select that row. **Live responder pins** (same as unit מפה): `--status-done` disc `--space-6` with Lucide car icon (`--text-on-accent`, `--space-4`), `{או״ק || שם} · בדרך`, tooltip `{סוג · כביש מיקום} · HH:MM` (border `--status-done`); not a hit target; not in `כוננים קרובים`. Pin gone when tracking stops or last ping is older than 30s. Same pin-color key as unit מפה. Tapping a cluster zooms to at least 11 so addresses uncluster. Close via header or Escape.

### Stage

- Selected: event form without Back or sticky Save footer. Caption = autosave pulse. Stage has `50vh` end slack so חלק ב׳ / הקצאת כוננים can scroll up; opening the assigner scrolls that block to the start of the stage.
- None selected, reel has rows: `אין אירוע נבחר` / `לחצו על אירוע חדש או בחרו שורה בגלגלת.`
- No events: centered quiet empty — resting koala with no plate (animated WebP, still PNG if `prefers-reduced-motion`) + `אני רואה שהמשמרת שקטה ;)` + `אירוע חדש` (plus icon 30% smaller).

### היכרות (פעם ראשונה)

On first visit per user (`localStorage` `yahpaz:cockpit_intro_seen:{userId}`): standard Dialog / bottom sheet. Title `מאחמ״שים? במשמרת האזנה?`. Lead `סידרנו לכם את סביבת האחמ״ש הכי נוחה שיש!`. Three orientation rows with the cockpit icons: גלגלת בצד ימין / אירועים פתוחים / מפה בשמאל. Primary `הבנתי`. Button, X, backdrop, or Escape all dismiss and mark seen. Cockpit shortcuts are ignored while the dialog is open.
