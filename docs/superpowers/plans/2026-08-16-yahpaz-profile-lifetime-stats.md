# Profile Lifetime Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show two all-time snapshot numbers on פרופיל (events treated + km) from columns on `profiles`, refreshed twice a day in SQL.

**Architecture:** `refresh_profile_lifetime_stats()` recomputes every profile from `event_responders.total_km IS NOT NULL` (same rule as החזר דלק; no odometers, no shift km). `pg_cron` at 07:00 and 19:00 Asia/Jerusalem. A BEFORE UPDATE trigger blocks client writes. The profile page reads the three columns already on the auth profile row.

**Tech Stack:** Vite + React + TypeScript, Supabase Postgres (`pg_cron`), Vitest, רשומה tokens.

## Global Constraints

- Hebrew-only UI, full RTL; EN identifiers in code/DB
- רשומה; no invented tokens; CSS logical properties only (`left`/`right` forbidden in layout CSS)
- Official km is `event_responders.total_km` only — never odometers, never shift km
- Inclusion: `total_km IS NOT NULL` (0 counts); any event/participation status; cancelled included
- Cron timezone is `Asia/Jerusalem`, not UTC
- Refresh writes only the three lifetime columns — does not bump `profiles.updated_at`
- No Edge Function, no Netlify Function, no on-the-fly client sum
- Spec: `docs/superpowers/specs/2026-08-16-yahpaz-profile-lifetime-stats-design.md`
- Do not kill/restart the user's Vite server

---

## File map

| File | Responsibility |
|---|---|
| `src/lib/profileLifetimeStats.ts` | Pure caption helper (Jerusalem calendar) |
| `src/lib/profileLifetimeStats.test.ts` | `היום` / `אתמול` / absolute / null / midnight cross |
| `supabase/migrations/20260816180000_profile_lifetime_stats.sql` | Columns, function, trigger, cron, backfill |
| `src/lib/auth.tsx` | Three fields on `Profile` + select + numeric coerce |
| `src/pages/ProfilePage.tsx` | `סיכום פעילות` card |
| `src/styles/components.css` | `.profile-stats` two-up |
| `design-system-design-instructions/screens/profile.md` | Screen blueprint |
| `.cursor/memory/MEMORY.md` | Record snapshot + cron |

---

### Task 1: Freshness caption helper

**Files:**
- Create: `src/lib/profileLifetimeStats.test.ts`
- Create: `src/lib/profileLifetimeStats.ts`

**Interfaces:**
- Consumes: nothing from later tasks
- Produces: `formatLifetimeStatsUpdatedAt(updatedAt: string | null, now?: Date): string | null`

Format **all** clock/calendar parts in `Asia/Jerusalem` (do not call `formatDateTime` — that helper is browser-local and fails in UTC CI).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/profileLifetimeStats.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { formatLifetimeStatsUpdatedAt } from './profileLifetimeStats'

describe('formatLifetimeStatsUpdatedAt', () => {
  it('returns null when never refreshed', () => {
    expect(formatLifetimeStatsUpdatedAt(null, new Date('2026-08-16T10:00:00.000Z'))).toBeNull()
  })

  it('uses היום for the same Jerusalem calendar day', () => {
    // 07:00 IDT = 04:00 UTC; now is 13:00 IDT
    expect(
      formatLifetimeStatsUpdatedAt(
        '2026-08-16T04:00:00.000Z',
        new Date('2026-08-16T10:00:00.000Z'),
      ),
    ).toBe('עודכן היום ב־07:00')
  })

  it('uses אתמול for the previous Jerusalem calendar day', () => {
    // 19:00 IDT 15 Aug = 16:00 UTC
    expect(
      formatLifetimeStatsUpdatedAt(
        '2026-08-15T16:00:00.000Z',
        new Date('2026-08-16T10:00:00.000Z'),
      ),
    ).toBe('עודכן אתמול ב־19:00')
  })

  it('uses אתמול when now has crossed Jerusalem midnight but UTC has not', () => {
    // now 00:30 IDT 17 Aug = 21:30 UTC 16 Aug
    // updated 19:00 IDT 16 Aug = 16:00 UTC 16 Aug
    expect(
      formatLifetimeStatsUpdatedAt(
        '2026-08-16T16:00:00.000Z',
        new Date('2026-08-16T21:30:00.000Z'),
      ),
    ).toBe('עודכן אתמול ב־19:00')
  })

  it('uses an absolute Jerusalem timestamp when older than yesterday', () => {
    expect(
      formatLifetimeStatsUpdatedAt(
        '2026-08-14T16:00:00.000Z',
        new Date('2026-08-16T10:00:00.000Z'),
      ),
    ).toBe('עודכן ב־14.08.2026, 19:00')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/profileLifetimeStats.test.ts`

Expected: FAIL — `Cannot find module './profileLifetimeStats'`

- [ ] **Step 3: Write the helper**

Create `src/lib/profileLifetimeStats.ts`:

```ts
const JERUSALEM = 'Asia/Jerusalem'

function jerusalemYmd(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: JERUSALEM }).format(date)
}

function jerusalemHm(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: JERUSALEM,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function addUtcDays(ymd: string, days: number): string {
  const [year, month, day] = ymd.split('-').map(Number)
  const utc = new Date(Date.UTC(year!, month! - 1, day!))
  utc.setUTCDate(utc.getUTCDate() + days)
  return utc.toISOString().slice(0, 10)
}

function jerusalemDateTime(date: Date): string {
  const raw = new Intl.DateTimeFormat('he-IL', {
    timeZone: JERUSALEM,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
  return raw.replace(/\//g, '.')
}

/** Quiet freshness line for סיכום פעילות. Calendar + clock are Asia/Jerusalem. */
export function formatLifetimeStatsUpdatedAt(
  updatedAt: string | null,
  now: Date = new Date(),
): string | null {
  if (!updatedAt) return null
  const updated = new Date(updatedAt)
  if (Number.isNaN(updated.getTime())) return null

  const today = jerusalemYmd(now)
  const then = jerusalemYmd(updated)
  const time = jerusalemHm(updated)

  if (then === today) return `עודכן היום ב־${time}`
  if (then === addUtcDays(today, -1)) return `עודכן אתמול ב־${time}`
  return `עודכן ב־${jerusalemDateTime(updated)}`
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/profileLifetimeStats.test.ts`

Expected: PASS (5 tests)

If the absolute line fails because `he-IL` inserts extra RTL marks or a different separator, adjust `jerusalemDateTime` until the string is exactly `14.08.2026, 19:00` (digits + period date + comma + space + 24h time). Do not weaken the test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/profileLifetimeStats.ts src/lib/profileLifetimeStats.test.ts
git commit -m "$(cat <<'EOF'
Add Jerusalem-aware caption helper for profile lifetime stats.

EOF
)"
```

---

### Task 2: Snapshot columns, refresh function, protect trigger, cron

**Files:**
- Create: `supabase/migrations/20260816180000_profile_lifetime_stats.sql`

**Interfaces:**
- Consumes: `event_responders.total_km`, `profiles.id`
- Produces: `profiles.lifetime_event_count` (`int`), `profiles.lifetime_km` (`numeric`), `profiles.lifetime_stats_updated_at` (`timestamptz`)
- Produces: `public.refresh_profile_lifetime_stats()` → `void`
- Produces: cron job `refresh-profile-lifetime-stats` at `0 7,19 * * *` / `Asia/Jerusalem`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260816180000_profile_lifetime_stats.sql` with this exact SQL:

```sql
create extension if not exists pg_cron;

alter table public.profiles
  add column if not exists lifetime_event_count integer not null default 0,
  add column if not exists lifetime_km numeric not null default 0,
  add column if not exists lifetime_stats_updated_at timestamptz;

create or replace function public.protect_profile_lifetime_stats()
returns trigger
language plpgsql
as $$
begin
  if current_setting('yahpaz.refreshing_lifetime_stats', true) = '1' then
    return new;
  end if;
  new.lifetime_event_count := old.lifetime_event_count;
  new.lifetime_km := old.lifetime_km;
  new.lifetime_stats_updated_at := old.lifetime_stats_updated_at;
  return new;
end;
$$;

drop trigger if exists protect_profile_lifetime_stats on public.profiles;
create trigger protect_profile_lifetime_stats
  before update on public.profiles
  for each row
  execute function public.protect_profile_lifetime_stats();

create or replace function public.refresh_profile_lifetime_stats()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('yahpaz.refreshing_lifetime_stats', '1', true);

  update public.profiles as p
  set
    lifetime_event_count = s.event_count,
    lifetime_km = s.total_km,
    lifetime_stats_updated_at = now()
  from (
    select
      pr.id as profile_id,
      count(er.id)::integer as event_count,
      coalesce(sum(er.total_km), 0) as total_km
    from public.profiles as pr
    left join public.event_responders as er
      on er.responder_id = pr.id
      and er.total_km is not null
    group by pr.id
  ) as s
  where p.id = s.profile_id;
end;
$$;

revoke all on function public.refresh_profile_lifetime_stats() from public, anon, authenticated;
grant execute on function public.refresh_profile_lifetime_stats() to postgres, service_role;

select public.refresh_profile_lifetime_stats();

do $$
begin
  perform cron.unschedule('refresh-profile-lifetime-stats');
exception
  when others then null;
end;
$$;

select cron.schedule(
  job_name := 'refresh-profile-lifetime-stats',
  schedule := '0 7,19 * * *',
  command := 'select public.refresh_profile_lifetime_stats()',
  timezone := 'Asia/Jerusalem'
);
```

If `cron.schedule` rejects the `timezone` named arg on this project, stop and check `cron.job` columns with SQL. Prefer `update cron.job set timezone = 'Asia/Jerusalem' where jobname = 'refresh-profile-lifetime-stats'` after a 3-arg `cron.schedule`. Do **not** silently schedule in UTC.

- [ ] **Step 2: Apply the migration to the remote project**

Use Supabase MCP `apply_migration` on project `yahpaz-2026` (ref `rtvizpsfvtjowbimugns`) with name `profile_lifetime_stats` and the file contents. Also keep the file in `supabase/migrations/` so the repo matches production.

If MCP apply is unavailable, use the documented Supabase CLI path the project already uses — do not invent a dashboard workaround.

- [ ] **Step 3: Verify columns, backfill, cron, and write protection**

Via Supabase MCP `execute_sql` (or equivalent), run:

```sql
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'profiles'
  and column_name in ('lifetime_event_count', 'lifetime_km', 'lifetime_stats_updated_at')
order by column_name;
```

Expected: three rows.

```sql
select
  count(*) as profiles,
  count(lifetime_stats_updated_at) as stamped,
  min(lifetime_event_count) as min_events,
  max(lifetime_event_count) as max_events
from public.profiles;
```

Expected: `stamped = profiles` (backfill ran). `min_events >= 0`.

```sql
select jobname, schedule, command, timezone
from cron.job
where jobname = 'refresh-profile-lifetime-stats';
```

Expected: one row, schedule `0 7,19 * * *`, timezone `Asia/Jerusalem`.

Write-protect check (pick any real profile id from the previous query's project; do not invent):

```sql
update public.profiles
set lifetime_event_count = lifetime_event_count + 1000
where id = '<real-profile-id>'
returning lifetime_event_count;
```

Expected: returned count is the **old** value (trigger restored it). Then:

```sql
select public.refresh_profile_lifetime_stats();
```

Expected: succeeds; that profile's count is back to the real aggregate (not +1000).

Spot-check one user against החזר דלק math:

```sql
select
  p.id,
  p.lifetime_event_count,
  p.lifetime_km,
  (
    select count(*)
    from public.event_responders er
    where er.responder_id = p.id
      and er.total_km is not null
  ) as live_events,
  (
    select coalesce(sum(er.total_km), 0)
    from public.event_responders er
    where er.responder_id = p.id
      and er.total_km is not null
  ) as live_km
from public.profiles p
where p.lifetime_event_count > 0
limit 5;
```

Expected: `lifetime_*` equals `live_*` on every row.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260816180000_profile_lifetime_stats.sql
git commit -m "$(cat <<'EOF'
Add profile lifetime stats columns and a twice-daily refresh.

EOF
)"
```

---

### Task 3: Load snapshot fields on the auth profile

**Files:**
- Modify: `src/lib/auth.tsx`

**Interfaces:**
- Consumes: the three `profiles` columns from Task 2
- Produces: `Profile.lifetime_event_count: number`, `Profile.lifetime_km: number`, `Profile.lifetime_stats_updated_at: string | null`

PostgREST may return `numeric` as a string. Coerce both numbers.

- [ ] **Step 1: Extend `Profile` and the select list**

In `src/lib/auth.tsx`, change the `Profile` type to:

```ts
export type Profile = {
  id: string
  full_name: string
  email: string
  callsign: string
  phone: string | null
  active: boolean
  must_change_password: boolean
  otp_login_enabled: boolean
  otp_users_page_enabled: boolean
  lifetime_event_count: number
  lifetime_km: number
  lifetime_stats_updated_at: string | null
}
```

Change the select string in `loadProfileAndRoles` to:

```ts
'id, full_name, email, callsign, phone, active, must_change_password, otp_login_enabled, otp_users_page_enabled, lifetime_event_count, lifetime_km, lifetime_stats_updated_at',
```

Change the mapped profile object to coerce the new fields:

```ts
profile: row
  ? {
      ...row,
      otp_login_enabled: Boolean(row.otp_login_enabled),
      otp_users_page_enabled: Boolean(row.otp_users_page_enabled),
      lifetime_event_count: Number(row.lifetime_event_count ?? 0),
      lifetime_km: Number(row.lifetime_km ?? 0),
      lifetime_stats_updated_at:
        typeof row.lifetime_stats_updated_at === 'string'
          ? row.lifetime_stats_updated_at
          : null,
    }
  : null,
```

Do not add these fields to any `profiles.update` payload (`adminUsers.ts`, password-setup, etc.). The trigger is the backstop; omit them anyway.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`

Expected: exit 0. If something constructs a `Profile` literal, add `lifetime_event_count: 0`, `lifetime_km: 0`, `lifetime_stats_updated_at: null`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth.tsx
git commit -m "$(cat <<'EOF'
Load lifetime stats on the auth profile row.

EOF
)"
```

---

### Task 4: סיכום פעילות card on פרופיל

**Files:**
- Modify: `src/pages/ProfilePage.tsx`
- Modify: `src/styles/components.css` (append at end of file)
- Create: `design-system-design-instructions/screens/profile.md`

**Interfaces:**
- Consumes: `Profile.lifetime_event_count`, `Profile.lifetime_km`, `Profile.lifetime_stats_updated_at`
- Consumes: `formatLifetimeStatsUpdatedAt` from Task 1
- Consumes: `formatNumber` from `src/lib/format.ts`
- Produces: profile card between identity and רכבים

- [ ] **Step 1: Add CSS**

Append to `src/styles/components.css`:

```css
/* ============================================================
   Profile lifetime stats
   ============================================================ */

.profile-stats {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
}

.profile-stats__cell {
  padding-block: var(--space-2);
  padding-inline: var(--space-4);
}

.profile-stats__cell + .profile-stats__cell {
  border-inline-start: 1px solid var(--stroke-hairline);
}

.profile-stats__value {
  display: block;
  margin-block-start: var(--space-2);
}

.profile-stats__caption {
  margin-block-start: var(--space-4);
}
```

No `left`/`right`. No new colors or type sizes. Values use existing `.t-num-lg`.

- [ ] **Step 2: Render the card**

In `src/pages/ProfilePage.tsx`:

1. Import `formatNumber` from `../lib/format` (keep existing `formatPhone` / `monoClass` imports).
2. Import `formatLifetimeStatsUpdatedAt` from `../lib/profileLifetimeStats`.
3. Insert this section **between** the identity `</section>` and the רכבים `<section className="card">`:

```tsx
        <section className="card">
          <div className="form-section">
            <h2 className="form-section__heading">סיכום פעילות</h2>
          </div>
          <div className="profile-stats" style={{ marginBlockStart: 'var(--space-4)' }}>
            <div className="profile-stats__cell">
              <p className="t-label text-secondary">אירועים שטופלו</p>
              <span className="profile-stats__value t-num-lg">
                {formatNumber(profile.lifetime_event_count)}
              </span>
            </div>
            <div className="profile-stats__cell">
              <p className="t-label text-secondary">קילומטרים</p>
              <span className="profile-stats__value t-num-lg">
                {formatNumber(profile.lifetime_km)}
              </span>
            </div>
          </div>
          {formatLifetimeStatsUpdatedAt(profile.lifetime_stats_updated_at) ? (
            <p className="profile-stats__caption t-caption text-muted">
              {formatLifetimeStatsUpdatedAt(profile.lifetime_stats_updated_at)}
            </p>
          ) : null}
        </section>
```

Call the helper once (assign to a const above the return) so the caption is not formatted twice:

```ts
  const statsUpdated = formatLifetimeStatsUpdatedAt(profile.lifetime_stats_updated_at)
```

Then `{statsUpdated ? <p className="profile-stats__caption t-caption text-muted">{statsUpdated}</p> : null}`.

Zeros stay visible. Card is not a button. No extra fetch.

- [ ] **Step 3: Write the screen blueprint**

Create `design-system-design-instructions/screens/profile.md`:

```md
# Screen — Profile (פרופיל)

Own-account registry card. Not a management surface. Field on mobile; desktop follows the host shell (Command chrome + Field content, same as other logged-in lists).

## Entry

App-bar avatar menu → `פרופיל`. Not a bottom-tab item.

## Layout

One `--type-title`: `פרופיל`. Then a `stack-4` of cards (`margin-block-start: --space-10`).

1. **Identity** — avatar `lg`, `full_name` (`--type-section`), `או״ק` + callsign (mono unless Hebrew). Ledger: `דוא״ל` (LTR isolate) · `טלפון` (numeric). Role chips: `מנהל` / `אחמ״ש` / `כונן` only — never `super_admin`. Empty roles: `—`.
2. **סיכום פעילות** — form-section heading. Two equal columns (mobile included), hairline between cells. Labels `--type-label` / `--text-secondary`: `אירועים שטופלו` · `קילומטרים`. Values `--type-numeric-lg` (`.t-num-lg`) via `formatNumber`. Not tappable. Zeros stay (`0` / `0`). Caption `--type-caption` / `--text-muted`: `עודכן היום ב־HH:mm` / `עודכן אתמול ב־HH:mm` / `עודכן ב־DD.MM.YYYY, HH:mm`. Hide caption when `lifetime_stats_updated_at` is null. Snapshot columns only — no live aggregate.
3. **רכבים** — form-section heading. Ledger of model + plate. Archived: `{model} (בארכיון)`. Empty: `לא רשומים רכבים. פנו למנהל המערכת להוספת רכב.`
4. **התנתקות** — secondary block button + LogOut (mirrored).

## States

- Profile missing: title + card skeletons (`aria-busy`, `טוען פרופיל`).
- Vehicles loading: one skeleton row in the vehicles card.
- Stats ride on the profile row — no separate spinner or error.
```

- [ ] **Step 4: Typecheck + caption tests still pass**

Run: `npx tsc --noEmit && npx vitest run src/lib/profileLifetimeStats.test.ts`

Expected: exit 0; 5 tests PASS.

Manual (localhost:5173, do not restart Vite): open פרופיל. Confirm two numbers, caption `עודכן היום ב־…` after the migration backfill, zeros if the user has no km rows.

- [ ] **Step 5: Commit**

```bash
git add src/pages/ProfilePage.tsx src/styles/components.css design-system-design-instructions/screens/profile.md
git commit -m "$(cat <<'EOF'
Show lifetime event and km snapshots on the profile page.

EOF
)"
```

---

### Task 5: Memory + verification

**Files:**
- Modify: `.cursor/memory/MEMORY.md`

**Interfaces:**
- Consumes: shipped behavior from Tasks 1–4

- [ ] **Step 1: Update memory**

In `.cursor/memory/MEMORY.md`:

1. Under **Schema (high level)**, add that `profiles` holds `lifetime_event_count`, `lifetime_km`, `lifetime_stats_updated_at`.
2. Under **Current app state**, add a short bullet:

```
- **Profile lifetime stats (2026-08-16):** פרופיל card `סיכום פעילות` reads snapshot columns on `profiles` (events + km; same inclusion as החזר דלק). `refresh_profile_lifetime_stats()` + `pg_cron` 07:00/19:00 Asia/Jerusalem. Clients cannot write the columns. Spec: `2026-08-16-yahpaz-profile-lifetime-stats-design.md`.
```

3. Set **Last updated** to `2026-08-16`.

Do not invent deploy IDs or claim the cron has been observed firing.

- [ ] **Step 2: Final verification**

Run: `npx tsc --noEmit && npx vitest run src/lib/profileLifetimeStats.test.ts`

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add .cursor/memory/MEMORY.md
git commit -m "$(cat <<'EOF'
Record profile lifetime stats in project memory.

EOF
)"
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|---|---|
| Two lifetime figures on own פרופיל | 4 |
| Same inclusion as החזר דלק | 2 (SQL) |
| Columns on `profiles` | 2 |
| SQL refresh, not client sum | 2 |
| `pg_cron` 07:00 / 19:00 Asia/Jerusalem | 2 |
| Migration backfill | 2 (`select refresh…`) |
| Trigger blocks client writes | 2 + verify step |
| Refresh does not bump `profiles.updated_at` | 2 (UPDATE lists only three columns) |
| Caption היום / אתמול / absolute / hide if null | 1 + 4 |
| `--type-numeric-lg`, two-up, zeros visible | 4 |
| `screens/profile.md` | 4 |
| No Edge / Netlify / live recalc / shift km | all tasks omit them |
