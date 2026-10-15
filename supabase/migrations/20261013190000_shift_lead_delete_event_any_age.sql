-- The 7-day rule blocks editing. It does not block deletion.
-- An owning shift lead may delete their event at any age, including after
-- that lock. Admin and super_admin are unchanged.

create or replace function public.delete_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead uuid;
begin
  if auth.uid() is null then
    raise exception 'אין הרשאה';
  end if;

  select e.shift_lead_id
    into v_lead
  from public.events e
  where e.id = p_event_id;

  if not found then
    raise exception 'האירוע אינו קיים.';
  end if;

  if public.has_role(auth.uid(), 'super_admin') then
    delete from public.events where id = p_event_id;
    return;
  end if;

  if public.has_role(auth.uid(), 'admin') then
    delete from public.events where id = p_event_id;
    return;
  end if;

  if public.has_role(auth.uid(), 'shift_lead')
     and v_lead is not distinct from auth.uid() then
    delete from public.events where id = p_event_id;
    return;
  end if;

  if v_lead is distinct from auth.uid() then
    raise exception 'אין הרשאה למחוק אירוע שנוצר על ידי אחמ״ש אחר.';
  end if;

  raise exception 'מחיקת האירוע נכשלה. בדקו את החיבור ונסו שוב.';
end;
$$;

revoke all on function public.delete_event(uuid) from public;
grant execute on function public.delete_event(uuid) to authenticated;
grant execute on function public.delete_event(uuid) to service_role;

drop policy if exists events_delete_cockpit_draft_lead on public.events;

create policy events_delete_cockpit_draft_lead on public.events
for delete to authenticated
using (
  has_role(auth.uid(), 'shift_lead'::app_role)
  and shift_lead_id = auth.uid()
);
