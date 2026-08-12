-- Phone OTP (Twilio Verify): per-user flags, device trust, users-page step-up

alter table public.profiles
  add column if not exists otp_login_enabled boolean not null default false,
  add column if not exists otp_users_page_enabled boolean not null default false,
  add column if not exists otp_flags_updated_at timestamptz,
  add column if not exists otp_flags_updated_by uuid references public.profiles (id);

create table if not exists public.otp_device_trust (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  device_key_hash text not null,
  trusted_until timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (user_id, device_key_hash)
);

create index if not exists otp_device_trust_user_until_idx
  on public.otp_device_trust (user_id, trusted_until desc);

alter table public.otp_device_trust enable row level security;
-- No policies for authenticated/anon → deny all via API. Edge service_role only.

create table if not exists public.otp_step_up (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  purpose text not null check (purpose in ('users_page')),
  valid_until timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists otp_step_up_user_purpose_until_idx
  on public.otp_step_up (user_id, purpose, valid_until desc);

alter table public.otp_step_up enable row level security;
-- No client policies; Edge service_role only.

create or replace function public.guard_otp_flags()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.otp_login_enabled is distinct from old.otp_login_enabled
     or new.otp_users_page_enabled is distinct from old.otp_users_page_enabled
     or new.otp_flags_updated_at is distinct from old.otp_flags_updated_at
     or new.otp_flags_updated_by is distinct from old.otp_flags_updated_by then
    raise exception 'דגלי OTP ניתנים לשינוי רק דרך השרת';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_otp_flags on public.profiles;
create trigger profiles_guard_otp_flags
  before update on public.profiles
  for each row
  execute function public.guard_otp_flags();

create or replace function public.clear_otp_state_on_phone_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.phone is distinct from old.phone then
    delete from public.otp_device_trust where user_id = new.id;
    delete from public.otp_step_up where user_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_clear_otp_on_phone_change on public.profiles;
create trigger profiles_clear_otp_on_phone_change
  after update of phone on public.profiles
  for each row
  execute function public.clear_otp_state_on_phone_change();
