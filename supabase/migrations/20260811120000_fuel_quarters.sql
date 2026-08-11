-- Quarterly fuel request workbook (admin-only).

create table public.fuel_quarters (
  id uuid primary key default gen_random_uuid(),
  year int not null,
  quarter int not null check (quarter between 1 and 4),
  status text not null default 'draft' check (status in ('draft', 'locked')),
  locked_at timestamptz,
  locked_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (year, quarter)
);

create table public.fuel_quarter_distributions (
  id uuid primary key default gen_random_uuid(),
  quarter_id uuid not null references public.fuel_quarters (id) on delete cascade,
  responder_id uuid not null references public.profiles (id) on delete cascade,
  opening_balance_km numeric not null default 0,
  km_month_1 numeric not null default 0,
  km_month_2 numeric not null default 0,
  km_month_3 numeric not null default 0,
  quarter_km numeric not null default 0,
  cards int not null default 0 check (cards >= 0),
  card_numbers text not null default '',
  remaining_km numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (quarter_id, responder_id)
);

create index fuel_quarter_distributions_responder_idx
  on public.fuel_quarter_distributions (responder_id);

alter table public.fuel_quarters enable row level security;
alter table public.fuel_quarter_distributions enable row level security;

create policy fuel_quarters_admin_all on public.fuel_quarters
  for all
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create policy fuel_quarter_distributions_admin_all on public.fuel_quarter_distributions
  for all
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));
