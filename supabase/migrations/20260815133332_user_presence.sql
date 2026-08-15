-- Last-action presence for the admin users list.
-- Isolated from profiles so heartbeats never fire OTP / password / row-lock triggers.

create table public.user_presence (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  last_active_at timestamptz not null
);

alter table public.user_presence enable row level security;
-- No policies for authenticated/anon → deny all via PostgREST.
-- Writes and admin reads go through SECURITY DEFINER RPCs only.

create or replace function public.touch_last_active()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active is true
  ) then
    return;
  end if;
  insert into public.user_presence (user_id, last_active_at)
  values (auth.uid(), now())
  on conflict (user_id) do update
    set last_active_at = excluded.last_active_at;
end;
$$;

revoke all on function public.touch_last_active() from public;
grant execute on function public.touch_last_active() to authenticated;

create or replace function public.admin_list_last_active()
returns table (user_id uuid, last_active_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select up.user_id, up.last_active_at
  from public.user_presence up
  where public.has_role(auth.uid(), 'admin');
$$;

revoke all on function public.admin_list_last_active() from public;
grant execute on function public.admin_list_last_active() to authenticated;
