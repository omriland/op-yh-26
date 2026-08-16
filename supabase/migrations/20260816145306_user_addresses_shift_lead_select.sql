-- Shift leads need to read unit addresses for the מפה tab.

drop policy if exists user_addresses_select_own_or_admin on public.user_addresses;

create policy user_addresses_select_own_or_ops
  on public.user_addresses
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'shift_lead')
  );
