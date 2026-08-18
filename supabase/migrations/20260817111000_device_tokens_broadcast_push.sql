-- APNs device tokens for אבן דרך + push counts on unit broadcasts.

create table public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  token text not null unique,
  platform text not null check (platform = 'ios'),
  environment text not null check (environment in ('sandbox', 'production')),
  updated_at timestamptz not null default now()
);

create index device_tokens_user_idx on public.device_tokens (user_id);

comment on table public.device_tokens is
  'APNs device tokens for אבן דרך. Users upsert own rows; Edge reads all with service_role.';

alter table public.device_tokens enable row level security;

create policy device_tokens_own_select on public.device_tokens
  for select
  to authenticated
  using (user_id = auth.uid());

create policy device_tokens_own_insert on public.device_tokens
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy device_tokens_own_update on public.device_tokens
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy device_tokens_own_delete on public.device_tokens
  for delete
  to authenticated
  using (user_id = auth.uid());

create or replace function public.upsert_device_token(
  p_token text,
  p_platform text,
  p_environment text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'יש להתחבר מחדש.';
  end if;
  if p_platform is distinct from 'ios' then
    raise exception 'פלטפורמה לא נתמכת.';
  end if;
  if p_environment not in ('sandbox', 'production') then
    raise exception 'סביבה לא נתמכת.';
  end if;
  if p_token is null or length(trim(p_token)) < 16 then
    raise exception 'טוקן לא תקין.';
  end if;

  insert into public.device_tokens (user_id, token, platform, environment, updated_at)
  values (auth.uid(), trim(p_token), p_platform, p_environment, now())
  on conflict (token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        environment = excluded.environment,
        updated_at = now();
end;
$$;

revoke all on function public.upsert_device_token(text, text, text) from public;
grant execute on function public.upsert_device_token(text, text, text) to authenticated;

create or replace function public.user_ids_with_device_tokens()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct dt.user_id
  from public.device_tokens dt
  where public.has_role(auth.uid(), 'admin');
$$;

revoke all on function public.user_ids_with_device_tokens() from public;
grant execute on function public.user_ids_with_device_tokens() to authenticated;

alter table public.unit_broadcasts
  add column if not exists push_count integer not null default 0,
  add column if not exists push_failed_count integer not null default 0;
