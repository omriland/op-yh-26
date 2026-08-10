-- Yahpaz shifts schema

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
  updated_at timestamptz not null default now()
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
