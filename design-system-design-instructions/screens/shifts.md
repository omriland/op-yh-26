# Screen — Shift form (משמרת חדשה · עריכת משמרת)

The shift log. One odometer pair per shift; the events born from it (`origin = 'shift'`) are documented once for the whole crew in the shared report `תיעוד אירוע ממשמרת` (`responder-fill.md`). Field theme, same panel and sticky footer as the event form.

## Sections

- **חלק א׳ · פרטי המשמרת:** תאריך · שם משמרת · שעת התחלה · שעת סיום · סוג רכב (`ניידת צפון` · `ניידת מרכז` · `רכב פרטי`) · לוחית when `רכב פרטי`. Only אחמ״ש / מנהל edit these; crew see them disabled.
  - שעת התחלה and שעת סיום are 24-hour fields on the Asia/Jerusalem clock. Picking the shift name fills the empty ones (בוקר 07:00–15:00, צהריים 15:00–23:00; other names stay empty) and never replaces a time already typed. An end time earlier than the start means the shift ends after midnight. Crew see them disabled. A new shift needs both (`יש למלא שעת התחלה ושעת סיום`). A legacy shift, opened with no hours, shows no time fields and keeps saving without them.
  - לוחית lists the assigned crew's active vehicles. On an existing shift, the vehicle it was saved with stays listed and selected even if it was archived since; it is never swapped for another crew member's default. Picking a different archived vehicle is refused with `לא ניתן לשייך רכב בארכיון למשמרת. יש לבחור לוחית אחרת.`
- **חלק ב׳ · שיבוץ מתנדבים:** one to three crew (`יש לשבץ בין מתנדב אחד לשלושה`).
- **חלק ג׳ · סיכום אירועים:** shown only on a legacy shift (no hours). A shift with hours hides it entirely: its live events are managed on the shift screen. A stepper per event type; saving creates that many shift-born events. Under them, per event: מספר אירוע · כביש · מיקום · פירוט הטיפול. These inline rows are drafts of the shared report: editing one marks the form unsaved and goes into the device copy. Saving the shift saves only the rows edited here, and never touches their plates, media or other fields.
- **חלק ד׳ · קילומטרים והערות:** מד אוץ התחלה · מד אוץ סיום · קילומטרים (computed, read-only) · הערות כלליות.

## Who and when

- Create: אחמ״ש / מנהל only.
- Crew edit a shift from its date on. Before it, the form opens to the empty state `ניתן לערוך החל מתאריך המשמרת`. If the date moves ahead while the form is open, saving shows the same sentence — never `מישהו שמר לפניך — רעננו`.

## Saving

- Validation runs only on save. The header line names the gate that failed: a reversed odometer pair → `מד אוץ סיום אינו יכול להיות קטן ממד אוץ התחלה`; crew size → `יש לשבץ בין מתנדב אחד לשלושה`; otherwise `יש למלא תאריך, שם משמרת וסוג רכב לפני השמירה.`
- A shift with hours is checked against its crew before saving: a person already on another shift in the same hours refuses the save with `לא ניתן לשבץ את <שם>: כבר משובץ במשמרת <שם משמרת> באותן שעות (<HH:MM–HH:MM>).` The database overlap refusal is shown the same way, naming the other shift when the form knows it.
- Server refusals show as sent: `לא ניתן להקטין — קיימים אירועים שמולאו` · `אין הרשאה למחוק אירוע שנוצר על ידי אחמ״ש אחר.` · `אין הרשאה לשנות פרטי משמרת` · the shared-report messages.
- If the shift row saved but a later step failed, the form keeps the new version, so pressing שמירה again retries instead of reporting a stale save.
- `מישהו שמר לפניך — רעננו` appears only when someone else really saved first.

## Device copy

- Written only after an edit (not on open, not on backgrounding an untouched form), with the version it was typed over. Footer caption `נשמר במכשיר …` / `הפרטים נשמרים במכשיר עד לשמירה.`
- On reopen, the device edits are laid over the server copy and its current version, with the banner `שוחזרו פרטים שנשמרו במכשיר ולא נשמרו בשרת. בדקו אותם ולחצו על שמירה.` If someone saved the shift or an inline event since, the banner says so: `… מישהו שמר את המשמרת מאז. בדקו את הפרטים ולחצו על שמירה כדי לשמור את הגרסה שלכם.`
- Leave with unsaved edits → confirm `לצאת מהטופס?` / `יש פרטים שטרם נשמרו. הם נשמרו במכשיר ויחזרו כשתפתחו את הטופס שוב.`

## States

- Load failure: `טעינת המשמרת נכשלה. בדקו את החיבור ונסו שוב.` (form and shift detail). Permission empty states are only for real permission answers.

## Live shift screen, new-event sheet and on-shift bar

- A shift with hours is a live shift. Its screen lists the shift events and offers `אירוע חדש`. Crew edit events while the shift window is open and for 48 hours after it ends; after that only the shift lead and admins edit. Reopening a done event is offered to crew only inside the window.
- `אירוע חדש` opens a sheet titled `איזה אירוע?` with four large tiles in this order: `תאונה` · `תקוע` · `נטוש` · `הפוך`. Under `סוגים נוספים` the other types follow in the lookup order. The caption `לחיצה פותחת את האירוע ואת הדיווח. פתחת אירוע בטעות? ניתן למחוק אותו כל עוד לא הוזנו בו נתונים` is always shown. Picking a type creates the event and opens its report. A failure shows its message in the sheet.
- Crew may delete a shift event only while the window is open, the event is empty and not done. The shift lead and admins may always delete.
- The on-shift bar sits under the app bar on every page, in the Field theme, with a `למשמרת` button. While the shift runs it reads `במשמרת <שם משמרת> עכשיו · עד HH:MM`. After the end it reads `המשמרת הסתיימה, אפשר להשלים תיעוד · עוד N שעות`, N rounded up. Times are mono. The bar is hidden on that shift's own screen, before the shift starts, once it closes, and on legacy shifts.
- The first load of the session opens the shift screen on its own only while the shift is running, never in the finishing period, never on later navigation, never for legacy shifts.
