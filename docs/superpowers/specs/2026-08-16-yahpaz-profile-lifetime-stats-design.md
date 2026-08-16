# Yahpaz (יחפ״צ) — Profile lifetime stats (סיכום פעילות) — Design

**Date:** 2026-08-16  
**Repo:** `yhpz-2026`  
**Status:** Approved in brainstorming (Approach 1: columns on `profiles` + SQL refresh + `pg_cron`)  
**Depends on:** Fuel refund km rule (`2026-08-10-yahpaz-fuel-refund-report-design.md`), רשומה (`design-system-design-instructions/`)

## Problem

Volunteers should see two all-time numbers on their own profile: how many events they treated, and how many kilometers they drove. Computing that on every profile visit is unnecessary; a twice-daily snapshot is enough.

## Goals (v1)

- Two lifetime figures on **פרופיל** (own profile only)
- Same inclusion rules as **החזר דלק**
- Snapshot columns on `profiles`, refreshed by SQL — not calculated in the client
- `pg_cron` at **07:00 and 19:00 Asia/Jerusalem**
- Quiet freshness caption (`היום` / `אתמול`)
- Hebrew-only RTL, רשומה
- Migration backfill so the card is not empty until the first cron

## Non-goals (v1)

- Live recalculation on profile open
- Shift km or odometer fields
- Admin “view their stats” surface or a report of these totals
- Per-year / period breakdown
- In-app “refresh now”
- Email / Slack from the job
- Separate stats table or Edge Function cron

## Product rule (km + events)

**Canonical km:** `event_responders.total_km` (lead-entered). Never `odometer_start` / `odometer_end`. Never shift `total_km`.

| Metric | Rule |
|---|---|
| אירועים שטופלו | Count of that user’s `event_responders` rows where `total_km IS NOT NULL` (`0` counts as entered) |
| קילומטרים | `sum(total_km)` over those same rows |

No filter on event `status`, participation `status`, or `is_cancelled`. Unique `(event_id, responder_id)` already guarantees one row per event per user.

Idle users (no included participations): `0` / `0`.

## Schema

Three columns on `public.profiles`:

| Column | Type | Default |
|---|---|---|
| `lifetime_event_count` | `integer not null` | `0` |
| `lifetime_km` | `numeric not null` | `0` |
| `lifetime_stats_updated_at` | `timestamptz` | `null` |

New users get `0` / `0` / `null` until the next refresh.

### Refresh function

`public.refresh_profile_lifetime_stats()` — `security definer`, `search_path = public`.

- One `UPDATE … FROM` (or equivalent set-based write) over **all** profiles, active and inactive.
- Users with no matching participations stay `0` / `0`.
- Sets `lifetime_stats_updated_at = now()` on every row it writes.
- Writes **only** those three columns. Does not bump `profiles.updated_at`.
- Sets a session GUC (e.g. `yahpaz.refreshing_lifetime_stats = '1'`) so the protect trigger allows the write.

The migration **calls the function once** after creating it.

### Write protection

`BEFORE UPDATE` trigger on `profiles` restores the three columns from `OLD` unless the refresh GUC is set. Admin user save, password-setup, and any other client `profiles` update cannot change the snapshot.

Clients never send these columns. Auth / admin update payloads omit them.

### RLS

Unchanged. Own-profile `SELECT` already returns the new columns. No client `UPDATE` path for them.

## Job

Enable `pg_cron` if not already. Schedule:

| | |
|---|---|
| Name | `refresh-profile-lifetime-stats` |
| Cron | `0 7,19 * * *` |
| Timezone | `Asia/Jerusalem` (not UTC) |
| Command | `SELECT public.refresh_profile_lifetime_stats()` |

A missed run leaves the last snapshot in place. No toast, no retry UI. The caption shows the lag (see below).

## Profile UI

New card on `ProfilePage`, **between** the identity card and **רכבים**. Own profile only.

| Element | Spec |
|---|---|
| Heading | `סיכום פעילות` — `--type-section`, same form-section rule as רכבים |
| Layout | Two equal columns, including mobile; hairline between cells |
| Labels | `--type-label` / `--text-secondary`: `אירועים שטופלו` · `קילומטרים` |
| Values | `--type-numeric-lg` (Plex Mono) + existing `formatNumber` (`he-IL`) |
| Interaction | Not tappable |
| Zero | Show `0` / `0` — this is the record, not an empty state |
| Loading | Stats ride on the profile row already fetched for the page; no extra spinner |
| Tokens | Existing רשומה only. No new colors, radii, or type sizes. No gradients |

### Freshness caption

Under the pair: `--type-caption` / `--text-muted`. Clock is 24h, Asia/Jerusalem calendar days.

| `lifetime_stats_updated_at` | Copy |
|---|---|
| Same local day | `עודכן היום ב־07:00` |
| Previous local day | `עודכן אתמול ב־19:00` |
| Older (cron missed) | `עודכן ב־14.08.2026, 19:00` (`formatDateTime`, maqaf after `ב`) |
| `null` | Hide the caption |

Time in the relative lines is the local `HH:mm` of `updated_at` (expected `07:00` or `19:00`).

## Architecture

### New / touched files

| File | Role |
|---|---|
| `supabase/migrations/YYYYMMDDHHMMSS_profile_lifetime_stats.sql` | Columns, function, trigger, cron, backfill |
| `src/lib/profileLifetimeStats.ts` | Pure caption helper |
| `src/lib/profileLifetimeStats.test.ts` | `היום` / `אתמול` / absolute / null |
| `src/lib/auth.tsx` | Add the three fields to `Profile` + select list |
| `src/pages/ProfilePage.tsx` | Card |
| `design-system-design-instructions/screens/profile.md` | Screen blueprint (identity, this card, vehicles, logout) |

No Edge Function. No Netlify Function. No second client query.

### Data flow

1. Cron (or migration) runs `refresh_profile_lifetime_stats()`.
2. User opens פרופיל. Auth profile already includes the three columns.
3. Page renders the card from that row. Caption from `formatLifetimeStatsUpdatedAt(updated_at, now)`.

## Testing

- Unit: caption — same Jerusalem day → `היום`; previous day → `אתמול`; older → absolute `formatDateTime`; `null` → `null`. Crossing midnight Jerusalem (not UTC) is an explicit case.
- Manual: profile shows two numbers after migration backfill; a profile save does not zero them; numbers match החזר דלק all-time for the same user (full date range, same inclusion).

SQL aggregation is the source of truth. Do not reimplement the sum in TypeScript.

## Error handling

- Profile load failure: existing profile skeleton / empty — no special stats error.
- Cron failure: last snapshot + absolute caption. Ops-only (Supabase cron history).

## Design-system

Add `design-system-design-instructions/screens/profile.md` so פרופיל is specified like the other screens. Field on mobile; Command chrome on desktop follows the existing shell. This card is documented there (heading, two-up, caption, zeros).

## Open follow-ups (explicitly later)

- Admin report of lifetime totals
- Optional inclusion of shift km (needs a product rule for attributing vehicle km to people)
- “Refresh now” for admins
