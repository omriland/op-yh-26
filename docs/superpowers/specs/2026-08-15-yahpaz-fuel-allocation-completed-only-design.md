# Yahpaz (יחפ״צ) — Fuel allocation counts completed events only — Design

**Date:** 2026-08-15  
**Repo:** `yhpz-2026`  
**Status:** Approved — implement  
**Depends on:** quarterly workbook; event status `done` = all assigned responders finished

## Rule

Quarterly **allocation** includes a participation only when:

- `event_responders.total_km` is not null (`0` counts)
- parent `events.status = done`

Usage/export and דוחות are unchanged (any km-entered participation).

## Copy

| Surface | Extra line |
|---|---|
| Allocate card + workbook | `נספרים רק אירועים שתועדו במלואם.` |
| Usage card + panel | `מוצגים כל האירועים עם ק״מ, גם אם תועדו חלקית.` |
| האירועים שלי (3+ open) | `שימו לב! אירועים שלא תועדו במלואם לא נכללים בהחזר הדלק הרבעוני` |

Notice sits under the existing “יש לך X אירועים לתעד” insight; hidden when open count is 0–2.
