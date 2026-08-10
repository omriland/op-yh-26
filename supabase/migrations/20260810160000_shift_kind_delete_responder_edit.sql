-- Shift kind (שם משמרת), admin-only delete, assigned-responder edit on/after shift date.

create type public.shift_kind as enum (
  'morning',
  'midday',
  'reinforcement',
  'escort',
  'other'
);

alter table public.shifts
  add column shift_kind public.shift_kind not null default 'other';

-- Split lead/admin write ALL → insert/update for lead+admin, delete admin-only
drop policy if exists shifts_write_lead_admin on public.shifts;

create policy shifts_insert_lead_admin on public.shifts
for insert to authenticated
with check (
  public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'shift_lead')
);

create policy shifts_update_lead_admin on public.shifts
for update to authenticated
using (
  public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'shift_lead')
)
with check (
  public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'shift_lead')
);

create policy shifts_delete_admin on public.shifts
for delete to authenticated
using (public.has_role(auth.uid(), 'admin'));

-- Assigned responder may update shift row on/after shift_date (Asia/Jerusalem)
create or replace function public.can_edit_shift_as_assigned(p_shift_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.shifts s
    where s.id = p_shift_id
      and public.is_assigned_to_shift(p_shift_id)
      and s.shift_date <= (timezone('Asia/Jerusalem', now()))::date
  );
$$;

revoke all on function public.can_edit_shift_as_assigned(uuid) from public;
grant execute on function public.can_edit_shift_as_assigned(uuid) to authenticated;

create policy shifts_update_assigned on public.shifts
for update to authenticated
using (public.can_edit_shift_as_assigned(id))
with check (public.can_edit_shift_as_assigned(id));

-- Join tables: assigned editor may sync links + count snapshots
create policy shift_events_write_assigned on public.shift_events
for all to authenticated
using (public.can_edit_shift_as_assigned(shift_id))
with check (public.can_edit_shift_as_assigned(shift_id));

create policy shift_event_type_counts_write_assigned on public.shift_event_type_counts
for all to authenticated
using (public.can_edit_shift_as_assigned(shift_id))
with check (public.can_edit_shift_as_assigned(shift_id));

create policy shift_treated_vehicle_counts_write_assigned on public.shift_treated_vehicle_counts
for all to authenticated
using (public.can_edit_shift_as_assigned(shift_id))
with check (public.can_edit_shift_as_assigned(shift_id));
