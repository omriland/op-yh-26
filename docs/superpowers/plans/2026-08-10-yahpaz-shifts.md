# Yahpaz Shifts (משמרות) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship independent Shift logs (create → assign crew/vehicle → link Events → editable rollups → close with mileage/notes) with role-aware list/detail/form UI.

**Architecture:** Mirror Events: Supabase tables + RLS, `src/lib/shifts.ts` + `shiftForm.ts` for data/save/rollup, list/detail/form pages under view-state navigation (`AppView` + `shiftSurface`). Shifts never parent Events; `shift_events` is optional for suggested counts.

**Tech Stack:** Vite + React + TS, Supabase client/RLS, existing רשומה UI (`StampChip`, `FilterChips`, `Ledger`, `Button`, Field/Command themes).

## Global Constraints

- Hebrew-only UI, full RTL (`lang=he`, `dir=rtl`)
- Spec: `docs/superpowers/specs/2026-08-10-yahpaz-shifts-design.md`
- Design SoT: `design-system-design-instructions/` (read `00-how-to-use.md`; reuse event-list / event-detail / event-form patterns)
- No Netlify Functions; no new UI libraries; no true offline
- EN column names in DB; HE labels in UI only
- No git commit unless the user asks
- Verify with `npm run build` (no unit-test runner in repo)

## File map

| File | Responsibility |
|---|---|
| `supabase/migrations/20260810120000_shifts.sql` | Enums, tables, RLS, `event_id` unique on `shift_events` |
| `src/lib/status.ts` | Add `ShiftStatus`, stamps, filters |
| `src/lib/shifts.ts` | List/detail fetch types + queries |
| `src/lib/shiftForm.ts` | Draft types, rollup suggestion, validate close, save/start/close |
| `src/components/shifts/ShiftCard.tsx` | List card |
| `src/pages/ShiftsPage.tsx` | Unit + mine lists |
| `src/pages/ShiftDetailPage.tsx` | Read detail + lead/responder actions |
| `src/pages/ShiftFormPage.tsx` | Create/edit/debrief/link Events |
| `src/components/shell/AppShell.tsx` | `AppView` + icons for shifts |
| `src/App.tsx` | Nav entries + `shiftSurface` wiring |
| `src/styles/components.css` | Minimal shift-form reuse of event-form footer patterns if needed |

---

### Task 1: Database migration + RLS

**Files:**
- Create: `supabase/migrations/20260810120000_shifts.sql`

**Interfaces:**
- Produces: tables `shifts`, `shift_responders`, `shift_events`, `shift_event_type_counts`, `shift_treated_vehicle_counts`; enums `shift_status`, `shift_vehicle_type`

- [ ] **Step 1: Write migration**

```sql
-- 20260810120000_shifts.sql
create type public.shift_status as enum ('draft', 'in_progress', 'closed');
create type public.shift_vehicle_type as enum ('patrol_north', 'patrol_center', 'personal');

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  shift_date date not null default (timezone('asia/jerusalem', now()))::date,
  shift_lead_id uuid not null references public.profiles (id),
  vehicle_type public.shift_vehicle_type not null,
  personal_vehicle_id uuid references public.vehicles (id),
  status public.shift_status not null default 'draft',
  odometer_start numeric,
  odometer_end numeric,
  total_km numeric,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shifts_personal_vehicle_check check (
    (vehicle_type = 'personal' and personal_vehicle_id is not null)
    or (vehicle_type <> 'personal' and personal_vehicle_id is null)
  )
);

create table public.shift_responders (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shifts (id) on delete cascade,
  responder_id uuid not null references public.profiles (id),
  unique (shift_id, responder_id)
);

create table public.shift_events (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shifts (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  unique (shift_id, event_id),
  unique (event_id) -- v1: event belongs to at most one shift
);

create table public.shift_event_type_counts (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shifts (id) on delete cascade,
  event_type_id uuid not null references public.event_types (id),
  count integer not null default 0 check (count >= 0),
  unique (shift_id, event_type_id)
);

create table public.shift_treated_vehicle_counts (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shifts (id) on delete cascade,
  vehicle_kind_id uuid not null references public.vehicle_kinds (id),
  count integer not null default 0 check (count >= 0),
  unique (shift_id, vehicle_kind_id)
);

create index shifts_date_idx on public.shifts (shift_date desc);
create index shift_responders_responder_idx on public.shift_responders (responder_id);

alter table public.shifts enable row level security;
alter table public.shift_responders enable row level security;
alter table public.shift_events enable row level security;
alter table public.shift_event_type_counts enable row level security;
alter table public.shift_treated_vehicle_counts enable row level security;

-- SELECT: admin | shift_lead | assigned responder
create policy shifts_select on public.shifts for select to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'shift_lead')
    or exists (
      select 1 from public.shift_responders sr
      where sr.shift_id = shifts.id and sr.responder_id = auth.uid()
    )
  );

create policy shifts_write_lead_admin on public.shifts for all to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'shift_lead')
  )
  with check (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'shift_lead')
  );

create policy shift_responders_select on public.shift_responders for select to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'shift_lead')
    or responder_id = auth.uid()
  );

create policy shift_responders_write_lead_admin on public.shift_responders for all to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'shift_lead')
  )
  with check (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'shift_lead')
  );

create policy shift_events_select on public.shift_events for select to authenticated
  using (
    exists (
      select 1 from public.shifts s
      where s.id = shift_events.shift_id
        and (
          public.has_role(auth.uid(), 'admin')
          or public.has_role(auth.uid(), 'shift_lead')
          or exists (
            select 1 from public.shift_responders sr
            where sr.shift_id = s.id and sr.responder_id = auth.uid()
          )
        )
    )
  );

create policy shift_events_write_lead_admin on public.shift_events for all to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'shift_lead')
  )
  with check (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'shift_lead')
  );

create policy shift_event_type_counts_select on public.shift_event_type_counts for select to authenticated
  using (
    exists (
      select 1 from public.shifts s
      where s.id = shift_event_type_counts.shift_id
        and (
          public.has_role(auth.uid(), 'admin')
          or public.has_role(auth.uid(), 'shift_lead')
          or exists (
            select 1 from public.shift_responders sr
            where sr.shift_id = s.id and sr.responder_id = auth.uid()
          )
        )
    )
  );

create policy shift_event_type_counts_write_lead_admin on public.shift_event_type_counts for all to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'shift_lead')
  )
  with check (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'shift_lead')
  );

create policy shift_treated_vehicle_counts_select on public.shift_treated_vehicle_counts for select to authenticated
  using (
    exists (
      select 1 from public.shifts s
      where s.id = shift_treated_vehicle_counts.shift_id
        and (
          public.has_role(auth.uid(), 'admin')
          or public.has_role(auth.uid(), 'shift_lead')
          or exists (
            select 1 from public.shift_responders sr
            where sr.shift_id = s.id and sr.responder_id = auth.uid()
          )
        )
    )
  );

create policy shift_treated_vehicle_counts_write_lead_admin on public.shift_treated_vehicle_counts for all to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'shift_lead')
  )
  with check (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'shift_lead')
  );
```

Note: `shifts_personal_vehicle_check` requires personal plate on every row insert. For draft create before vehicle is chosen, either (a) default `vehicle_type` to `patrol_north` on insert, or (b) drop the check and enforce in app `validateClose` + form save. **Use (b)** — remove the CHECK constraint from the migration so draft can be created with a provisional type; app enforces personal plate when type is personal and on close.

Revised constraint section for `shifts` table: omit `shifts_personal_vehicle_check`. Keep app validation only.

- [ ] **Step 2: Apply migration**

Run (from repo root, with Supabase linked):  
`npx supabase db push`  
(or project’s established migrate path if different)

Expected: migration applied without error.

- [ ] **Step 3: Smoke SQL**

Via Supabase MCP `execute_sql` or SQL editor: `select table_name from information_schema.tables where table_schema = 'public' and table_name like 'shift%';`  
Expected: five tables listed.

---

### Task 2: Status vocabulary + data layer

**Files:**
- Modify: `src/lib/status.ts`
- Create: `src/lib/shifts.ts`
- Create: `src/lib/shiftForm.ts`

**Interfaces:**
- Consumes: `supabase`, existing `EventListItem` patterns, `event_types` / `vehicle_kinds`
- Produces:
  - `ShiftStatus`, `shiftStamp`, `SHIFT_FILTERS`, `ShiftVehicleType`, `VEHICLE_TYPE_LABELS`
  - `fetchShifts()`, `fetchMyShifts(userId)`, `fetchShiftDetail(id)`
  - `suggestRollupsFromEvents(eventIds)`, `validateShiftClose(draft)`, `saveShiftForm(...)`, `startShift(id)`, `closeShift(...)`, `reopenShift(id)`

- [ ] **Step 1: Extend `status.ts`**

Add (do not rename existing event stamps):

```ts
export type ShiftStatus = 'draft' | 'in_progress' | 'closed'

const SHIFT_STAMPS: Record<ShiftStatus, StampDescriptor> = {
  draft: { label: 'טיוטה', tone: 'draft' },
  in_progress: { label: 'במשמרת', tone: 'pending' },
  closed: { label: 'נסגרה', tone: 'done' },
}

export const SHIFT_FILTERS: { value: ShiftStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'הכול' },
  { value: 'in_progress', label: 'במשמרת' },
  { value: 'closed', label: 'נסגרה' },
  { value: 'draft', label: 'טיוטה' },
]

export function shiftStamp(status: ShiftStatus): StampDescriptor {
  return SHIFT_STAMPS[status]
}
```

- [ ] **Step 2: Add `src/lib/shifts.ts`**

Types and selects mirroring `events.ts`:

```ts
export type ShiftVehicleType = 'patrol_north' | 'patrol_center' | 'personal'

export const VEHICLE_TYPE_LABELS: Record<ShiftVehicleType, string> = {
  patrol_north: 'ניידת צפון',
  patrol_center: 'ניידת מרכז',
  personal: 'אישי',
}

export type ShiftListItem = {
  id: string
  shift_date: string
  vehicle_type: ShiftVehicleType
  status: ShiftStatus
  personal_vehicle: { plate_number: string } | null
  shift_lead: { full_name: string; callsign: string } | null
  responders: { id: string; responder_id: string }[]
  linked_events: { id: string; event_id: string }[]
}

// fetchShifts / fetchMyShifts / fetchShiftDetail — same shape as events.ts
// Detail also loads: odometer_*, total_km, notes, event_type_counts, treated_vehicle_counts,
// linked event summaries (date, type name, police_event_id)
```

`fetchMyShifts`: query `shift_responders` for `responder_id = userId`, then `shifts` `.in('id', ...)`.

- [ ] **Step 3: Add `src/lib/shiftForm.ts`**

Core pure helpers + save:

```ts
export type ShiftFormDraft = {
  id?: string
  shift_date: string
  vehicle_type: ShiftVehicleType
  personal_vehicle_id: string | null
  responder_ids: string[]
  event_ids: string[]
  odometer_start: number | null
  odometer_end: number | null
  total_km: number | null
  notes: string
  event_type_counts: { event_type_id: string; count: number }[]
  treated_vehicle_counts: { vehicle_kind_id: string; count: number }[]
}

export function suggestRollupsFromLinkedEvents(input: {
  eventTypeIds: (string | null)[]
  treated: { vehicle_kind_id: string; quantity: number }[]
}): {
  event_type_counts: { event_type_id: string; count: number }[]
  treated_vehicle_counts: { vehicle_kind_id: string; count: number }[]
} {
  // count event types; sum treated quantities by kind
}

export type ShiftCloseError =
  | { field: 'vehicle_type' | 'personal_vehicle_id' | 'responders' | 'odometer_start' | 'odometer_end'; message: string }

export function validateShiftClose(draft: ShiftFormDraft): ShiftCloseError[] {
  const errors: ShiftCloseError[] = []
  if (!draft.vehicle_type) errors.push({ field: 'vehicle_type', message: 'יש לבחור סוג רכב' })
  if (draft.vehicle_type === 'personal' && !draft.personal_vehicle_id) {
    errors.push({ field: 'personal_vehicle_id', message: 'יש לבחור לוחית לרכב אישי' })
  }
  if (draft.responder_ids.length < 1) {
    errors.push({ field: 'responders', message: 'יש לשייך לפחות כונן אחד' })
  }
  if (draft.odometer_start == null) {
    errors.push({ field: 'odometer_start', message: 'יש למלא ק"מ התחלה' })
  }
  if (draft.odometer_end == null) {
    errors.push({ field: 'odometer_end', message: 'יש למלא ק"מ סיום' })
  }
  return errors
}

// saveShiftForm(draft, leadId): upsert shifts row; sync shift_responders / shift_events /
// count tables (delete missing, upsert present). On personal vehicle, verify vehicle.user_id
// is in draft.responder_ids before write; else throw Hebrew error.
// startShift(id): status = in_progress
// closeShift(draft): validateShiftClose then save with status = closed
// reopenShift(id): status = in_progress
// loadLinkableEvents(): recent events not already in another shift (left join shift_events)
// refreshRollups(eventIds): fetch event_type_id + event_treated_vehicles for those events,
//   return suggestRollupsFromLinkedEvents(...)
```

Hebrew conflict when linking an event already on another shift: surface Postgres unique violation on `shift_events.event_id` as `האירוע כבר מקושר למשמרת אחרת`.

- [ ] **Step 4: Build**

Run: `npm run build`  
Expected: exit 0 (pages not wired yet — lib-only is fine).

---

### Task 3: List UI

**Files:**
- Create: `src/components/shifts/ShiftCard.tsx`
- Create: `src/pages/ShiftsPage.tsx`

**Interfaces:**
- Consumes: `fetchShifts`, `fetchMyShifts`, `shiftStamp`, `SHIFT_FILTERS`, `VEHICLE_TYPE_LABELS`
- Produces: `ShiftsPage({ scope: 'unit' | 'mine'; onOpen; onCreate? })`

- [ ] **Step 1: `ShiftCard`**

Card shows: date (mono), vehicle label (+ plate if personal), `StampChip` from `shiftStamp`, caption with `N כוננים` · `M אירועים`.

- [ ] **Step 2: `ShiftsPage`**

Clone structure of `EventsPage`:
- `scope === 'unit'` → `fetchShifts()`; `mine` → `fetchMyShifts(userId)`
- `FilterChips` with `SHIFT_FILTERS`
- Field: cards; Command desktop unit: optional simple table or cards (cards OK for v1)
- Empty states HE: unit `אין משמרות עדיין` / mine `לא שובצת למשמרות`
- Unit header action **משמרת חדשה** when `canManage`

- [ ] **Step 3: Build**

Run: `npm run build`  
Expected: exit 0 (page unused until Task 5 is OK if exported).

---

### Task 4: Detail + form UI

**Files:**
- Create: `src/pages/ShiftDetailPage.tsx`
- Create: `src/pages/ShiftFormPage.tsx`
- Modify: `src/styles/components.css` (only if event-form footer classes need a `shift-form` twin)

**Interfaces:**
- Consumes: `fetchShiftDetail`, `saveShiftForm`, `startShift`, `closeShift`, `reopenShift`, `refreshRollups`, closed-list loaders, profiles/vehicles helpers used by event form
- Produces: lead create/edit/debrief; responder read-only detail

- [ ] **Step 1: `ShiftFormPage`**

Sections (Ledger / stacks, HE labels from spec):
1. תאריך, סוג רכב (3 options), לוחית if אישי (options = vehicles of selected responders)
2. שיבוץ כוננים (multi-select from active profiles with responder/lead roles — same source event form uses)
3. אירועים מקושרים — picker of linkable same-day/recent events; remove link; button **רענן מהאירועים**
4. ספירות — editable rows for event types + vehicle kinds (prefilled from rollup; zeros allowed)
5. ק"מ התחלה / סיום / קילומטרים / הערות
6. Footer sticky: **שמירה** · **התחל משמרת** (if draft) · **סגור משמרת** (if not closed) · **פתח מחדש** (if closed, lead/admin)

On close: run `validateShiftClose`; show field errors in Hebrew via Toast or inline.

- [ ] **Step 2: `ShiftDetailPage`**

Read-only Ledger of shift fields, responder names, linked events, count snapshots, notes.  
Actions:
- Lead/admin + not closed → **עריכה** → form
- Lead/admin + closed → **פתח מחדש** / **עריכה**
- Responder → no write actions

- [ ] **Step 3: Build**

Run: `npm run build`  
Expected: exit 0.

---

### Task 5: Navigation wiring

**Files:**
- Modify: `src/components/shell/AppShell.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Extends `AppView` with `'shifts' | 'my_shifts'`
- `ShiftSurface = { kind: 'list' } | { kind: 'detail'; shiftId } | { kind: 'form'; shiftId?: string }`

- [ ] **Step 1: AppShell**

```ts
export type AppView = 'events' | 'mine' | 'shifts' | 'my_shifts' | 'users' | 'lists' | 'profile'

// NAV_ICONS: shifts → CalendarClock (or ClipboardClock), my_shifts → CalendarCheck
```

Import extra lucide icons; keep existing icons unchanged.

- [ ] **Step 2: App.tsx Gate**

Nav entries (after events/mine, before admin):
- if `manages`: `{ view: 'shifts', label: 'משמרות' }`
- if `hasMineList`: `{ view: 'my_shifts', label: 'המשמרות שלי' }`

Add `shiftSurface` state parallel to `eventSurface`.  
`onShifts = view === 'shifts' || view === 'my_shifts'`.  
`navigate` resets both surfaces to list.  
Render:
- `shifts` / `my_shifts` + list → `<ShiftsPage scope={...} />`
- detail → `<ShiftDetailPage />`
- form → `<ShiftFormPage />` (Field theme like fill/form)

Theme: Command sidebar OK for unit shifts list on desktop lead/admin; form/detail narrow Field on desktop like events form.

- [ ] **Step 3: Build**

Run: `npm run build`  
Expected: exit 0.

---

### Task 6: Apply migration remotely + acceptance

**Files:** none (ops + checklist)

- [ ] **Step 1: Push migration** to project `rtvizpsfvtjowbimugns` if not already applied in Task 1

- [ ] **Step 2: Manual acceptance** (user or agent with seeded roles)

1. Lead: create משמרת — ניידת צפון, 2 responders, save טיוטה  
2. התחל משמרת → chip במשמרת  
3. Link 1–2 Events → רענן מהאירועים → counts populate → edit a count  
4. Fill odometers + notes → סגור משמרת → נסגרה  
5. Responder assigned: sees row under המשמרות שלי; cannot edit  
6. Personal car path: type אישי, pick plate from assigned responder vehicles; close works  
7. Link Event already on another shift → Hebrew conflict  
8. `npm run build` exit 0

---

## Spec coverage (self-review)

| Spec item | Task |
|---|---|
| `shifts` + vehicle enum + personal plate | 1, 2, 4 |
| `shift_responders` | 1, 2, 4 |
| `shift_events` + at most one shift per event | 1, 2, 4 |
| Count snapshot tables + refresh/edit | 1, 2, 4 |
| Mileage + notes manual | 2, 4 |
| Status draft → in_progress → closed + reopen | 2, 4 |
| Independent of Event status | 2 (no Event writes) |
| RLS admin/lead write, assigned read | 1 |
| List + form flows + המשמרות שלי | 3, 4, 5 |
| Close validation | 2, 4 |
| Non-goals (signup, payroll, GPS) | omitted |

No placeholders left; types aligned across tasks (`ShiftVehicleType`, `ShiftFormDraft`, `ShiftStatus`).
