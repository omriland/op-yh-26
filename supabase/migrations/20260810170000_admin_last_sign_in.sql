-- Admin-only read of auth.users.last_sign_in_at for the users table
-- ("כניסה אחרונה" column). SECURITY DEFINER because auth schema is not
-- readable by app roles; returns nothing for non-admin callers.

create or replace function public.admin_list_last_sign_in()
returns table (user_id uuid, last_sign_in_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.last_sign_in_at
  from auth.users u
  where public.has_role(auth.uid(), 'admin');
$$;

revoke all on function public.admin_list_last_sign_in() from public;
grant execute on function public.admin_list_last_sign_in() to authenticated;
