-- Idempotent: create missing origin=shift events for existing type-counts
-- (mock / pre-feature shifts never ran sync_shift_born_events).

insert into public.events (shift_lead_id, event_date, event_type_id, status, origin, shift_id)
select s.shift_lead_id, s.shift_date, c.event_type_id, 'in_progress', 'shift', s.id
from public.shift_event_type_counts c
join public.shifts s on s.id = c.shift_id
cross join lateral generate_series(
  1,
  greatest(
    0,
    c.count - (
      select count(*)::int
      from public.events e
      where e.origin = 'shift'
        and e.shift_id = c.shift_id
        and e.event_type_id = c.event_type_id
    )
  )
) as g(n)
where c.count > 0;

insert into public.event_responders (event_id, responder_id, status)
select e.id, sr.responder_id, 'pending'
from public.events e
join public.shift_responders sr on sr.shift_id = e.shift_id
where e.origin = 'shift'
on conflict (event_id, responder_id) do nothing;
