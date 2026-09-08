# Highway Junctions Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a shift lead/admin pick a named highway junction (e.g. "צומת מסובים") as an event's location — resolving lat/lng automatically — from a one-time-seeded reference table, with a super-admin page to add aliases and rare missing junctions afterward.

**Architecture:** A new `public.highway_junctions` table (name_he/name_en + `text[]` alias arrays + lat/lng), seeded once from the external `saariko/RoadsKMs` GitHub repo via a generated SQL migration (no ongoing sync — after the seed this table is fully independent). A `search_highway_junctions` RPC (mirrors the existing `list_unit_map_pins` security-definer pattern) backs a new junction-search mode merged into the existing `LocationPlacesField` combobox, alongside Google Places. Picking a junction writes `events.location_lat/lng` with a new `location_pin_source = 'junction'` value, reusing 100% of the existing canonical-pin/map-rendering machinery — no map or `road_id`/validation changes (the team decided, via a WhatsApp vote on 2026-09-08, that the shift lead keeps manually picking one of the junction's intersecting roads — do not build any road auto-fill or new `roads` picklist entry). A super-admin-only `HighwayJunctionsPage`, modeled on the existing `EventLocationsPage`, lets the team manage aliases and add junctions RoadsKMs doesn't have.

**Full design rationale, alternatives considered and rejected, and all team decisions are recorded in `docs/locations-and-mapping.md` §4 ("Junctions") — read that section first for context this plan assumes.**

**Tech Stack:** Supabase Postgres (migrations, RLS, `security definer` SQL functions), React/TypeScript (Vite), Vitest, Python 3 (one-off seed-data generator, matching the existing `scripts/import-mile-posts.py` pattern).

---

## Chunk 1: Database — `highway_junctions` table, search RPC, `location_pin_source` enum

**Files:**
- Create: `supabase/migrations/20260908150000_highway_junctions.sql`
- Create: `supabase/migrations/20260908150100_event_location_pin_junction.sql`

Read first (for exact conventions to mirror): `supabase/migrations/20260816144201_user_addresses.sql` (table + RLS pattern), `supabase/migrations/20260818073500_list_unit_map_pins.sql` (security-definer RPC pattern), `supabase/migrations/20260824100000_event_location_pin.sql` (the existing `location_pin_source` check constraint this chunk extends).

- [ ] **Step 1: Write `20260908150000_highway_junctions.sql`**

```sql
-- One-time-seeded reference list of named highway junctions/interchanges.
-- Seeded once from saariko/RoadsKMs (see the seed migration) — NOT synced afterward.
-- All later changes (aliases, corrections, missing junctions) go through the
-- super-admin HighwayJunctionsPage directly into this table.

create table public.highway_junctions (
  id uuid primary key default gen_random_uuid(),
  name_he text not null,
  name_en text,
  aliases_he text[] not null default '{}',
  aliases_en text[] not null default '{}',
  roads text,
  lat double precision not null,
  lng double precision not null,
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create unique index highway_junctions_name_he_idx on public.highway_junctions (name_he);

comment on table public.highway_junctions is
  'Named highway junctions/interchanges, seeded once from saariko/RoadsKMs. Not synced after the seed — managed entirely in-app from then on.';
comment on column public.highway_junctions.aliases_he is
  'Alternate Hebrew names the same junction is known by. Matched by search_highway_junctions but never shown as the result label.';
comment on column public.highway_junctions.roads is
  'Free-text intersecting roads, informational only (e.g. "34/35") — not a FK to public.roads.';

alter table public.highway_junctions enable row level security;

create policy highway_junctions_select_ops
  on public.highway_junctions
  for select to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'shift_lead')
    or public.has_role(auth.uid(), 'super_admin')
  );

create policy highway_junctions_super_admin_write
  on public.highway_junctions
  for all to authenticated
  using (public.has_role(auth.uid(), 'super_admin'))
  with check (public.has_role(auth.uid(), 'super_admin'));

-- Fuzzy junction search: canonical name/id only, never a raw alias string.
-- Mirrors list_unit_map_pins()'s security-definer + in-function auth gate.
create or replace function public.search_highway_junctions(q text)
returns table (
  id uuid,
  name_he text,
  name_en text,
  roads text,
  lat double precision,
  lng double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select j.id, j.name_he, j.name_en, j.roads, j.lat, j.lng
  from public.highway_junctions j
  where (
      public.has_role(auth.uid(), 'admin')
      or public.has_role(auth.uid(), 'shift_lead')
      or public.has_role(auth.uid(), 'super_admin')
    )
    and length(btrim(q)) > 0
    and (
      j.name_he ilike '%' || btrim(q) || '%'
      or j.name_en ilike '%' || btrim(q) || '%'
      or exists (select 1 from unnest(j.aliases_he) a where a ilike '%' || btrim(q) || '%')
      or exists (select 1 from unnest(j.aliases_en) a where a ilike '%' || btrim(q) || '%')
    )
  order by j.name_he
  limit 15;
$$;

revoke all on function public.search_highway_junctions(text) from public;
grant execute on function public.search_highway_junctions(text) to authenticated;
```

**Post-review addendum (2026-09-08):** code quality review of this chunk flagged that `updated_at` was declared but never maintained on UPDATE — this repo's convention elsewhere (`my_active_event_prefs`, `event_media`) is a `before update` trigger, not relying on the app to set it manually. Added as a third migration, `supabase/migrations/20260908150150_highway_junctions_updated_at_trigger.sql` (timestamped between the two above so it stays correctly ordered before Chunk 2's seed migration):

```sql
-- highway_junctions.updated_at was declared but never maintained on UPDATE.
-- Follow the same pattern as my_active_event_prefs/event_media: a BEFORE
-- UPDATE trigger, so it can't silently go stale regardless of write path.

create or replace function public.highway_junctions_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger highway_junctions_set_updated_at
before update on public.highway_junctions
for each row
execute function public.highway_junctions_set_updated_at();
```

- [ ] **Step 2: Write `20260908150100_event_location_pin_junction.sql`**

```sql
-- Add 'junction' as a canonical event-pin source (picked from highway_junctions, §ops-map).

alter table public.events
  drop constraint if exists events_location_pin_source_check;

alter table public.events
  add constraint events_location_pin_source_check
  check (
    location_pin_source is null
    or location_pin_source in ('places', 'geocode', 'shift_lead', 'responder', 'junction')
  );

comment on column public.events.location_pin_source is
  'Last writer of the canonical pin: places | geocode | shift_lead | responder | junction. Human/junction sources lock auto-geocode.';
```

- [ ] **Step 3: Apply migrations locally and verify**

Run: `supabase db push` (or this repo's usual migration-apply command — check `README.md`/`docs/` if `db push` isn't it; per existing memory, raw `supabase db query` does not work in this environment, but applying versioned migration files does).

Then verify the table and function exist:
```sql
select * from public.highway_junctions limit 1;
select * from public.search_highway_junctions('צומת');
```
Expected: both run without error (empty result sets — table isn't seeded yet).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260908150000_highway_junctions.sql supabase/migrations/20260908150100_event_location_pin_junction.sql
git commit -m "$(cat <<'EOF'
Add highway_junctions table, search RPC, and junction pin source

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Chunk 2: One-time seed generator (RoadsKMs → SQL migration)

**Files:**
- Create: `scripts/data/roadskms-junctions.csv` (fetched snapshot, committed)
- Create: `scripts/import-highway-junctions.py`
- Create (generated output, committed): `supabase/migrations/20260908150200_seed_highway_junctions.sql`

Read first: `scripts/import-mile-posts.py` — this script follows the exact same shape (read external geodata → transform → write a versioned artifact into the repo), just producing a `.sql` migration instead of a `public/data/*.json` asset.

- [ ] **Step 1: Fetch and commit the RoadsKMs snapshot**

```bash
gh api repos/saariko/RoadsKMs/contents/junctions.csv --jq '.content' | base64 -d > scripts/data/roadskms-junctions.csv
```
Expected: 663 data rows + 1 header (`lat,lon,name_he,roads,name_en`). Verify: `wc -l scripts/data/roadskms-junctions.csv` → 664.

- [ ] **Step 2: Write the alias-splitting function with inline self-checks**

`scripts/import-highway-junctions.py`:

```python
#!/usr/bin/env python3
"""Generate a one-time SQL seed migration for public.highway_junctions
from a saariko/RoadsKMs junctions.csv snapshot.

RoadsKMs packs aliases into the same name_he/name_en string, " / "-delimited
(e.g. "צומת בן גוריון מערב / נתבג / חבד / כפר חבד"). This splits each row's
name into a canonical name (segment 0) + an alias array (remaining segments),
matching the highway_junctions schema (see supabase/migrations/20260908150000_highway_junctions.sql).

This is a ONE-TIME import, not a sync — run once, review the generated
migration, commit it. Re-running against a newer RoadsKMs snapshot after the
table already has manual edits would need real reconciliation logic this
script does not implement (see docs/locations-and-mapping.md §4).
"""

from __future__ import annotations

import csv
import sys
from pathlib import Path


def split_name(raw: str) -> tuple[str, list[str]]:
    """"A / B / C" -> ("A", ["B", "C"]). Single name -> (name, [])."""
    parts = [p.strip() for p in raw.split(' / ') if p.strip()]
    if not parts:
        return '', []
    return parts[0], parts[1:]


def sql_quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def sql_text_array(values: list[str]) -> str:
    if not values:
        return "'{}'"
    return "array[" + ", ".join(sql_quote(v) for v in values) + "]"


def sql_nullable_text(value: str) -> str:
    return sql_quote(value) if value else 'null'


def validate_split(rows: list[dict[str, str]]) -> None:
    """Print a warning for any row whose split looks suspicious, before trusting
    it over all 663 rows sight-unseen — the source data is hand-curated, not
    guaranteed-consistent (docs/locations-and-mapping.md §4 provenance note)."""
    for row in rows:
        name_he, aliases_he = split_name(row['name_he'])
        if not name_he:
            print(f"WARNING: empty canonical name_he for row: {row!r}", file=sys.stderr)
        if any(len(a) > 40 for a in aliases_he):
            print(f"WARNING: suspiciously long alias in: {row['name_he']!r}", file=sys.stderr)
        if aliases_he and len(aliases_he) > 5:
            print(f"WARNING: unusually many aliases ({len(aliases_he)}) in: {row['name_he']!r}", file=sys.stderr)


def build_insert_values(rows: list[dict[str, str]]) -> list[str]:
    lines = []
    for row in rows:
        name_he, aliases_he = split_name(row['name_he'])
        name_en, aliases_en = split_name(row.get('name_en', ''))
        lines.append(
            "  ({name_he}, {name_en}, {aliases_he}, {aliases_en}, {roads}, {lat}, {lng})".format(
                name_he=sql_quote(name_he),
                name_en=sql_nullable_text(name_en),
                aliases_he=sql_text_array(aliases_he),
                aliases_en=sql_text_array(aliases_en),
                roads=sql_nullable_text(row.get('roads', '').strip()),
                lat=float(row['lat']),
                lng=float(row['lon']),
            )
        )
    return lines


def main() -> None:
    src = Path(sys.argv[1] if len(sys.argv) > 1 else 'scripts/data/roadskms-junctions.csv')
    out = Path(
        sys.argv[2]
        if len(sys.argv) > 2
        else 'supabase/migrations/20260908150200_seed_highway_junctions.sql'
    )
    with src.open(encoding='utf-8') as f:
        rows = list(csv.DictReader(f))

    validate_split(rows)
    values = build_insert_values(rows)
    sql = (
        "-- One-time seed from saariko/RoadsKMs junctions.csv "
        f"({len(rows)} rows). Generated by scripts/import-highway-junctions.py — do not re-run\n"
        "-- against a newer snapshot without reconciling manual edits (docs/locations-and-mapping.md §4).\n\n"
        "insert into public.highway_junctions (name_he, name_en, aliases_he, aliases_en, roads, lat, lng)\nvalues\n"
        + ",\n".join(values)
        + "\non conflict (name_he) do nothing;\n"
    )
    out.write_text(sql, encoding='utf-8')
    print(f"wrote {len(rows)} junctions to {out}")


if __name__ == '__main__':
    main()
```

- [ ] **Step 3: Self-check `split_name` before generating the full migration**

The script's filename has hyphens, so it can't be `import`ed as a Python module directly (`scripts.import_highway_junctions` is not a valid module path and will raise `ModuleNotFoundError`/`SyntaxError`) — load it by file path instead:

```bash
python3 -c "
import importlib.util
spec = importlib.util.spec_from_file_location('seed_mod', 'scripts/import-highway-junctions.py')
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
assert mod.split_name('צומת אביהוא') == ('צומת אביהוא', [])
assert mod.split_name('צומת בן גוריון מערב / נתבג / חבד / כפר חבד') == ('צומת בן גוריון מערב', ['נתבג', 'חבד', 'כפר חבד'])
print('ok')
"
```
Expected: `ok`.

- [ ] **Step 4: Generate the seed migration and spot-check it**

```bash
python3 scripts/import-highway-junctions.py
```
Expected: `wrote 663 junctions to supabase/migrations/20260908150200_seed_highway_junctions.sql`, with no `WARNING:` lines on stderr (if there are any, open the flagged row in `scripts/data/roadskms-junctions.csv` and confirm the split is actually correct — a legitimate `" / "` inside a single name rather than an alias separator — before proceeding; the source data is hand-curated, not guaranteed-consistent, per `docs/locations-and-mapping.md` §4).

Open the generated file and manually verify a handful of rows, especially the previously-inspected alias example: `"צומת בן גוריון מערב"` should have `aliases_he = array['נתבג', 'חבד', 'כפר חבד']`; the row whose `name_en` contains "Silver" should carry the Abba Hillel Silver aliases; any junction with quotes/apostrophes in `roads` should be properly `''`-escaped.

- [ ] **Step 5: Apply the seed migration and verify row count**

Run: `supabase db push` (same mechanism as Chunk 1 Step 3), then:
```sql
select count(*) from public.highway_junctions;
select name_he, aliases_he from public.highway_junctions where name_he = 'צומת בן גוריון מערב';
```
Expected: count = 663; the Ben Gurion West row's `aliases_he` contains `{נתבג,חבד,כפר חבד}`.

- [ ] **Step 6: Commit**

```bash
git add scripts/data/roadskms-junctions.csv scripts/import-highway-junctions.py supabase/migrations/20260908150200_seed_highway_junctions.sql
git commit -m "$(cat <<'EOF'
Seed highway_junctions from a one-time saariko/RoadsKMs snapshot

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Chunk 3: Client library — `highwayJunctions.ts` + `locationPin.ts` junction source

**Files:**
- Create: `src/lib/highwayJunctions.ts`
- Test: `src/lib/highwayJunctions.test.ts`
- Modify: `src/lib/locationPin.ts`
- Modify: `src/lib/locationPin.test.ts`
- Modify: `src/lib/eventForm.location.test.ts` (verifies the junction pin survives `buildLocationPayload`, the actual save-time serializer — see Step 4b; do **not** skip this, it's the step that catches a junction pick silently losing its marker on save)

Read first: `src/lib/locationPin.ts` and `src/lib/locationPin.test.ts` (both in full — the new code must fit their existing shape exactly); `src/lib/eventForm.ts:940-990` (`buildLocationPayload` — the function that turns a draft into the row actually written to `events` on save; note its `locked && hasCoords` branch at `eventForm.ts:966-976` unconditionally sets `location_place_id: null` for **any** locked source, `location_pin_source`/lat/lng included) and `src/lib/eventForm.location.test.ts:58-` (`describe('buildLocationPayload', ...)`, whose `draft(...)` test helper this chunk reuses); and find one existing test that mocks a `supabase.rpc(...)` call (search the repo, e.g. `grep -rn "supabase.rpc" src/lib/*.test.ts`) to mirror its mocking style for `searchHighwayJunctions`'s test.

- [ ] **Step 1: Write the failing tests for `locationPin.ts`'s junction handling**

Add to `src/lib/locationPin.test.ts` (inside the existing `describe('applyLocationFieldChange', ...)` block):

```ts
  it('locks and tags a junction pick distinctly from a Google place', () => {
    expect(
      applyLocationFieldChange(
        {
          location: '',
          location_place_id: null,
          location_lat: null,
          location_lng: null,
          location_pin_source: null,
          location_pinned_at: null,
          location_pinned_by: null,
        },
        {
          location: 'צומת מסובים',
          location_place_id: 'junction:11111111-1111-1111-1111-111111111111',
          location_lat: 31.6,
          location_lng: 34.7,
        },
      ),
    ).toEqual({
      location: 'צומת מסובים',
      location_place_id: 'junction:11111111-1111-1111-1111-111111111111',
      location_lat: 31.6,
      location_lng: 34.7,
      location_pin_source: 'junction',
      location_pinned_at: null,
      location_pinned_by: null,
    })
  })
```

Add to the top-level `describe('locationPinIsLocked', ...)` block, extending the existing assertion list:
```ts
    expect(locationPinIsLocked('junction')).toBe(true)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- locationPin`
Expected: FAIL — `'junction'` isn't a recognized source yet, and the new pick isn't routed to it.

- [ ] **Step 3: Implement in `locationPin.ts`**

```ts
export const LOCATION_PIN_SOURCES = ['places', 'geocode', 'shift_lead', 'responder', 'junction'] as const
```

```ts
const LOCKED_SOURCES: ReadonlySet<string> = new Set(['shift_lead', 'responder', 'junction'])
```

In `applyLocationFieldChange`, replace the single `pickedPlace` branch with two branches — a junction pick (detected by the `location_place_id` prefix minted in Chunk 4) takes priority over the generic Places branch:

```ts
export function applyLocationFieldChange(
  current: LocationPinFields,
  next: {
    location: string
    location_place_id: string | null
    location_lat: number | null
    location_lng: number | null
  },
): LocationPinFields {
  const pickedJunction =
    Boolean(next.location_place_id?.startsWith('junction:')) &&
    next.location_lat != null &&
    next.location_lng != null
  if (pickedJunction) {
    return {
      location: next.location,
      location_place_id: next.location_place_id,
      location_lat: next.location_lat,
      location_lng: next.location_lng,
      location_pin_source: 'junction',
      location_pinned_at: null,
      location_pinned_by: null,
    }
  }
  const pickedPlace =
    Boolean(next.location_place_id) && next.location_lat != null && next.location_lng != null
  if (pickedPlace) {
    return {
      location: next.location,
      location_place_id: next.location_place_id,
      location_lat: next.location_lat,
      location_lng: next.location_lng,
      location_pin_source: 'places',
      location_pinned_at: null,
      location_pinned_by: null,
    }
  }
  if (locationPinIsLocked(current.location_pin_source)) {
    return {
      ...current,
      location: next.location,
      location_place_id: null,
    }
  }
  return {
    location: next.location,
    location_place_id: next.location_place_id,
    location_lat: next.location_lat,
    location_lng: next.location_lng,
    ...emptyLocationPinMeta(),
  }
}
```

Note: `events.location_place_id` carries a `"junction:<uuid>"` marker only **transiently**, in client component state — it is what lets `applyLocationFieldChange` (this function) distinguish a junction pick from a Google Places pick at the moment it's made, and route it to `location_pin_source: 'junction'` instead of `'places'`. **It does not survive to the saved row.** `buildLocationPayload` (`eventForm.ts:966-976`) unconditionally nulls `location_place_id` for any locked source once `locationPinIsLocked()` is true — which `'junction'` now is (this chunk adds it to `LOCKED_SOURCES` above) — exactly the same as it already does today for `'shift_lead'`/`'responder'`. This is **existing, correct, unchanged behavior**, not a gap to fix: nothing downstream (map rendering, the road field, reports) needs the specific `highway_junctions.id` to survive past save — only `location`, `location_lat`/`lng`, and `location_pin_source = 'junction'` do, and all three already persist correctly through that same branch. Leave a one-line comment above `pickedJunction` in `locationPin.ts` noting the marker is transient/pre-save-only, so nobody "fixes" `buildLocationPayload` later assuming the null is a bug.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- locationPin`
Expected: PASS, all cases including the two new ones.

- [ ] **Step 4b: Write the failing test proving a junction pick round-trips correctly through `buildLocationPayload`**

Add to `src/lib/eventForm.location.test.ts`, inside the existing `describe('buildLocationPayload', ...)` block, alongside the existing "stores a human-corrected pin without a Google place id" case (reuse that test's `draft(...)` helper):

```ts
  it('stores a junction pin, dropping the transient junction: marker like other locked sources', () => {
    expect(
      buildLocationPayload(
        draft({
          location: 'צומת מסובים',
          location_place_id: 'junction:11111111-1111-1111-1111-111111111111',
          location_lat: 31.6,
          location_lng: 34.7,
          location_pin_source: 'junction',
          location_pinned_at: null,
          location_pinned_by: null,
        }),
      ),
    ).toEqual({
      location: 'צומת מסובים',
      location_place_id: null,
      location_lat: 31.6,
      location_lng: 34.7,
      location_pin_source: 'junction',
      location_pinned_at: null,
      location_pinned_by: null,
    })
  })
```

- [ ] **Step 4c: Run to verify it fails**

Run: `npm test -- eventForm.location`
Expected: FAIL — until Step 3's `locationPin.ts` change lands, `'junction'` isn't in `LOCKED_SOURCES` yet, so `locationPinIsLocked('junction')` is `false` and `buildLocationPayload` takes the wrong branch (`hasPlace`, stamping `location_pin_source: 'places'` instead of preserving `'junction'`). If Step 3 already landed first (as ordered in this chunk), this instead confirms the test is well-formed by briefly reverting `LOCKED_SOURCES` — or simply trust Step 2's fail/Step 4's pass already proved `locationPinIsLocked('junction')` works, and treat this step as the integration-level confirmation that `buildLocationPayload` (untouched code) composes correctly with it. Either way, do not skip running this once and eyeballing the actual output before Step 4d.

- [ ] **Step 4d: Run to verify it passes**

Run: `npm test -- eventForm.location`
Expected: PASS — no production code change needed here; `buildLocationPayload` already handles this correctly once `'junction'` is a locked source (Step 3). This step exists to prove that, not to add new behavior.

- [ ] **Step 5: Write `highwayJunctions.test.ts` (before the implementation exists)**

Cover the two pure helpers directly (no mocking needed):

```ts
import { describe, expect, it } from 'vitest'
import { junctionIdFromPlaceId, junctionPlaceId } from './highwayJunctions'

describe('junctionPlaceId / junctionIdFromPlaceId', () => {
  it('round-trips a junction id through the synthetic place id', () => {
    const id = '11111111-1111-1111-1111-111111111111'
    expect(junctionIdFromPlaceId(junctionPlaceId(id))).toBe(id)
  })

  it('returns null for a real Google place id', () => {
    expect(junctionIdFromPlaceId('ChIJx')).toBeNull()
  })

  it('returns null for null/undefined', () => {
    expect(junctionIdFromPlaceId(null)).toBeNull()
    expect(junctionIdFromPlaceId(undefined)).toBeNull()
  })
})
```

For `searchHighwayJunctions`, find the existing mocking pattern for `supabase.rpc` (grep as noted above) and add an equivalent test asserting: empty/whitespace query short-circuits to `[]` without calling `supabase.rpc`; a real query calls `supabase.rpc('search_highway_junctions', { q: <trimmed> })` and returns its `data`.

- [ ] **Step 6: Run to verify it fails**

Run: `npm test -- highwayJunctions`
Expected: FAIL — `src/lib/highwayJunctions.ts` doesn't exist yet (module not found).

- [ ] **Step 7: Write `highwayJunctions.ts` (client wrapper around the RPC)**

```ts
import { supabase } from './supabase'

export const JUNCTION_PLACE_ID_PREFIX = 'junction:'

export type HighwayJunction = {
  id: string
  name_he: string
  name_en: string | null
  roads: string | null
  lat: number
  lng: number
}

export function junctionPlaceId(id: string): string {
  return `${JUNCTION_PLACE_ID_PREFIX}${id}`
}

export function junctionIdFromPlaceId(placeId: string | null | undefined): string | null {
  if (!placeId?.startsWith(JUNCTION_PLACE_ID_PREFIX)) return null
  return placeId.slice(JUNCTION_PLACE_ID_PREFIX.length)
}

export async function searchHighwayJunctions(query: string): Promise<HighwayJunction[]> {
  const trimmed = query.trim()
  if (!trimmed) return []
  const { data, error } = await supabase.rpc('search_highway_junctions', { q: trimmed })
  if (error) throw error
  return (data ?? []) as HighwayJunction[]
}
```

- [ ] **Step 8: Run full test file and verify pass**

Run: `npm test -- highwayJunctions`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/highwayJunctions.ts src/lib/highwayJunctions.test.ts src/lib/locationPin.ts src/lib/locationPin.test.ts src/lib/eventForm.location.test.ts
git commit -m "$(cat <<'EOF'
Add junction pin source and highwayJunctions search client

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Chunk 4: `LocationPlacesField` — merge junction search into the combobox

**Files:**
- Modify: `src/components/events/LocationPlacesField.tsx`

Read first (in full — this chunk edits it extensively): `src/components/events/LocationPlacesField.tsx` as it stands after Chunks 1–3 (re-read live; line numbers below are from the version already inspected while writing this plan and may have drifted slightly — match by the quoted surrounding code, not blindly by number).

This component has no dedicated test file today (verify with `find src -iname "LocationPlacesField*"`) — if that's still true, this chunk is implemented directly without a red/green test cycle (UI wiring, not new pure logic); the pure logic it calls (`junctionPlaceId`/`applyLocationFieldChange`) is already covered by Chunk 3's tests. If a test file does exist by the time this executes, follow its existing patterns and add a case for a junction pick.

- [ ] **Step 1: Add the `allowJunctions` prop and junction search state**

In the props type, add:
```ts
  /** Event location field only: also search public.highway_junctions alongside Places. */
  allowJunctions?: boolean
```

In the component signature's destructuring, add `allowJunctions = false,`.

Add imports:
```ts
import { searchHighwayJunctions, junctionPlaceId, type HighwayJunction } from '../../lib/highwayJunctions'
```

Add state alongside the existing `predictions` state:
```ts
  const [junctions, setJunctions] = useState<HighwayJunction[]>([])
```

- [ ] **Step 2: Add the junction search debounce effect**

Add a new `useEffect`, sibling to the existing Places-predictions effect (same 250ms debounce shape, independent of it):

```ts
  useEffect(() => {
    if (!allowJunctions) {
      setJunctions([])
      return
    }
    const trimmed = query.trim()
    if (!open || !trimmed) {
      setJunctions([])
      return
    }
    let cancelled = false
    const handle = window.setTimeout(() => {
      void searchHighwayJunctions(trimmed).then((results) => {
        if (!cancelled) setJunctions(results)
      }).catch(() => {
        if (!cancelled) setJunctions([])
      })
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [allowJunctions, query, open])
```

- [ ] **Step 3: Extend option indexing to include junction results**

Junction options are appended after Places predictions in the flat option list (free-text option, if any, first; then Places predictions; then junctions). Replace:
```ts
  const optionCount = (allowFreeText ? 1 : 0) + predictions.length
```
with:
```ts
  const optionCount = (allowFreeText ? 1 : 0) + predictions.length + junctions.length
```

Add a junction commit function, sibling to `commitGoogle` (no network fetch needed — the RPC already returned lat/lng):
```ts
  function commitJunction(junction: HighwayJunction) {
    const next = {
      location: junction.name_he,
      location_place_id: junctionPlaceId(junction.id),
      location_lat: junction.lat,
      location_lng: junction.lng,
    }
    onChange(next)
    onPlaceCommit?.(next)
    setQuery(junction.name_he)
    setOpen(false)
  }
```

Update `selectIndex` to route into the junction range:
```ts
  function selectIndex(index: number) {
    const freeTextSlot = allowFreeText ? 1 : 0
    if (allowFreeText && index === 0) {
      commitFreeText(query)
      return
    }
    const placeIndex = index - freeTextSlot
    if (placeIndex < predictions.length) {
      const prediction = predictions[placeIndex]
      if (prediction) void commitGoogle(prediction)
      return
    }
    const junction = junctions[placeIndex - predictions.length]
    if (junction) commitJunction(junction)
  }
```
(This replaces the existing `selectIndex` function body wholesale — the old version only handled free-text + Places.)

- [ ] **Step 4: Render junction options in the listbox**

In the JSX, immediately after the existing `{predictions.map(...)}` block (still inside the same `<ul>`), add:

```tsx
            {junctions.map((junction, index) => {
              const optionIndex = (allowFreeText ? 1 : 0) + predictions.length + index
              return (
                <li
                  key={junction.id}
                  id={`${listboxId}-opt-${optionIndex}`}
                  role="option"
                  aria-selected={highlight === optionIndex}
                  className={[
                    'location-places__option',
                    'location-places__option--junction',
                    highlight === optionIndex ? 'location-places__option--active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onMouseDown={(event) => {
                    event.preventDefault()
                    selectIndex(optionIndex)
                  }}
                >
                  <span className="location-places__primary">{junction.name_he}</span>
                  {junction.roads ? (
                    <span className="location-places__secondary">כביש {junction.roads}</span>
                  ) : null}
                </li>
              )
            })}
```

No new CSS is strictly required (`location-places__option`/`--primary`/`--secondary` already exist and apply); `location-places__option--junction` is added only as an optional visual-distinction hook — check `src/styles/` for where `.location-places__option` is styled and add a rule only if the team wants junctions visually distinguished from Places results (e.g. a small "צומת" badge or different accent color). Not required for correctness.

- [ ] **Step 5: Manual verification (no automated UI test for this component)**

Run the dev server (`npm run dev`), open an event form as a shift lead/admin, once Chunk 5 wires `allowJunctions` on. Type a known junction name (e.g. "מסובים") into the location field and confirm:
- A junction option appears below/after Places predictions, showing the canonical name and roads.
- Selecting it fills the field with the canonical name and does **not** trigger a Places details fetch (check Network tab — no `places.googleapis.com/v1/places/...` call for that pick).
- The event's road (`כביש`) field is untouched (per the team's decision — no auto-fill).

- [ ] **Step 6: Commit**

```bash
git add src/components/events/LocationPlacesField.tsx
git commit -m "$(cat <<'EOF'
Merge highway-junction search results into LocationPlacesField

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Chunk 5: Wire `allowJunctions` into the event location field

**Files:**
- Modify: `src/pages/EventFormPage.tsx`

- [ ] **Step 1: Locate the event's main location field**

Run: `grep -n "LocationPlacesField" src/pages/EventFormPage.tsx` — find the `<LocationPlacesField ... />` instance used for the event's own `location`/pin fields (as opposed to any other unrelated usage in that file, if present). Read ~20 lines of surrounding context to confirm it's the main event-location field (it will be wired to `draft.location`/`location_lat`/`location_lng` and use `applyLocationFieldChange`/the auto-geocode flow described in `docs/locations-and-mapping.md` §2).

- [ ] **Step 2: Add the prop**

Add `allowJunctions` to that instance's props: `allowJunctions`. (Boolean shorthand — always on for this field; it's already gated to admin/shift_lead by the surrounding `EventFormPage` access control, and the RPC itself re-checks role server-side.)

Do **not** add this prop to any other `LocationPlacesField` usage in the codebase (`AdminUsersPage.tsx` — volunteer addresses must stay Places-only; `EventLocationsList.tsx` — out of scope for this plan, see "Follow-ups" below).

- [ ] **Step 3: Manual verification**

Re-run the Chunk 4 Step 5 manual check now that the prop is actually wired — confirm junction search appears on the real event form, and that saving an event with a junction-picked location persists `location_pin_source = 'junction'` (query the row after saving, or check via `EventDetailPage`/the ops map that the pin renders in the right place, same as any other event pin per `docs/locations-and-mapping.md` §5).

- [ ] **Step 4: Commit**

```bash
git add src/pages/EventFormPage.tsx
git commit -m "$(cat <<'EOF'
Enable junction search on the event location field

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Chunk 6: `HighwayJunctionsPage` — super-admin alias/junction management

**Files:**
- Create: `src/lib/highwayJunctionsAdmin.ts`
- Test: `src/lib/highwayJunctionsAdmin.test.ts`
- Create: `src/pages/HighwayJunctionsPage.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/shell/AppShell.tsx` (`AppView` type, `AppShell.tsx:78-94` — a union **independently declared**, not derived, from `AppRouteView` below; both must be edited or the app won't type-check)
- Modify: `src/lib/appRoute.ts` (`AppRouteView` union at `appRoute.ts:8-24`, `VIEW_TO_SLUG` at `appRoute.ts:61-78`, and the `isAllowedAppView` switch at `appRoute.ts:316-339`)

Read first: `src/lib/closedLists.ts` (data-layer + Hebrew-error-message conventions to mirror), `src/pages/EventLocationsPage.tsx` + `src/components/events/EventLocationsList.tsx` (closest structural precedent — a small super-admin-only page over a specialized dataset), and — since `event_locations` is the exact view to mirror — every place that name appears across `src/App.tsx`, `src/components/shell/AppShell.tsx`, and `src/lib/appRoute.ts` (`grep -rn "event_locations" src/` to find all of them before starting Step 7; there are more call sites than just `App.tsx`, see the exact list in Step 7 below).

- [ ] **Step 1: Write failing tests for the alias-array update helpers**

`src/lib/highwayJunctionsAdmin.test.ts` — pure array-diffing helpers first (the part worth unit-testing; the Supabase calls themselves follow `closedLists.ts`'s already-established, untested-at-this-granularity style):

```ts
import { describe, expect, it } from 'vitest'
import { addAliasToList, removeAliasFromList } from './highwayJunctionsAdmin'

describe('addAliasToList', () => {
  it('adds a trimmed alias, ignoring duplicates', () => {
    expect(addAliasToList(['נתבג'], '  חבד  ')).toEqual(['נתבג', 'חבד'])
    expect(addAliasToList(['נתבג'], 'נתבג')).toEqual(['נתבג'])
  })
  it('ignores a blank alias', () => {
    expect(addAliasToList(['נתבג'], '   ')).toEqual(['נתבג'])
  })
})

describe('removeAliasFromList', () => {
  it('removes the matching alias', () => {
    expect(removeAliasFromList(['נתבג', 'חבד'], 'נתבג')).toEqual(['חבד'])
  })
  it('is a no-op for a non-existent alias', () => {
    expect(removeAliasFromList(['נתבג'], 'חבד')).toEqual(['נתבג'])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- highwayJunctionsAdmin`
Expected: FAIL — module doesn't exist yet.

- [ ] **Step 3: Implement `highwayJunctionsAdmin.ts`**

```ts
import { supabase } from './supabase'
import type { HighwayJunction } from './highwayJunctions'

export type HighwayJunctionAdminRow = HighwayJunction & {
  aliases_he: string[]
  aliases_en: string[]
}

export function addAliasToList(aliases: string[], candidate: string): string[] {
  const trimmed = candidate.trim()
  if (!trimmed || aliases.includes(trimmed)) return aliases
  return [...aliases, trimmed]
}

export function removeAliasFromList(aliases: string[], alias: string): string[] {
  return aliases.filter((a) => a !== alias)
}

export async function fetchHighwayJunctionsForAdmin(
  query: string,
): Promise<{ ok: true; rows: HighwayJunctionAdminRow[] } | { ok: false; error: string }> {
  // Strip characters that would break PostgREST's or=(...) filter grammar
  // (comma separates conditions, parens group them) rather than escaping them.
  const trimmed = query.trim().replace(/[,()]/g, '')
  let request = supabase
    .from('highway_junctions')
    .select('id, name_he, name_en, roads, lat, lng, aliases_he, aliases_en')
    .order('name_he', { ascending: true })
    .limit(50)
  if (trimmed) {
    request = request.or(
      `name_he.ilike.%${trimmed}%,name_en.ilike.%${trimmed}%`,
    )
  }
  const { data, error } = await request
  if (error) return { ok: false, error: 'טעינת הצמתים נכשלה. בדקו את החיבור ונסו שוב.' }
  return { ok: true, rows: (data ?? []) as HighwayJunctionAdminRow[] }
}

export async function updateHighwayJunctionAliases(
  id: string,
  aliases_he: string[],
  aliases_en: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from('highway_junctions')
    .update({ aliases_he, aliases_en, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { ok: false, error: 'שמירת הכינויים נכשלה. בדקו את החיבור ונסו שוב.' }
  return { ok: true }
}

export async function createHighwayJunction(input: {
  name_he: string
  name_en: string | null
  roads: string | null
  lat: number
  lng: number
  createdBy: string
}): Promise<{ ok: true; row: HighwayJunctionAdminRow } | { ok: false; error: string }> {
  const name_he = input.name_he.trim()
  if (!name_he) return { ok: false, error: 'יש להזין שם צומת.' }
  const { data, error } = await supabase
    .from('highway_junctions')
    .insert({
      name_he,
      name_en: input.name_en?.trim() || null,
      roads: input.roads?.trim() || null,
      lat: input.lat,
      lng: input.lng,
      created_by: input.createdBy,
    })
    .select('id, name_he, name_en, roads, lat, lng, aliases_he, aliases_en')
    .single()
  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      return { ok: false, error: 'צומת בשם זה כבר קיים.' }
    }
    return { ok: false, error: 'הוספת הצומת נכשלה. בדקו את החיבור ונסו שוב.' }
  }
  return { ok: true, row: data as HighwayJunctionAdminRow }
}
```

- [ ] **Step 4: Run to verify the pure-helper tests pass**

Run: `npm test -- highwayJunctionsAdmin`
Expected: PASS for `addAliasToList`/`removeAliasFromList`. (The three Supabase-calling functions are exercised manually in Step 6, matching `closedLists.ts`'s own test coverage level — check `find src -iname "closedLists.test*"`; if it doesn't exist, don't invent a heavier testing bar for this file than the pattern it's mirroring.)

- [ ] **Step 5: Build `HighwayJunctionsPage.tsx`**

A single page, two sections — search/edit-aliases list, and an "add missing junction" form. Keep it structurally close to `EventLocationsList.tsx`'s card/table split if this app is used at both desktop and mobile widths (check `useIsDesktop`/`asTable` usage there and mirror it); otherwise a simpler single-list layout is fine — match whatever `EventLocationsPage.tsx` itself does before over-engineering a responsive split that page doesn't need.

Required behavior:
- A search input (debounced, calling `fetchHighwayJunctionsForAdmin`) listing matching junctions with their current `aliases_he`/`aliases_en` as removable chips/tags, plus a small text input + "add" button per language to append a new alias (calling `addAliasToList` then `updateHighwayJunctionAliases`).
- An "add missing junction" form: `name_he` (required text input), `name_en` (optional text input), `roads` (optional text input), and lat/lng captured via a `LocationPlacesField` instance in Places mode (`allowFreeText={false}`, no `allowJunctions`) so the admin drops a real pin the same way an event location is set — reuse `fetchPlaceDetails`'s resolved `lat`/`lng` from that field's `onPlaceCommit`, or accept manual numeric lat/lng inputs as a fallback if a Places-based picker proves awkward to embed here; either is acceptable, prefer whichever is less code given what `LocationPlacesField` already returns. Submits via `createHighwayJunction`, passing the current user's id (from `useAuth()`, same as e.g. `EventFormPage.tsx`'s `const { user } = useAuth()`) as `createdBy`.

- [ ] **Step 6: Manual verification**

Run the dev server as a super_admin user. Search for an existing junction (e.g. "בן גוריון"), add a test alias, save, then search by that new alias and confirm it resolves the same junction. Add a throwaway "missing junction" test row, confirm it appears in search immediately (via Chunk 4's `LocationPlacesField` junction search on an actual event form), then delete the test row directly in the DB (no delete UI is required by this plan — not asked for; skip building one).

- [ ] **Step 7: Wire the new view into the routing layer — three files, not just `App.tsx`**

`event_locations` is declared/used in three separate places that must **all** three add a `highway_junctions` counterpart, or the build fails to type-check (`AppView` and `AppRouteView` are two independently-declared unions, not one type reused):

1. **`src/lib/appRoute.ts`** (edit first — the other two files import from here):
   - Add `| 'highway_junctions'` to the `AppRouteView` union (`appRoute.ts:8-24`, alongside `event_locations` at line 22).
   - Add `highway_junctions: 'highway-junctions',` to `VIEW_TO_SLUG` (`appRoute.ts:61-78`, alongside `event_locations: 'event-locations'` at line 75) — `SLUG_TO_VIEW` derives from this automatically, no separate edit needed there.
   - Add `case 'highway_junctions':` to the `isAllowedAppView` switch (`appRoute.ts:316-339`) — join it into the same case-group as `event_locations`/`event_audit`/`ios_devices` (lines 335-338), which all `return access.isSuperAdmin`.

2. **`src/components/shell/AppShell.tsx`**:
   - Add `| 'highway_junctions'` to the `AppView` union (`AppShell.tsx:78-94`, alongside `event_locations` at line 92).

3. **`src/App.tsx`**:
   - Import: `import { HighwayJunctionsPage } from './pages/HighwayJunctionsPage'`
   - Nav entry: alongside the `event_locations` entry (~line 610-621), add a `highway_junctions` entry, `isSuperAdmin`-gated the same way, with its own icon/label (e.g. "צמתים").
   - Render branch: alongside `activeView === 'event_locations' && isSuperAdmin ? <EventLocationsPage ... /> : ...` (~line 1091), add `: activeView === 'highway_junctions' && isSuperAdmin ? <HighwayJunctionsPage /> : ...`.

After all three, run `npm run build` (or `tsc -b`) — expected: clean, no type errors. This is the concrete check that nothing was missed; do not rely on `npm run dev` alone, since a dev server can mask a type error that `tsc -b`/CI would catch.

- [ ] **Step 8: Commit**

```bash
git add src/lib/highwayJunctionsAdmin.ts src/lib/highwayJunctionsAdmin.test.ts src/pages/HighwayJunctionsPage.tsx src/App.tsx src/components/shell/AppShell.tsx src/lib/appRoute.ts
git commit -m "$(cat <<'EOF'
Add super-admin HighwayJunctionsPage for alias and junction management

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Full-plan verification

- [ ] Run the whole suite: `npm test`. Expected: PASS, no regressions.
- [ ] Run `npm run lint` and `tsc -b` (via `npm run build`, or just the type-check portion) — expected: clean.
- [ ] Re-read `docs/locations-and-mapping.md` §4 and confirm every "not built" / "net new work" item it lists is now either done or explicitly deferred in the "Follow-ups" section below; update that doc's status once this plan is fully executed (it currently describes the feature as designed-but-not-built).

## Explicitly out of scope for this plan (do not build)

- Any `road_id` auto-fill, matching, or a new `"צומת"` roads-picklist entry — the team voted this down (docs/locations-and-mapping.md §4). `EventFormPage`'s road field stays exactly as it works today.
- Junction search on `EventLocationsList.tsx`'s map-pin-repair queue — only the main `EventFormPage` location field gets `allowJunctions`. Revisit only if asked.
- A delete/deactivate UI for junctions in `HighwayJunctionsPage` — not requested; do the DB-side cleanup manually if a test/bad row needs removing.
- Any ongoing sync/re-import job against RoadsKMs — the seed is one-time by design.
