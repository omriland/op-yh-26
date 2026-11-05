-- Deleting an event cascades to event_secondary_leads. A locked אחמ״ש משני
-- (including one locked by an automatic map-pin write) made that cascade raise
-- 'לא ניתן להסיר אחמ״ש משני שננעל בעריכה.' and the whole delete rolled back.
-- The event delete already stamps yahpaz.deleting_event_id. Honor that stamp
-- here. Removing a locked secondary while the event stays is unchanged.

create or replace function public.enforce_event_secondary_lead_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_main uuid;
begin
  if tg_op = 'DELETE' then
    if old.locked
       and current_setting('yahpaz.deleting_event_id', true)
         is distinct from old.event_id::text then
      select e.shift_lead_id into v_main from public.events e where e.id = old.event_id;
      -- Promoting a locked secondary to main deletes their secondary row.
      if v_main is distinct from old.user_id then
        raise exception 'לא ניתן להסיר אחמ״ש משני שננעל בעריכה.';
      end if;
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and old.locked and new.locked = false then
    raise exception 'לא ניתן להסיר אחמ״ש משני שננעל בעריכה.';
  end if;

  select e.shift_lead_id into v_main from public.events e where e.id = new.event_id;
  if v_main is not null and v_main = new.user_id then
    raise exception 'אחמ״ש ראשי אינו יכול להיות גם משני.';
  end if;

  if not public.has_role(new.user_id, 'shift_lead') then
    raise exception 'אחמ״ש משני חייב להיות משתמש עם תפקיד אחמ״ש.';
  end if;

  return new;
end;
$$;
