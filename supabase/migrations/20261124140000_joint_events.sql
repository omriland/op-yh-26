-- Joint events: on one event_date a police_event_id may be held by at most one
-- non-cancelled manual event AND at most one non-cancelled shift event. Two
-- manual or two shift events with the same number and date stay rejected.
-- A joint pair keeps both records; nothing is copied or deleted.
-- Replayed on every edge-function deploy: in one transaction with each file that
-- restores an older trigger or freeze body, and once more after 20261124120000.

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

-- Same-day events sharing a number, from any origin. The forms need this to
-- decide between free, joint confirm and duplicate; a crew member cannot read
-- other people's events through RLS, so this runs as definer and returns only
-- the columns the decision needs.
create or replace function public.same_day_police_event_rows(
  p_event_date date,
  p_police_event_id text
)
returns table (
  id uuid,
  event_date date,
  police_event_id text,
  is_cancelled boolean,
  shift_lead_id uuid,
  origin public.event_origin
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  return query
  select e.id, e.event_date, e.police_event_id, e.is_cancelled, e.shift_lead_id, e.origin
  from public.events e
  where e.event_date = p_event_date
    and btrim(e.police_event_id) = btrim(p_police_event_id)
    and e.is_cancelled = false
    and e.is_demo = public.is_app_review_demo_caller();
end;
$$;

revoke all on function public.same_day_police_event_rows(date, text) from public;
revoke all on function public.same_day_police_event_rows(date, text) from anon;
grant execute on function public.same_day_police_event_rows(date, text) to authenticated;

-- The other event of a joint pair: same date, same number, other origin, at the
-- same position in id order within its origin (the pairing event_counting_keys uses).
create or replace function public.joint_event_partner(p_event_id uuid)
returns table (partner_id uuid, partner_origin public.event_origin, partner_shift_id uuid)
language sql
stable
security invoker
set search_path = public
as $$
  with this_event as (
    select e.id, e.is_demo, e.event_date, btrim(e.police_event_id) as police_id
    from public.events e
    where e.id = p_event_id
      and e.is_cancelled = false
      and nullif(btrim(coalesce(e.police_event_id, '')), '') is not null
  ),
  same_number as (
    select
      e.id,
      e.origin,
      e.shift_id,
      row_number() over (partition by e.origin order by e.id) as position_in_origin
    from public.events e
    join this_event t
      on t.is_demo = e.is_demo
     and t.event_date = e.event_date
     and t.police_id = btrim(e.police_event_id)
    where e.is_cancelled = false
  )
  select partner.id, partner.origin, partner.shift_id
  from same_number own
  join same_number partner
    on partner.origin <> own.origin
   and partner.position_in_origin = own.position_in_origin
  where own.id = p_event_id;
$$;

revoke all on function public.joint_event_partner(uuid) from public;
revoke all on function public.joint_event_partner(uuid) from anon;
grant execute on function public.joint_event_partner(uuid) to authenticated;

-- One row per event with its counting key. A manual and a shift event that
-- share a number and date (the nth of each, in id order) get the same key; the
-- manual half is the one that counts (is_counted), so a pair adds one event to
-- exactly one group even when the halves differ in road, type or lead. Every
-- other event, including legacy same-origin duplicates, keeps its own id and counts.
drop function if exists public.event_counting_keys(date, date);
create function public.event_counting_keys(p_from date, p_to date)
returns table (event_id uuid, event_key text, is_counted boolean)
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
    select
      n.id as event_id,
      md5(n.event_date::text || '|' || n.police_id || '|' || n.is_demo::text || '|' || n.position_in_origin::text) as joint_key,
      n.origin = 'manual' as is_counted
    from numbered n
    where exists (
      select 1 from numbered other
      where other.origin <> n.origin
        and other.is_demo = n.is_demo
        and other.event_date = n.event_date
        and other.police_id = n.police_id
        and other.position_in_origin = n.position_in_origin
    )
  )
  select e.id, coalesce(j.joint_key, e.id::text), coalesce(j.is_counted, true)
  from public.events e
  left join joint j on j.event_id = e.id
  where e.event_date between p_from and p_to;
$$;

revoke all on function public.event_counting_keys(date, date) from public;
revoke all on function public.event_counting_keys(date, date) from anon;
grant execute on function public.event_counting_keys(date, date) to authenticated;

-- Joint pairs must not be frozen as suspected duplicates: same date and place
-- within 30 minutes is exactly what a pair looks like. Same body as
-- 20260910140000 plus the exemption.
create or replace function public.refresh_event_freeze(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_event_id is null then
    return;
  end if;
  if current_setting('yahpaz.deleting_event_id', true) is not distinct from p_event_id::text then
    return;
  end if;
  if not exists (select 1 from public.events where id = p_event_id) then
    return;
  end if;

  perform set_config('yahpaz.refreshing_event_freeze', '1', true);

  with wanted as (
    select
      er.id,
      (
        er.total_km is not null
        and er.total_km >= 80
        and not (er.responder_id = any (e.approved_over_60km_responder_ids))
      ) as over_km,
      (
        not e.approved_suspicious_duplicate
        and er.started_at is not null
        and nullif(btrim(coalesce(e.location, '')), '') is not null
        and exists (
          select 1
          from public.event_responders other
          join public.events other_event on other_event.id = other.event_id
          where other.responder_id = er.responder_id
            and other.event_id <> er.event_id
            and other_event.event_date = e.event_date
            and btrim(coalesce(other_event.location, '')) = btrim(e.location)
            and other.started_at is not null
            and abs(extract(epoch from (er.started_at - other.started_at))) <= 1800
            -- A joint pair is one real event recorded twice, not a duplicate.
            and not (
              other_event.origin <> e.origin
              and other_event.is_demo = e.is_demo
              and other_event.is_cancelled = false
              and nullif(btrim(coalesce(e.police_event_id, '')), '') is not null
              and btrim(coalesce(other_event.police_event_id, '')) = btrim(e.police_event_id)
            )
        )
      ) as duplicate
    from public.event_responders er
    join public.events e on e.id = er.event_id
    where er.event_id = p_event_id
  )
  update public.event_responders er
  set
    frozen_over_60km = wanted.over_km,
    frozen_suspicious_duplicate = wanted.duplicate
  from wanted
  where wanted.id = er.id
    -- Only real transitions: refresh fans out across a responder's whole day,
    -- and a no-op write would still fire the audit trigger.
    and (
      er.frozen_over_60km is distinct from wanted.over_km
      or er.frozen_suspicious_duplicate is distinct from wanted.duplicate
    );

  update public.events e
  set
    frozen_over_60km = agg.over_km,
    frozen_suspicious_duplicate = agg.duplicate
  from (
    select
      exists (
        select 1
        from public.event_responders er
        where er.event_id = p_event_id
          and er.frozen_over_60km
      ) as over_km,
      exists (
        select 1
        from public.event_responders er
        where er.event_id = p_event_id
          and er.frozen_suspicious_duplicate
      ) as duplicate
  ) agg
  where e.id = p_event_id
    and (
      e.frozen_over_60km is distinct from agg.over_km
      or e.frozen_suspicious_duplicate is distinct from agg.duplicate
    );
end;
$$;

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
    count(*) filter (where ek2.is_counted) as event_count,
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
