-- Audit trail for Super Admin impersonation (service_role writes only)

create table public.impersonation_audit (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references public.profiles (id),
  target_user_id uuid references public.profiles (id),
  action text not null check (action in ('started', 'stopped', 'denied')),
  reason text,
  created_at timestamptz not null default now()
);

create index impersonation_audit_actor_created_idx
  on public.impersonation_audit (actor_user_id, created_at desc);

comment on table public.impersonation_audit is
  'Super Admin impersonation start/stop/denied events; written only by Edge service_role.';

alter table public.impersonation_audit enable row level security;
-- No policies for authenticated/anon → deny all via Data API.
