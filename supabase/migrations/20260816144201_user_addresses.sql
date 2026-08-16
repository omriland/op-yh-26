-- Admin-managed Google Places addresses per user.
-- home/work are optional unique slots; other is a labeled extra.

create type public.address_kind as enum ('home', 'work', 'other');

create table public.user_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.address_kind not null,
  label text,
  formatted_address text not null,
  place_id text not null,
  lat double precision not null,
  lng double precision not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_addresses_label_check check (
    (kind in ('home', 'work') and label is null)
    or (kind = 'other' and length(btrim(label)) > 0)
  )
);

create unique index user_addresses_one_home_per_user
  on public.user_addresses (user_id)
  where kind = 'home';

create unique index user_addresses_one_work_per_user
  on public.user_addresses (user_id)
  where kind = 'work';

create index user_addresses_user_id_idx on public.user_addresses (user_id);

comment on table public.user_addresses is
  'Admin-managed Google Places addresses. home/work optional unique slots; other is labeled extras.';

alter table public.user_addresses enable row level security;

create policy user_addresses_select_own_or_admin
  on public.user_addresses
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.has_role(auth.uid(), 'admin')
  );

create policy user_addresses_admin_write
  on public.user_addresses
  for all to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    and not public.super_admin_row_locked(user_id)
  )
  with check (
    public.has_role(auth.uid(), 'admin')
    and not public.super_admin_row_locked(user_id)
  );
