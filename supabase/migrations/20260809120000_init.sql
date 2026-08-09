-- Yahpaz init schema (mirrors remote apply_migration init_yahpaz_schema)

create type public.app_role as enum ('admin', 'shift_lead', 'responder');

create type public.event_status as enum ('draft', 'in_progress', 'partial', 'done');

create type public.participation_status as enum ('pending', 'in_progress', 'done');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  email text not null unique,
  callsign text not null,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  plate_number text not null,
  model text not null,
  created_at timestamptz not null default now()
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.app_role not null,
  unique (user_id, role)
);

create table public.districts (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  sort_order int not null default 0
);

create table public.event_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  sort_order int not null default 0
);

create table public.roads (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  sort_order int not null default 0
);

create table public.vehicle_kinds (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  sort_order int not null default 0
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  shift_lead_id uuid not null references public.profiles (id),
  event_date date not null default (timezone('Asia/Jerusalem', now()))::date,
  police_event_id text,
  district_id uuid references public.districts (id),
  patrol_callsign text,
  event_type_id uuid references public.event_types (id),
  notes text,
  road_id uuid references public.roads (id),
  location text,
  status public.event_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.event_responders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  responder_id uuid not null references public.profiles (id),
  vehicle_plate text,
  total_km numeric,
  odometer_start numeric,
  odometer_end numeric,
  route text,
  treatment_detail text,
  emergency_means boolean not null default false,
  treatment_notes text,
  status public.participation_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, responder_id)
);

create table public.event_treated_vehicles (
  id uuid primary key default gen_random_uuid(),
  event_responder_id uuid not null references public.event_responders (id) on delete cascade,
  vehicle_kind_id uuid not null references public.vehicle_kinds (id),
  quantity int not null check (quantity > 0),
  unique (event_responder_id, vehicle_kind_id)
);

create or replace function public.has_role(uid uuid, r public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = uid and ur.role = r
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, callsign)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.email,
    coalesce(new.raw_user_meta_data->>'callsign', 'TBD')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.vehicles enable row level security;
alter table public.user_roles enable row level security;
alter table public.districts enable row level security;
alter table public.event_types enable row level security;
alter table public.roads enable row level security;
alter table public.vehicle_kinds enable row level security;
alter table public.events enable row level security;
alter table public.event_responders enable row level security;
alter table public.event_treated_vehicles enable row level security;

create policy profiles_select_own_or_admin on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.has_role(auth.uid(), 'admin'));

create policy profiles_update_own_or_admin on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.has_role(auth.uid(), 'admin'));

create policy user_roles_select_own_or_admin on public.user_roles
  for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

create policy user_roles_admin_all on public.user_roles
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create policy lookups_read_authenticated on public.districts
  for select to authenticated using (true);
create policy event_types_read_authenticated on public.event_types
  for select to authenticated using (true);
create policy roads_read_authenticated on public.roads
  for select to authenticated using (true);
create policy vehicle_kinds_read_authenticated on public.vehicle_kinds
  for select to authenticated using (true);

create policy districts_admin_write on public.districts
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));
create policy event_types_admin_write on public.event_types
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));
create policy roads_admin_write on public.roads
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));
create policy vehicle_kinds_admin_write on public.vehicle_kinds
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create policy events_select on public.events
  for select to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'shift_lead')
    or exists (
      select 1 from public.event_responders er
      where er.event_id = events.id and er.responder_id = auth.uid()
    )
  );

create policy events_write_lead_admin on public.events
  for all to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'shift_lead')
  )
  with check (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'shift_lead')
  );

create policy event_responders_select on public.event_responders
  for select to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'shift_lead')
    or responder_id = auth.uid()
  );

create policy event_responders_lead_admin_write on public.event_responders
  for all to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'shift_lead')
  )
  with check (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'shift_lead')
  );

create policy event_responders_self_update on public.event_responders
  for update to authenticated
  using (responder_id = auth.uid())
  with check (responder_id = auth.uid());

create policy treated_vehicles_select on public.event_treated_vehicles
  for select to authenticated
  using (
    exists (
      select 1 from public.event_responders er
      where er.id = event_responder_id
        and (
          public.has_role(auth.uid(), 'admin')
          or public.has_role(auth.uid(), 'shift_lead')
          or er.responder_id = auth.uid()
        )
    )
  );

create policy treated_vehicles_lead_admin_write on public.event_treated_vehicles
  for all to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'shift_lead')
  )
  with check (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'shift_lead')
  );

create policy vehicles_select_own_or_admin on public.vehicles
  for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'shift_lead'));

create policy vehicles_write_own_or_admin on public.vehicles
  for all to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'))
  with check (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
