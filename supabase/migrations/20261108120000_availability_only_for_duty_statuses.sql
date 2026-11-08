-- Duty availability (זמינות) exists only for מתנדב פעיל, חניכה טלפונית and
-- חניכה ברכב פרטי. Nobody signed in, admins included, may set it for anyone else.
-- No JWT (the hourly apply_due_availability job, service-role account deletion) still passes.
-- Stored values are left as they are; the app ignores them for other statuses.

create or replace function public.guard_profile_availability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (timezone('Asia/Jerusalem', now()))::date;
begin
  if new.availability is not distinct from old.availability
     and new.available_from is not distinct from old.available_from then
    return new;
  end if;

  if new.availability = 'available' then
    new.available_from := null;
  elsif new.available_from is not null and new.available_from <= today then
    raise exception 'בחרו תאריך מהמחר או השאירו ריק.';
  end if;

  if auth.uid() is null then
    return new;
  end if;

  if new.volunteer_status not in (
    'active_volunteer'::public.volunteer_status,
    'phone_training'::public.volunteer_status,
    'personal_vehicle_training'::public.volunteer_status
  ) then
    raise exception 'אין הרשאה לעדכון זמינות: זמינות קיימת רק למתנדב פעיל, לחניכה טלפונית ולחניכה ברכב פרטי.';
  end if;

  if public.has_role(auth.uid(), 'admin') then
    return new;
  end if;

  if auth.uid() = new.id then
    return new;
  end if;

  raise exception 'אין הרשאה לעדכון זמינות.';
end;
$$;
