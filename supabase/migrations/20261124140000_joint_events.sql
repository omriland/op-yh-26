-- Joint events: on one event_date a police_event_id may be held by at most one
-- non-cancelled manual event AND at most one non-cancelled shift event. Two
-- manual or two shift events with the same number and date stay rejected.
-- A joint pair keeps both records; nothing is copied or deleted.
-- Replayed on every edge-function deploy, after 20260929082322 and 20261124120000.

-- Same body as the demo-aware version from 20261029120000, comparing by origin.
create or replace function public.events_reject_same_day_police_event_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_police_id text;
begin
  if new.is_cancelled then
    return new;
  end if;

  v_police_id := nullif(btrim(coalesce(new.police_event_id, '')), '');
  if v_police_id is null then
    return new;
  end if;

  -- Grandfather: this row already holds this active pair (including the
  -- known 5523 / 2026-09-08 drafts). Do not block note-only saves.
  if tg_op = 'UPDATE'
     and old.is_cancelled = false
     and old.police_event_id is not distinct from new.police_event_id
     and old.event_date is not distinct from new.event_date then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtext(v_police_id),
    hashtext(new.event_date::text)
  );

  if exists (
    select 1
    from public.events e
    where e.id is distinct from new.id
      and e.is_cancelled = false
      and e.is_demo = new.is_demo
      and e.origin = new.origin
      and e.event_date = new.event_date
      and nullif(btrim(coalesce(e.police_event_id, '')), '') is not null
      and btrim(e.police_event_id) = v_police_id
  ) then
    raise exception 'כבר קיים אירוע עם המספר הזה באותו תאריך.'
      using errcode = '23505';
  end if;

  return new;
end;
$$;

-- The other event of a joint pair: same date, same number, other origin.
create or replace function public.joint_event_partner(p_event_id uuid)
returns table (partner_id uuid, partner_origin public.event_origin, partner_shift_id uuid)
language sql
stable
security invoker
set search_path = public
as $$
  select p.id, p.origin, p.shift_id
  from public.events e
  join public.events p
    on p.id <> e.id
   and p.is_cancelled = false
   and p.is_demo = e.is_demo
   and p.origin <> e.origin
   and p.event_date = e.event_date
   and btrim(p.police_event_id) = btrim(e.police_event_id)
  where e.id = p_event_id
    and e.is_cancelled = false
    and nullif(btrim(coalesce(e.police_event_id, '')), '') is not null
  order by p.created_at
  limit 1;
$$;

revoke all on function public.joint_event_partner(uuid) from public;
revoke all on function public.joint_event_partner(uuid) from anon;
grant execute on function public.joint_event_partner(uuid) to authenticated;

-- One counting key per event. A manual and a shift event that share a number
-- and date (the first of each, in id order) get the same key and count once.
-- Every other event, including legacy same-origin duplicates, keeps its own id.
create or replace function public.event_counting_keys(p_from date, p_to date)
returns table (event_id uuid, event_key text)
language sql
stable
security invoker
set search_path = public
as $$
  with numbered as (
    select
      e.id,
      e.origin,
      e.is_demo,
      e.event_date,
      btrim(e.police_event_id) as police_id,
      row_number() over (
        partition by e.is_demo, e.event_date, btrim(e.police_event_id), e.origin
        order by e.id
      ) as position_in_origin
    from public.events e
    where e.event_date between p_from and p_to
      and e.is_cancelled = false
      and nullif(btrim(coalesce(e.police_event_id, '')), '') is not null
  ),
  joint as (
    select m.id as event_id, md5(m.event_date::text || '|' || m.police_id || '|' || m.is_demo::text) as joint_key
    from numbered m
    where m.origin = 'manual'
      and exists (
        select 1 from numbered s
        where s.origin = 'shift'
          and s.is_demo = m.is_demo
          and s.event_date = m.event_date
          and s.police_id = m.police_id
          and s.position_in_origin = m.position_in_origin
      )
    union all
    select s.id, md5(s.event_date::text || '|' || s.police_id || '|' || s.is_demo::text)
    from numbered s
    where s.origin = 'shift'
      and exists (
        select 1 from numbered m
        where m.origin = 'manual'
          and m.is_demo = s.is_demo
          and m.event_date = s.event_date
          and m.police_id = s.police_id
          and m.position_in_origin = s.position_in_origin
      )
  )
  select e.id, coalesce(j.joint_key, e.id::text)
  from public.events e
  left join joint j on j.event_id = e.id
  where e.event_date between p_from and p_to;
$$;

revoke all on function public.event_counting_keys(date, date) from public;
revoke all on function public.event_counting_keys(date, date) from anon;
grant execute on function public.event_counting_keys(date, date) to authenticated;

-- Event counts treat a joint pair as one event; km still sums per responder.
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
        count(distinct ek.event_key) as events,
        coalesce(sum(er.total_km) filter (
          where not er.frozen_over_60km and not er.frozen_suspicious_duplicate
        ), 0) as km,
        max(e.event_date) as last_date
      from public.events e
      join public.event_counting_keys(p_from, p_to) ek on ek.event_id = e.id
      join public.event_responders er on er.event_id = e.id
      where e.event_date between p_from and p_to
      group by er.responder_id
    ),
    shift_part as (
      select sr.responder_id, count(distinct s.id) as shifts, max(s.shift_date) as last_date
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
      greatest(ep.last_date, sp.last_date)
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
    join public.events ev on ev.id = er.event_id
    where ev.event_date between p_from and p_to
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
    count(distinct ek2.event_key) as event_count,
    0::bigint as shift_count,
    coalesce(sum(ek.km), 0) as km_total,
    max(e.event_date) as last_activity
  from public.events e
  left join event_km ek on ek.event_id = e.id
  join public.event_counting_keys(p_from, p_to) ek2 on ek2.event_id = e.id
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
