# Events Search by Responder / Shift-Lead Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let shift leads / admins search the unit events list by כונן or אחמ״ש name/או״ק (plus existing police id / road / location) via a Postgres RPC.

**Architecture:** New `search_unit_event_ids(p_needle)` RPC returns matching event UUIDs (`security invoker` + role gate). Client keeps `fetchEvents()` for rows; debounced search intersects ids with the status chip. Pure filter helpers live in `src/lib/events.ts` and are unit-tested.

**Tech Stack:** Supabase Postgres RPC, Vite + React + TS, Vitest, existing `useToast`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-12-yahpaz-events-search-by-responder-design.md`
- Hebrew UI only; placeholder: `חיפוש לפי מספר אירוע, כביש, מיקום, שם או או״ק`
- Unit scope (`scope === 'unit'`) only; no mobile search UI; no mine-list search
- Match fields: `police_event_id`, `location`, `roads.name`, shift-lead `full_name`/`callsign`, assigned responders' `full_name`/`callsign`
- Do not match `patrol_callsign`
- Escape `%` / `_` for `ilike`; debounce ~250ms
- RPC failure → Hebrew toast (`alert`); fall back to status-chip-only (ignore text) until next success
- Do not commit unless the user asks

## File map

| File | Responsibility |
|---|---|
| `supabase/migrations/20260812150000_search_unit_event_ids.sql` | RPC + grants |
| `src/lib/events.ts` | `searchUnitEventIds`, `filterUnitEventsForList` |
| `src/lib/eventsSearch.test.ts` | Pure filter tests |
| `src/pages/EventsPage.tsx` | Debounced RPC wire-up, placeholder, toast |
| `design-system-design-instructions/screens/event-list.md` | Placeholder copy |
| `.cursor/memory/MEMORY.md` | One-line note that unit search includes name/או״ק via RPC |

---

### Task 1: Pure list filter helper + tests

**Files:**
- Modify: `src/lib/events.ts`
- Create: `src/lib/eventsSearch.test.ts`

**Interfaces:**
- Produces: `filterUnitEventsForList(events, { status, searchIds }): EventListItem[]`
  - `status: EventStatus | 'all'`
  - `searchIds: ReadonlySet<string> | null` — `null` means no text filter (empty query or RPC failure fallback)
  - When `searchIds` is a Set (including empty), keep only events whose `id` is in the set **and** match status

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/eventsSearch.test.ts
import { describe, expect, it } from 'vitest'
import { filterUnitEventsForList, type EventListItem } from './events'

function row(partial: Partial<EventListItem> & Pick<EventListItem, 'id' | 'status'>): EventListItem {
  return {
    event_date: '2026-08-01',
    police_event_id: null,
    patrol_callsign: null,
    location: null,
    is_cancelled: false,
    district: null,
    event_type: null,
    road: null,
    shift_lead: null,
    responders: [],
    ...partial,
  }
}

describe('filterUnitEventsForList', () => {
  const events = [
    row({ id: 'a', status: 'done' }),
    row({ id: 'b', status: 'partial' }),
    row({ id: 'c', status: 'done' }),
  ]

  it('status only when searchIds is null', () => {
    expect(filterUnitEventsForList(events, { status: 'done', searchIds: null }).map((e) => e.id)).toEqual([
      'a',
      'c',
    ])
  })

  it('intersects status with search id set', () => {
    expect(
      filterUnitEventsForList(events, { status: 'done', searchIds: new Set(['a', 'b']) }).map((e) => e.id),
    ).toEqual(['a'])
  })

  it('empty searchIds yields no rows even if status would match', () => {
    expect(filterUnitEventsForList(events, { status: 'all', searchIds: new Set() })).toEqual([])
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `npx vitest run src/lib/eventsSearch.test.ts`  
Expected: FAIL — `filterUnitEventsForList` not exported

- [ ] **Step 3: Implement helper in `src/lib/events.ts`**

```ts
export function filterUnitEventsForList(
  events: EventListItem[],
  opts: { status: EventStatus | 'all'; searchIds: ReadonlySet<string> | null },
): EventListItem[] {
  return events.filter((event) => {
    const matchesStatus = opts.status === 'all' || event.status === opts.status
    if (!matchesStatus) return false
    if (opts.searchIds === null) return true
    return opts.searchIds.has(event.id)
  })
}
```

(Import `EventStatus` from `./status` if not already in scope.)

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx vitest run src/lib/eventsSearch.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit only if user asks** (otherwise skip)

---

### Task 2: Migration — `search_unit_event_ids`

**Files:**
- Create: `supabase/migrations/20260812150000_search_unit_event_ids.sql`

**Interfaces:**
- Produces: `public.search_unit_event_ids(p_needle text) returns setof uuid`
- Consumes: `public.has_role`, tables `events`, `roads`, `profiles`, `event_responders`

- [ ] **Step 1: Write migration**

```sql
-- Unit events text search for shift_lead / admin / super_admin.
-- Returns distinct event ids matching police id, location, road name,
-- shift-lead name/callsign, or any assigned responder name/callsign.

create or replace function public.search_unit_event_ids(p_needle text)
returns setof uuid
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_raw text := trim(coalesce(p_needle, ''));
  v_pattern text;
begin
  if v_raw = '' then
    return;
  end if;

  if not (
    public.has_role(auth.uid(), 'shift_lead')
    or public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'super_admin')
  ) then
    return;
  end if;

  -- Literal % / _ / \ for ilike
  v_pattern :=
    '%'
    || replace(replace(replace(v_raw, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_')
    || '%';

  return query
  select distinct e.id
  from public.events e
  left join public.roads r on r.id = e.road_id
  left join public.profiles lead on lead.id = e.shift_lead_id
  where
    e.police_event_id ilike v_pattern escape '\'
    or e.location ilike v_pattern escape '\'
    or r.name ilike v_pattern escape '\'
    or lead.full_name ilike v_pattern escape '\'
    or lead.callsign ilike v_pattern escape '\'
    or exists (
      select 1
      from public.event_responders er
      join public.profiles p on p.id = er.responder_id
      where er.event_id = e.id
        and (
          p.full_name ilike v_pattern escape '\'
          or p.callsign ilike v_pattern escape '\'
        )
    );
end;
$$;

revoke all on function public.search_unit_event_ids(text) from public;
grant execute on function public.search_unit_event_ids(text) to authenticated;
```

Verify column names against schema before applying: `events.shift_lead_id`, `events.road_id` (see `supabase/migrations/20260809120000_init.sql`). If names differ, fix the join columns to match.

- [ ] **Step 2: Apply migration to the linked Supabase project**

Run (from repo root, using the project's usual path — e.g. Supabase CLI linked to `rtvizpsfvtjowbimugns`):

```bash
npx supabase db push
```

If CLI is unavailable in the session, apply the SQL in the Supabase SQL editor and note that in the handoff.

Expected: function exists; `grant execute` to `authenticated`.

- [ ] **Step 3: Smoke the RPC in SQL editor (as a shift_lead session if possible)**

```sql
-- Should return ids when needle matches a known responder/lead/police field
select * from public.search_unit_event_ids('חלק_משם');
```

Expected: matching uuids; empty for whitespace; empty when role gate fails.

- [ ] **Step 4: Commit only if user asks**

---

### Task 3: Client RPC wrapper

**Files:**
- Modify: `src/lib/events.ts`

**Interfaces:**
- Consumes: `supabase.rpc`, `search_unit_event_ids`
- Produces: `searchUnitEventIds(needle: string): Promise<string[]>`
  - Trims needle; if empty, resolves `[]` without calling RPC (callers should skip anyway)
  - On PostgREST error, throws `Error` with message (page maps to toast)

- [ ] **Step 1: Add wrapper**

```ts
/** Unit-list text search ids (shift_lead+). Empty trimmed needle → []. */
export async function searchUnitEventIds(needle: string): Promise<string[]> {
  const trimmed = needle.trim()
  if (!trimmed) return []

  const { data, error } = await supabase.rpc('search_unit_event_ids', {
    p_needle: trimmed,
  })

  if (error) throw new Error(error.message)
  return (data ?? []) as string[]
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`  
Expected: exit 0 (or no new errors in `events.ts`)

- [ ] **Step 3: Commit only if user asks**

---

### Task 4: Wire `EventsPage` (unit scope)

**Files:**
- Modify: `src/pages/EventsPage.tsx`
- Modify: `design-system-design-instructions/screens/event-list.md` (placeholder string only)

**Interfaces:**
- Consumes: `searchUnitEventIds`, `filterUnitEventsForList`, `useToast().show`
- State:
  - `query: string` (input, immediate)
  - `searchIds: ReadonlySet<string> | null` — `null` when trimmed query empty **or** after RPC failure fallback
  - Debounce 250ms on trimmed `query` for `scope === 'unit'` only

- [ ] **Step 1: Update placeholder + design doc**

In `EventsPage.tsx` search input:

```tsx
placeholder="חיפוש לפי מספר אירוע, כביש, מיקום, שם או או״ק"
```

In `design-system-design-instructions/screens/event-list.md`, replace the desktop search placeholder sentence to the same string.

- [ ] **Step 2: Add debounced RPC effect (unit only)**

```tsx
import { useToast } from '../components/ui/Toast'
import { fetchEvents, fetchMyEvents, filterUnitEventsForList, ownParticipation, searchUnitEventIds, type EventListItem } from '../lib/events'

// inside EventsPage:
const { show } = useToast()
const [searchIds, setSearchIds] = useState<ReadonlySet<string> | null>(null)

useEffect(() => {
  if (scope !== 'unit') {
    setSearchIds(null)
    return
  }

  const trimmed = query.trim()
  if (!trimmed) {
    setSearchIds(null)
    return
  }

  let cancelled = false
  const handle = window.setTimeout(() => {
    searchUnitEventIds(trimmed)
      .then((ids) => {
        if (!cancelled) setSearchIds(new Set(ids))
      })
      .catch(() => {
        if (cancelled) return
        setSearchIds(null) // status-chip-only fallback
        show('חיפוש האירועים נכשל. נסו שוב.', 'alert')
      })
  }, 250)

  return () => {
    cancelled = true
    window.clearTimeout(handle)
  }
}, [query, scope, show])
```

- [ ] **Step 3: Replace unit text haystack in `visible`**

```tsx
const visible = useMemo(() => {
  if (!events) return []

  if (scope === 'unit') {
    return filterUnitEventsForList(events, { status: filter, searchIds })
  }

  // mine: keep prior client haystack (police / road / location) + open-first sort
  const needle = query.trim().toLowerCase()
  const filtered = events.filter((event) => {
    const matchesStatus = filter === 'all' || event.status === filter
    const haystack = [event.police_event_id, event.road?.name, event.location]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return matchesStatus && (!needle || haystack.includes(needle))
  })

  return [...filtered].sort((a, b) => {
    const aOpen = ownParticipation(a, user?.id) !== 'done' ? 0 : 1
    const bOpen = ownParticipation(b, user?.id) !== 'done' ? 0 : 1
    return aOpen - bOpen
  })
}, [events, filter, query, scope, user?.id, searchIds])
```

Notes:
- `scope === 'mine'` has no search input today; leaving the old haystack is harmless and avoids changing mine behavior.
- Empty-state `filtered` flag already uses `query.trim() !== ''` — keep that so clearing search clears empty-filter UI.
- Search input remains `asTable`-gated (desktop Command only).

- [ ] **Step 4: Manual check locally**

1. `npm run dev` as shift lead  
2. Search by כונן name → event appears  
3. Search by או״ק → appears  
4. Search by אחמ״ש → appears  
5. Search by מספר אירוע / כביש / מיקום → still works  
6. Clear search → full status-filtered list  
7. Status chip + search combine  

- [ ] **Step 5: Commit only if user asks**

---

### Task 5: Verify + memory

**Files:**
- Modify: `.cursor/memory/MEMORY.md` (Current app state — one bullet)

- [ ] **Step 1: Run tests + typecheck**

```bash
npx vitest run src/lib/eventsSearch.test.ts
npx tsc --noEmit
```

Expected: both pass / exit 0

- [ ] **Step 2: Update memory**

Under Current app state, add something factual like:

```md
- Unit events desktop search: RPC `search_unit_event_ids` — police id / road / location / shift-lead + responder name & או״ק. Spec: `2026-08-12-yahpaz-events-search-by-responder-design.md`
```

- [ ] **Step 3: Do not commit unless asked**

---

## Spec coverage checklist

| Spec requirement | Task |
|---|---|
| Match responders + shift lead name/callsign | Task 2 |
| Keep police / road / location | Task 2 |
| Debounce ~250ms | Task 4 |
| Escape `%`/`_` | Task 2 |
| Empty query → no RPC / status only | Task 4 |
| RPC failure toast + status-only fallback | Task 4 |
| Placeholder copy | Task 4 |
| Unit desktop only; no mine/mobile | Task 4 |
| Client helper + intersect | Tasks 1, 3, 4 |
| Memory note | Task 5 |
