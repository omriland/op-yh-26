-- The unit map shows only members who can actually come out: מתנדב פעיל,
-- חניכה טלפונית or חניכה ברכב פרטי, with an active (non-archived) vehicle.
-- Filtered here so the web and Android maps follow the same rule.

create or replace function public.list_unit_map_pins()
 RETURNS TABLE(user_id uuid, full_name text, callsign text, kind address_kind, label text, formatted_address text, lat double precision, lng double precision, volunteer_status volunteer_status, availability availability_status, available_from date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    p.id,
    p.full_name,
    p.callsign,
    a.kind,
    a.label,
    a.formatted_address,
    a.lat,
    a.lng,
    p.volunteer_status,
    p.availability,
    p.available_from
  from public.user_addresses a
  join public.profiles p on p.id = a.user_id
  where auth.uid() is not null
    and not public.is_prelaunch_blocked_caller()
    and exists (
      select 1
      from public.profiles me
      where me.id = auth.uid()
        and me.active
        and me.is_app_review_demo = p.is_app_review_demo
    )
    and p.active
    and not p.invite_pending
    and p.volunteer_status in (
      'active_volunteer'::public.volunteer_status,
      'phone_training'::public.volunteer_status,
      'personal_vehicle_training'::public.volunteer_status
    )
    -- The App Review demo lead has no car; demo accounts only ever see each other.
    and (
      p.is_app_review_demo
      or exists (
        select 1
        from public.vehicles v
        where v.user_id = p.id
          and not v.archived
      )
    )
  order by p.callsign, a.kind;
$function$;
