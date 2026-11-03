# Screen — Shift form (משמרת חדשה · עריכת משמרת)

The shift log. One odometer pair per shift; the events born from it (`origin = 'shift'`) are documented once for the whole crew in the shared report `תיעוד אירוע ממשמרת` (`responder-fill.md`). Field theme, same panel and sticky footer as the event form.

## Sections

- **חלק א׳ · פרטי המשמרת:** תאריך · שם משמרת · סוג רכב (`ניידת צפון` · `ניידת מרכז` · `רכב פרטי`) · לוחית when `רכב פרטי`. Only אחמ״ש / מנהל edit these; crew see them disabled.
  - לוחית lists the assigned crew's active vehicles. On an existing shift, the vehicle it was saved with stays listed and selected even if it was archived since; it is never swapped for another crew member's default. Picking a different archived vehicle is refused with `לא ניתן לשייך רכב בארכיון למשמרת. יש לבחור לוחית אחרת.`
- **חלק ב׳ · שיבוץ מתנדבים:** one to three crew (`יש לשבץ בין מתנדב אחד לשלושה`).
- **חלק ג׳ · סיכום אירועים:** a stepper per event type; saving creates that many shift-born events. Under them, per event: מספר אירוע · כביש · מיקום · פירוט הטיפול. These inline rows are drafts of the shared report: editing one marks the form unsaved and goes into the device copy. Saving the shift saves only the rows edited here, and never touches their plates, media or other fields.
- **חלק ד׳ · קילומטרים והערות:** מד אוץ התחלה · מד אוץ סיום · קילומטרים (computed, read-only) · הערות כלליות.

## Who and when

- Create: אחמ״ש / מנהל only.
- Crew edit a shift from its date on. Before it, the form opens to the empty state `ניתן לערוך החל מתאריך המשמרת`. If the date moves ahead while the form is open, saving shows the same sentence — never `מישהו שמר לפניך — רעננו`.

## Saving

- Validation runs only on save. The header line names the gate that failed: a reversed odometer pair → `מד אוץ סיום אינו יכול להיות קטן ממד אוץ התחלה`; crew size → `יש לשבץ בין מתנדב אחד לשלושה`; otherwise `יש למלא תאריך, שם משמרת וסוג רכב לפני השמירה.`
- Server refusals show as sent: `לא ניתן להקטין — קיימים אירועים שמולאו` · `אין הרשאה למחוק אירוע שנוצר על ידי אחמ״ש אחר.` · `אין הרשאה לשנות פרטי משמרת` · the shared-report messages.
- If the shift row saved but a later step failed, the form keeps the new version, so pressing שמירה again retries instead of reporting a stale save.
- `מישהו שמר לפניך — רעננו` appears only when someone else really saved first.

## Device copy

- Written only after an edit (not on open, not on backgrounding an untouched form), with the version it was typed over. Footer caption `נשמר במכשיר …` / `הפרטים נשמרים במכשיר עד לשמירה.`
- On reopen, the device edits are laid over the server copy and its current version, with the banner `שוחזרו פרטים שנשמרו במכשיר ולא נשמרו בשרת. בדקו אותם ולחצו על שמירה.` If someone saved the shift or an inline event since, the banner says so: `… מישהו שמר את המשמרת מאז. בדקו את הפרטים ולחצו על שמירה כדי לשמור את הגרסה שלכם.`
- Leave with unsaved edits → confirm `לצאת מהטופס?` / `יש פרטים שטרם נשמרו. הם נשמרו במכשיר ויחזרו כשתפתחו את הטופס שוב.`

## States

- Load failure: `טעינת המשמרת נכשלה. בדקו את החיבור ונסו שוב.` (form and shift detail). Permission empty states are only for real permission answers.
