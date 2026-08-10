-- Extend admin auth listing with email_confirmed_at so the users table
-- can mark invitees who have not finished registration.

drop function if exists public.admin_list_last_sign_in();

create function public.admin_list_last_sign_in()
returns table (
  user_id uuid,
  last_sign_in_at timestamptz,
  email_confirmed_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.last_sign_in_at, u.email_confirmed_at
  from auth.users u
  where public.has_role(auth.uid(), 'admin');
$$;

revoke all on function public.admin_list_last_sign_in() from public;
grant execute on function public.admin_list_last_sign_in() to authenticated;
