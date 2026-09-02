-- Shift-leads may delete only events they created (shift_lead_id).
-- Admin delete policy is unchanged. Assigned responders may still
-- shrink their own shift's empty stubs via sync_shift_born_events.

drop policy if exists events_delete_cockpit_draft_lead on public.events;

create policy events_delete_cockpit_draft_lead on public.events
for delete to authenticated
using (
  has_role(auth.uid(), 'shift_lead'::app_role)
  and shift_lead_id = auth.uid()
  and created_at >= (now() - interval '2 hours')
  and not exists (
    select 1
    from public.event_responders er
    where er.event_id = events.id
  )
);

create or replace function public.sync_shift_born_events(p_shift_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift public.shifts%rowtype;
  v_is_lead boolean;
  v_type record;
  v_existing uuid[];
  v_empty uuid[];
  v_desired int;
  v_have int;
  v_need int;
  v_drop int;
  v_new_id uuid;
  i int;
begin
  select * into v_shift from public.shifts where id = p_shift_id;
  if not found then
    raise exception 'אין הרשאה';
  end if;

  v_is_lead :=
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'shift_lead');

  if not v_is_lead then
    if not public.is_assigned_to_shift(p_shift_id) then
      raise exception 'אין הרשאה';
    end if;
    if v_shift.shift_date > (timezone('Asia/Jerusalem', now()))::date then
      raise exception 'אין הרשאה';
    end if;
  end if;

  for v_type in
    select et.id as event_type_id, coalesce(c.count, 0) as desired
    from public.event_types et
    left join public.shift_event_type_counts c
      on c.event_type_id = et.id and c.shift_id = p_shift_id
  loop
    v_desired := v_type.desired;

    select coalesce(array_agg(e.id order by e.created_at), '{}')
    into v_existing
    from public.events e
    where e.origin = 'shift'
      and e.shift_id = p_shift_id
      and e.event_type_id = v_type.event_type_id;

    v_have := coalesce(cardinality(v_existing), 0);

    if v_desired > v_have then
      v_need := v_desired - v_have;
      for i in 1..v_need loop
        insert into public.events (
          shift_lead_id,
          event_date,
          event_type_id,
          status,
          origin,
          shift_id
        )
        values (
          v_shift.shift_lead_id,
          v_shift.shift_date,
          v_type.event_type_id,
          'in_progress',
          'shift',
          p_shift_id
        )
        returning id into v_new_id;
      end loop;
    elsif v_desired < v_have then
      select coalesce(array_agg(e.id order by e.created_at desc), '{}')
      into v_empty
      from public.events e
      where e.id = any (v_existing)
        and public.shift_born_event_is_empty(e.id);

      v_drop := v_have - v_desired;
      if coalesce(cardinality(v_empty), 0) < v_drop then
        raise exception 'לא ניתן להקטין — קיימים אירועים שמולאו';
      end if;

      if public.has_role(auth.uid(), 'shift_lead')
         and not public.has_role(auth.uid(), 'admin')
         and v_shift.shift_lead_id is distinct from auth.uid() then
        raise exception 'אין הרשאה למחוק אירוע שנוצר על ידי אחמ״ש אחר.';
      end if;

      delete from public.events
      where id in (select unnest(v_empty[1:v_drop]));
    end if;
  end loop;

  -- Types that disappeared from the closed list but still have events: treat desired as 0
  -- already covered because we iterate all event_types; leftover types with no count = 0.

  for v_new_id in
    select e.id
    from public.events e
    where e.origin = 'shift' and e.shift_id = p_shift_id
  loop
    insert into public.event_responders (event_id, responder_id, status)
    select v_new_id, sr.responder_id, 'pending'
    from public.shift_responders sr
    where sr.shift_id = p_shift_id
    on conflict (event_id, responder_id) do nothing;

    delete from public.event_responders er
    where er.event_id = v_new_id
      and not exists (
        select 1
        from public.shift_responders sr
        where sr.shift_id = p_shift_id and sr.responder_id = er.responder_id
      );
  end loop;
end;
$$;
