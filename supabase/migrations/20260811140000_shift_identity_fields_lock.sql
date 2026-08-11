-- Lock shift identity columns for non-lead/admin updaters (assigned responders).

create or replace function public.enforce_shift_identity_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.has_role(auth.uid(), 'admin')
     or public.has_role(auth.uid(), 'shift_lead') then
    return new;
  end if;

  if new.shift_date is distinct from old.shift_date
     or new.shift_kind is distinct from old.shift_kind
     or new.vehicle_type is distinct from old.vehicle_type
     or new.personal_vehicle_id is distinct from old.personal_vehicle_id then
    raise exception 'אין הרשאה לשנות פרטי משמרת';
  end if;

  return new;
end;
$$;

drop trigger if exists shifts_enforce_identity_edit on public.shifts;

create trigger shifts_enforce_identity_edit
before update on public.shifts
for each row
execute function public.enforce_shift_identity_edit();

revoke all on function public.enforce_shift_identity_edit() from public;
