-- Summary reports: activity grouped by a chosen key, and inactive members.

-- One row per group. SECURITY INVOKER so RLS still applies (demo rows stay hidden).
-- Inclusion rules match the existing responder reports: events by event_date,
-- cancelled events included. Kilometres are the lead-entered event_responders.total_km,
-- skipping frozen participations like the fuel refund report does.
create or replace function public.report_activity_summary(
  p_from date,
  p_to date,
  p_group text
)
returns table (
  group_id uuid,
  group_label text,
  event_count bigint,
  shift_count bigint,
  km_total numeric,
  last_activity date
)
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if p_group is null or p_group not in ('responder', 'road', 'district', 'event_type', 'shift_lead') then
    raise exception 'קבוצה לא חוקית: %', p_group;
  end if;

  if p_group = 'responder' then
    return query
    with event_part as (
      select
        er.responder_id,
        count(distinct e.id) as events,
        coalesce(sum(er.total_km) filter (
          where not er.frozen_over_60km and not er.frozen_suspicious_duplicate
        ), 0) as km,
        max(e.event_date) as last_date
      from public.events e
      join public.event_responders er on er.event_id = e.id
      where e.event_date between p_from and p_to
      group by er.responder_id
    ),
    shift_part as (
      select sr.responder_id, count(distinct s.id) as shifts
      from public.shifts s
      join public.shift_responders sr on sr.shift_id = s.id
      where s.shift_date between p_from and p_to
      group by sr.responder_id
    )
    select
      p.id,
      p.full_name,
      coalesce(ep.events, 0),
      coalesce(sp.shifts, 0),
      coalesce(ep.km, 0),
      ep.last_date
    from event_part ep
    full join shift_part sp on sp.responder_id = ep.responder_id
    join public.profiles p on p.id = coalesce(ep.responder_id, sp.responder_id);
    return;
  end if;

  return query
  with event_km as (
    select
      er.event_id,
      coalesce(sum(er.total_km) filter (
        where not er.frozen_over_60km and not er.frozen_suspicious_duplicate
      ), 0) as km
    from public.event_responders er
    group by er.event_id
  )
  select
    case p_group
      when 'road' then e.road_id
      when 'district' then e.district_id
      when 'event_type' then e.event_type_id
      else e.shift_lead_id
    end as group_id,
    coalesce(
      case p_group
        when 'road' then r.name
        when 'district' then d.name
        when 'event_type' then t.name
        else lead.full_name
      end,
      ''
    ) as group_label,
    count(distinct e.id) as event_count,
    0::bigint as shift_count,
    coalesce(sum(ek.km), 0) as km_total,
    max(e.event_date) as last_activity
  from public.events e
  left join event_km ek on ek.event_id = e.id
  left join public.roads r on r.id = e.road_id
  left join public.districts d on d.id = e.district_id
  left join public.event_types t on t.id = e.event_type_id
  left join public.profiles lead on lead.id = e.shift_lead_id
  where e.event_date between p_from and p_to
  group by 1, 2;
end;
$$;

revoke all on function public.report_activity_summary(date, date, text) from public;
revoke all on function public.report_activity_summary(date, date, text) from anon;
grant execute on function public.report_activity_summary(date, date, text) to authenticated;

-- Active, non-demo members with no sign-in or activity for p_days (or never).
-- SECURITY DEFINER because auth.users is not readable by app roles.
create or replace function public.report_inactive_members(p_days int default 60)
returns table (
  user_id uuid,
  full_name text,
  callsign text,
  phone text,
  last_sign_in_at timestamptz,
  last_active_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
    or not (
      public.has_role(auth.uid(), 'admin')
      or public.has_role(auth.uid(), 'super_admin')
      or public.has_role(auth.uid(), 'shift_lead')
    )
  then
    raise exception 'אין הרשאה';
  end if;

  if p_days is null or p_days < 1 or p_days > 365 then
    raise exception 'מספר ימים לא חוקי';
  end if;

  return query
  select
    p.id,
    p.full_name,
    p.callsign,
    p.phone,
    u.last_sign_in_at,
    up.last_active_at
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.user_presence up on up.user_id = p.id
  where p.active
    and not p.is_app_review_demo
    and (
      greatest(u.last_sign_in_at, up.last_active_at) is null
      or greatest(u.last_sign_in_at, up.last_active_at) < now() - make_interval(days => p_days)
    )
  order by p.full_name;
end;
$$;

revoke all on function public.report_inactive_members(int) from public;
revoke all on function public.report_inactive_members(int) from anon;
grant execute on function public.report_inactive_members(int) to authenticated;
