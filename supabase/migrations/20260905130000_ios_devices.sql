-- ios_devices + enroll tokens (Plan 2 Ad Hoc enrollment)

create type public.ios_device_status as enum (
  'pending',
  'approved',
  'registered',
  'rejected',
  'retired'
);

create table public.ios_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  udid text not null,
  device_name text,
  product_type text,
  ios_version text,
  status public.ios_device_status not null default 'pending',
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references public.profiles (id),
  registered_at timestamptz,
  rejected_at timestamptz,
  reject_reason text,
  membership_year int not null,
  constraint ios_devices_udid_unique unique (udid),
  constraint ios_devices_udid_len check (char_length(udid) between 25 and 40),
  constraint ios_devices_reject_reason_len check (
    reject_reason is null or char_length(reject_reason) <= 500
  )
);

create index ios_devices_user_status_idx on public.ios_devices (user_id, status);
create index ios_devices_status_year_idx on public.ios_devices (status, membership_year);

create table public.ios_enroll_tokens (
  token text primary key,
  user_id uuid not null references public.profiles (id),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index ios_enroll_tokens_user_idx on public.ios_enroll_tokens (user_id);

alter table public.ios_devices enable row level security;
alter table public.ios_enroll_tokens enable row level security;

grant select on table public.ios_devices to authenticated;
grant usage on type public.ios_device_status to authenticated;

create policy ios_devices_select on public.ios_devices
for select to authenticated
using (
  user_id = auth.uid()
  or public.has_role(auth.uid(), 'super_admin')
);

create or replace function public.ios_membership_year_now()
returns int
language sql
stable
as $$
  select extract(year from (now() at time zone 'Asia/Jerusalem'))::int;
$$;

create or replace function public.ios_budget_used(p_year int)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.ios_devices
  where membership_year = p_year
    and status in ('approved', 'registered');
$$;

create or replace function public.mint_ios_enroll_token()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  active int;
  tok text;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  select count(*)::int into active
  from public.ios_devices
  where user_id = uid
    and status in ('pending', 'approved', 'registered');
  if active >= 2 then
    raise exception 'ios_device_cap' using errcode = 'P0001';
  end if;
  tok := encode(gen_random_bytes(24), 'hex');
  insert into public.ios_enroll_tokens (token, user_id, expires_at)
  values (tok, uid, now() + interval '30 minutes');
  return tok;
end;
$$;

revoke all on function public.mint_ios_enroll_token() from public;
grant execute on function public.mint_ios_enroll_token() to authenticated;

create or replace function public.ios_device_approve(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  row public.ios_devices%rowtype;
  used int;
begin
  if uid is null or not public.has_role(uid, 'super_admin') then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  select * into row from public.ios_devices where id = p_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if row.status is distinct from 'pending' then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;
  used := public.ios_budget_used(row.membership_year);
  if used >= 100 then
    raise exception 'ios_budget_full' using errcode = 'P0001';
  end if;
  update public.ios_devices
  set status = 'approved',
      approved_at = now(),
      approved_by = uid
  where id = p_id;
end;
$$;

create or replace function public.ios_device_reject(p_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  updated_count int;
begin
  if uid is null or not public.has_role(uid, 'super_admin') then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  with updated as (
    update public.ios_devices
    set status = 'rejected',
        rejected_at = now(),
        reject_reason = nullif(btrim(coalesce(p_reason, '')), '')
    where id = p_id
      and status = 'pending'
    returning id
  )
  select count(*)::int into updated_count from updated;
  if updated_count = 0 then
    raise exception 'not_found_or_invalid' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.ios_device_retire(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  updated_count int;
begin
  if uid is null or not public.has_role(uid, 'super_admin') then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  with updated as (
    update public.ios_devices
    set status = 'retired'
    where id = p_id
      and status in ('approved', 'registered')
    returning id
  )
  select count(*)::int into updated_count from updated;
  if updated_count = 0 then
    raise exception 'not_found_or_invalid' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.ios_device_approve(uuid) from public;
revoke all on function public.ios_device_reject(uuid, text) from public;
revoke all on function public.ios_device_retire(uuid) from public;
grant execute on function public.ios_device_approve(uuid) to authenticated;
grant execute on function public.ios_device_reject(uuid, text) to authenticated;
grant execute on function public.ios_device_retire(uuid) to authenticated;
