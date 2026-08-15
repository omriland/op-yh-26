-- Admin unit-wide email / SMS broadcast log (writes via Edge service_role)

create table public.unit_broadcasts (
  id uuid primary key default gen_random_uuid(),
  sent_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  channel text not null check (channel in ('email', 'sms', 'both')),
  audience text not null check (audience in ('all', 'admins', 'shift_leads')),
  subject text not null default '',
  body text not null,
  recipient_count integer not null default 0,
  skipped_no_phone integer not null default 0,
  skipped_no_email integer not null default 0,
  failed_count integer not null default 0
);

create index unit_broadcasts_created_idx
  on public.unit_broadcasts (created_at desc);

comment on table public.unit_broadcasts is
  'Admin unit-wide email/SMS broadcasts; written only by Edge service_role.';

alter table public.unit_broadcasts enable row level security;

create policy unit_broadcasts_admin_select on public.unit_broadcasts
  for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));
