-- Audit trail for Cobrowse.io support sessions (written by the user's own browser)

create table public.cobrowse_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  agent_name text,
  action text not null check (
    action in ('requested', 'approved', 'declined', 'control_approved', 'control_declined', 'ended')
  ),
  created_at timestamptz not null default now()
);

create index cobrowse_audit_user_created_idx
  on public.cobrowse_audit (user_id, created_at desc);

comment on table public.cobrowse_audit is
  'Cobrowse.io session requests / approvals / ends; users insert their own rows only, read via service_role.';

alter table public.cobrowse_audit enable row level security;

create policy cobrowse_audit_insert_own on public.cobrowse_audit
for insert to authenticated
with check (user_id = auth.uid());
-- No select/update/delete policies → deny via Data API.
