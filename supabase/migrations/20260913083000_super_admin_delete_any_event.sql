-- Super admin may delete any event, including ones created by other leads or admins.
-- Child RLS (media, prefs, locked secondaries) blocked table DELETE + CASCADE.
-- Security definer bypasses those child policies after an explicit role check.

create or replace function public.delete_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead uuid;
  v_created timestamptz;
begin
  if auth.uid() is null then
    raise exception 'אין הרשאה';
  end if;

  select e.shift_lead_id, e.created_at
    into v_lead, v_created
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
     and v_lead is not distinct from auth.uid()
     and v_created >= (now() - interval '2 hours') then
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

drop policy if exists events_delete_admin on public.events;
create policy events_delete_admin on public.events
for delete to authenticated
using (
  public.has_role(auth.uid(), 'admin'::app_role)
  or public.has_role(auth.uid(), 'super_admin'::app_role)
);
