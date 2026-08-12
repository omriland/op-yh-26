-- OTP challenge codes for Soprano SMS (replaces Twilio Verify round-trip)

create table if not exists public.otp_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  purpose text not null check (purpose in ('login_device', 'users_page')),
  code_hash text not null,
  attempts int not null default 0,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists otp_challenges_user_purpose_created_idx
  on public.otp_challenges (user_id, purpose, created_at desc);

alter table public.otp_challenges enable row level security;
-- No client policies; Edge service_role only.

-- Clear challenges when phone changes (alongside trust/step-up).
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
    delete from public.otp_challenges where user_id = new.id;
  end if;
  return new;
end;
$$;
