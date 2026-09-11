# Per-responder event freeze — design

Date: 2026-09-10
Status: implemented (web + DB). Android port pending.

## Problem

Freeze was stored on the event. One responder with lead-entered `total_km >= 80`
set `events.frozen_over_60km`, and every fuel-refund query filtered on that
event flag. A second responder on the same event with justified kilometers
(20 km, say) was silently dropped from the refund until an admin approved
someone else's exception. The same held for the suspected-duplicate rule and
for the profile lifetime-km snapshot.

Reproduced locally against the replayed freeze migrations: two responders on one
event (92 km and 20 km) yielded **0** refundable kilometers.

## Decisions

1. **The participation is the frozen unit.** `event_responders.frozen_over_60km`
   and `event_responders.frozen_suspicious_duplicate` are the truth for the fuel
   refund, the monthly detail report, the quarterly allocation and the profile
   lifetime stats.

2. **`events.frozen_*` stays, as an aggregate**: "at least one participation on
   this event is frozen". That is what those columns already meant in practice —
   both rules were per-responder underneath (`exists` a responder over the
   threshold; `exists` a same-responder duplicate pair) — so the exceptions
   list, duplicates list, event audit trail and admin display keep working
   without a rewrite.

3. **Approval stays event-scoped.** `approve_event_freeze(event, reason)` keeps
   snapshotting the approved responder ids in
   `events.approved_over_60km_responder_ids`, so an approved volunteer drops off
   while a teammate can remain pending, and a later responder crossing the
   threshold re-freezes only their own row.

4. **Who may see a freeze mark** (`freezeViewFor`):

   | Reader | Sees |
   |---|---|
   | `admin`, `super_admin` | The event, whenever any participation on it is frozen; on event detail, which volunteer it is |
   | `shift_lead` | Nothing |
   | Responder | Only their own frozen participation |

   A reader who is both a lead and the frozen volunteer still sees their own
   record — it is their kilometers being held, not someone else's exception.
   Without the participations in a projection, a non-admin gets nothing rather
   than falling back to the event aggregate, so a narrower select can never leak
   a freeze to a lead.

## Copy (Hebrew)

- Admin, event level: `באירוע קיימת הקפאה בגלל חריגת קילומטרים (מעל 80 ק״מ), הממתינה לאישור מנהל.`
- Admin, one volunteer's record: `הדיווח מוקפא בגלל … וממתין לאישור מנהל.`
- The volunteer themself: `הדיווח שלך מוקפא בגלל … וממתין לאישור מנהל.`
- Compact card line: `מוקפא · חריגת ק״מ · ממתין לאישור מנהל` (`הדיווח שלך מוקפא · …` for own).
- Lead km field hint while typing ≥ 80 stays, reworded to the participation:
  `מעל 80 ק״מ — הדיווח של המתנדב ימתין לאישור מנהל לפני שייכלל בהחזר הדלק.`

## Implementation

- Migration `20260910140000_responder_level_event_freeze.sql`: new
  `event_responders.frozen_*` columns; `refresh_event_freeze` recomputes the
  responder rows set-based and then the event aggregate from them; a guard
  trigger (`event_responders_guard_freeze_columns`) keeps clients out of the
  computed columns; `refresh_profile_lifetime_stats` excludes frozen
  participations rather than frozen events; backfill via `refresh_event_freeze`
  per event.
- `src/lib/eventFreeze.ts`: `FreezeScope`, `freezeViewFor`,
  `participationFreezeView`, `isFreezeAdminRole`,
  `participationCountsTowardFuelRefund` (renamed from
  `eventCountsTowardFuelRefund`).
- `src/lib/freezeViewer.ts`: `useFreezeViewer()` reads roles/user from auth.
- `EventFrozenMark` / `EventFrozenNotice` take `event` (or `participation`) plus
  `viewer`; no viewer means no mark.
- Projections that feed a mark now carry the participation flags: event list and
  detail, cockpit reel, shift-born events, km exceptions.
- `kmExceptionsReport` filters per responder row, falling back to the event flag
  when a projection has no participation flags.

## Deploy compatibility

The client ships before the migration is applied, so nothing may hard-depend on
the new columns: PostgREST fails an entire query when one selected column is
missing, which would take out the events list, cockpit, shifts, event detail and
the fuel and km reports at once.

`src/lib/responderFreezeSchema.ts` probes `event_responders.frozen_over_60km`
once per session. Every select that wants the participation columns writes them
as the `RESPONDER_FREEZE_FIELDS` token — a standalone list item carrying its own
trailing comma — and `withResponderFreeze()` either expands or drops it. Only
`42703` (undefined column) drops the columns; any other probe failure keeps
them, so a transient error cannot silently downgrade a session.

While the columns are missing:

- fuel refund, monthly detail and quarterly allocation fall back to the event
  aggregate through `participationFrozen(participation, event)`, which is
  exactly the behaviour production had before this change — a frozen event holds
  back every responder on it. No refund is paid out that was not paid before.
- admins still see the mark, since it reads the event aggregate.
- a responder does not yet see their own mark, because nothing says which
  participation is frozen.

Applying the migration switches all of it on; open tabs pick it up on reload.

## Out of scope

- Per-responder approval UI (approval remains one action per event/reason).
- Android client display of the same rules (`yahpaz-android`).
