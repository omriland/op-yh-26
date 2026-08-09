-- Admin users slice: profiles.active, phone on signup, select/update policies

alter table public.profiles
  add column if not exists active boolean not null default true;

create index if not exists profiles_active_idx on public.profiles (active);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, callsign, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.email,
    coalesce(new.raw_user_meta_data->>'callsign', 'TBD'),
    nullif(new.raw_user_meta_data->>'phone', '')
  );
  return new;
end;
$$;

drop policy if exists profiles_select_own_or_admin on public.profiles;
drop policy if exists profiles_select_unit_visibility on public.profiles;

create policy profiles_select_unit_visibility on public.profiles
for select to authenticated
using (
  id = auth.uid()
  or has_role(auth.uid(), 'admin'::app_role)
  or has_role(auth.uid(), 'shift_lead'::app_role)
  or exists (
    select 1
    from event_responders mine
    join events e on e.id = mine.event_id
    where mine.responder_id = auth.uid()
      and (
        e.shift_lead_id = profiles.id
        or exists (
          select 1 from event_responders peer
          where peer.event_id = e.id and peer.responder_id = profiles.id
        )
      )
  )
);

drop policy if exists profiles_update_own_or_admin on public.profiles;

create policy profiles_update_own_or_admin on public.profiles
for update to authenticated
using (id = auth.uid() or has_role(auth.uid(), 'admin'::app_role))
with check (
  (
    id = auth.uid()
    and active is not distinct from (select p.active from public.profiles p where p.id = auth.uid())
  )
  or has_role(auth.uid(), 'admin'::app_role)
);
