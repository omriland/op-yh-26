# Screen — הקוקפיט (shift-lead inbox)

Live-ops inbox for אחמ״ש. Not a second event model — the existing event form sits in the stage. Public URL: `/cockpit` / `/cockpit/:eventId` (refresh restores the selected event).

## Theme context

- Desktop: **Command** shell (no app sidebar). גלגלת sits on `--surface-page`. The form keeps its **Field paper panel** (`data-theme="field"` on `.event-form__panel`). App bar wordmark is `אבן דרך - הקוקפיט` in `--font-brand`. Nav label is `הקוקפיט`. Every גלגלת row shows a bin as part of the row (active `--accent-subtle` covers the event, bin, and delete hint). Delete is blocked only while responders are allocated (`יש כוננים משובצים. הסירו אותם תחילה.`). After they are removed, two-click delete works (`לחצו שוב למחיקה.`).
- Mobile: same components stacked (גלגלת above stage). Nav item is desktop-sidebar only.

## Layout

Full-bleed in `.shell__main` (no page padding). Desktop: row — גלגלת `calc(var(--sidebar-width) * 1.5)` at inline-start, hairline at inline-end; stage flexes and scrolls. Mobile: column — גלגלת `max-height: 40%`, hairline at block-end.

### גלגלת

- Heading `גלגלת` (`t-section`).
- Primary **אירוע חדש** (plus icon). Loading verb: `יוצר…`.
- Rows: title (police id in `mono`, else `אירוע חדש`); stamp chip + אחמ״ש `שם · או״ק` (`t-caption`, callsign `mono`); event type (`t-body`); `כביש · מיקום` (`t-body` + `--text-secondary`); caption `HH:MM` (Jerusalem clock).
- Current row: `--accent-subtle` + `--accent` ink, `aria-current="true"`.
- Empty: `אין אירועים מהשעתיים האחרונות.`
- Load error: `לא ניתן לטעון את הגלגלת` / `בדקו את החיבור ונסו שוב.` / `נסיון נוסף`.

### Stage

- Selected: event form without Back or sticky Save footer. Caption = autosave pulse. Stage has `50vh` end slack so חלק ב׳ / הקצאת כוננים can scroll up; opening the assigner scrolls that block to the start of the stage.
- None selected, reel has rows: `אין אירוע נבחר` / `לחצו על אירוע חדש או בחרו שורה בגלגלת.`
- No events: centered quiet empty — resting koala with no plate (animated WebP, still PNG if `prefers-reduced-motion`; colors lifted for Command navy) + `אני רואה שהמשמרת שקטה ;)` + `אירוע חדש` (plus icon 30% smaller).
