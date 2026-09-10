-- Raise the event KM freeze / exception threshold from 60 to 80.
-- Column and RPC names stay `*_over_60km` / `over_60km` (schema contract).
-- Inclusion: lead-entered event_responders.total_km >= 80.

create or replace function public.event_matches_over_60km(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.event_responders er
    where er.event_id = p_event_id
      and er.total_km is not null
      and er.total_km >= 80
  );
$$;

create or replace function public.event_has_pending_over_60km(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.event_responders er
    join public.events e on e.id = er.event_id
    where er.event_id = p_event_id
      and er.total_km is not null
      and er.total_km >= 80
      and not (er.responder_id = any (e.approved_over_60km_responder_ids))
  );
$$;

create or replace function public.approve_event_freeze(p_event_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin'::app_role) then
    raise exception 'אין לך הרשאה לפעולה זו.';
  end if;

  if p_reason not in ('over_60km', 'suspicious_duplicate') then
    raise exception 'סיבת הקפאה לא תקינה.';
  end if;

  if not exists (select 1 from public.events where id = p_event_id) then
    raise exception 'האירוע אינו קיים.';
  end if;

  perform set_config('yahpaz.approving_event_freeze', '1', true);

  if p_reason = 'over_60km' then
    update public.events e
    set
      approved_over_60km = true,
      approved_over_60km_responder_ids = (
        select coalesce(array_agg(distinct rid), '{}'::uuid[])
        from (
          select unnest(e.approved_over_60km_responder_ids) as rid
          union
          select er.responder_id
          from public.event_responders er
          where er.event_id = e.id
            and er.total_km is not null
            and er.total_km >= 80
        ) s
      )
    where e.id = p_event_id;
  else
    update public.events
    set approved_suspicious_duplicate = true
    where id = p_event_id;
  end if;

  perform public.refresh_event_freeze(p_event_id);
end;
$$;

comment on column public.events.approved_over_60km is
  'Admin approved this event for fuel refund despite matching the high-km exceptions report (lead total_km >= 80).';

comment on column public.events.frozen_over_60km is
  'Computed: on the high-km report (lead total_km >= 80, pending) and not approved. Clients must not write this.';

comment on column public.events.approved_over_60km_responder_ids is
  'Responder ids whose over-threshold km situation was already admin-approved. A new id at/above 80 km re-freezes.';

do $$
begin
  perform set_config('yahpaz.refreshing_event_freeze', '1', true);
  update public.events
  set
    frozen_over_60km = public.event_has_pending_over_60km(id),
    frozen_suspicious_duplicate =
      public.event_matches_suspicious_duplicate(id) and not approved_suspicious_duplicate;
end;
$$;
