# Yahpaz — Overdue responder fill (48h / 7d)

**Date:** 2026-08-18  
**Repo:** `yhpz-2026` / `op-yh-26`  
**Status:** Approved in brainstorming (Approach 1: `fill_completable_at` trigger + `pg_cron` → Edge)  
**Depends on:** fill-ready email + fill token (`2026-08-12-yahpaz-generic-email-and-fill-link-design.md`), רשומה

## Problem

After אחמ״ש enters קילומטרים, a responder can complete their report. If they do not, the open inbox card should turn red after 48 hours, and they should get two reminder emails (48 hours, then 7 days) with a direct fill link.

## Goals (v1)

- Web **האירועים שלי** · ממתינים לתיעוד only: overdue open cards get a `--status-alert` rail + tint
- Clock starts when the report becomes completable (`total_km` first non-null)
- Emails at 48 hours and 7 days after that clock, then stop
- Same scoped fill-token link as fill-ready
- Hebrew-only RTL, רשומה tokens

## Non-goals (v1)

- iOS / Android (explicit: web only until asked)
- Unit events list, event detail, or אחמ״ש overdue views
- Stamp label / tone change (`ממתין למילוי פרטים` / `טיוטה נשמרה` stay)
- Repeating mail after the 7-day send
- Restarting the clock on later km edits
- User email preferences / opt-out

## Locked decisions

| Topic | Choice |
|---|---|
| Clock start | First time `event_responders.total_km` becomes non-null |
| Surfaces | Web mine inbox pending cards only |
| Overdue look | 3px `--status-alert` rail + `--status-alert-tint` wash; replaces blue origin rail; Hourglass inline-start of the event type; hover tip on the same tint, copy `אירוע ממתין לתיעוד מעל ל־48 שעות` |
| Stamp | Unchanged |
| Mail 1 | ≥ 48 elapsed hours, once |
| Mail 2 | ≥ 7 elapsed days, once, only if still open |
| Both due in one run | Send 48h copy first; 7d on a later run |
| Cancelled / inactive / done | No red (done/cancel leave the tab or fail the predicate); no mail |
| Native apps | Untouched |

## Clock and schema

`event_responders`:

| Column | Type | Rule |
|---|---|---|
| `fill_completable_at` | timestamptz | Trigger stamps `now()` the first time `total_km` goes null → non-null. Sticky. |
| `overdue_48h_emailed_at` | timestamptz | Set only after successful 48h send |
| `overdue_7d_emailed_at` | timestamptz | Set only after successful 7d send |

Clients cannot write the three columns. Service role may set the two email markers. The trigger may set `fill_completable_at` on first km.

**Red predicate (client):** own participation not `done`, event not cancelled, `fill_completable_at` set, `now >= fill_completable_at + 48 hours`.

Shift-born overdue cards also get the red rail (they have no blue origin rail).

**Backfill:** `fill_completable_at = coalesce(fill_ready_emailed_at, now())` where `total_km is not null` and the stamp is still null.

## Mailer

Hourly `pg_cron` (minute 15, DST-safe hourly family) calls `public.invoke_notify_overdue_fills()`, which `pg_net` POSTs to Edge `responder-fill` action `notify_overdue_fills` with the service-role key from Vault (`yahpaz_service_role_key`). Service role only.

Skip: `done`, cancelled event, inactive profile, missing email, no `fill_completable_at`.

Reuse/mint the existing 7-day fill token. Resend idempotency: `overdue-48h/<assignment-id>`, `overdue-7d/<assignment-id>`.

### Copy (locked)

Subject (both): `חריגת זמנים בתיעוד אירוע - אבן דרך`

```
היי, {שם}
יש לך אירוע שממתין לתיעוד מעל ל־{48 שעות | 7 ימים}
אפשר ללחוץ כאן כדי להשלים את התיעוד
שימו לב! אירוע שלא יתועד במלואו לא יחושב להחזר הדלק הרבעוני
```

CTA button label: `להשלמת התיעוד`. `כאן` is the fill-token link. Optional context line (date · type · road) under the waiting line, same as fill-ready.

## Error handling

- Resend failure: do not stamp the send marker; retry next hour
- Missing Vault secret: cron logs a warning and no-ops
- Expired fill token: re-mint before send (same as fill-ready)

## Testing

- Predicate: 47h59 not overdue, 48h overdue; cancelled/done/null stamp not overdue
- Mail kind: both-due → 48h first
- EventCard: overdue class replaces `--manual`; shift-born overdue still red
- Copy strings match the locked Hebrew
