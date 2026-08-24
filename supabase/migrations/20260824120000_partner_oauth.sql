-- Partner OAuth (Telegram bot): clients, authorization codes, access tokens.
-- Edge service-role only — no authenticated client access.

create table public.oauth_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client_id text not null unique,
  client_secret_hash text not null,
  telegram_bot_username text not null,
  is_active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint oauth_clients_telegram_username_format check (
    telegram_bot_username ~ '^[A-Za-z0-9_]{5,32}$'
  )
);

create unique index oauth_clients_telegram_bot_username_lower_idx
  on public.oauth_clients (lower(telegram_bot_username));

create table public.oauth_authorization_codes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.oauth_clients (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  code_hash text not null unique,
  redirect_uri text not null,
  state text,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index oauth_authorization_codes_user_client_idx
  on public.oauth_authorization_codes (user_id, client_id);

create table public.oauth_access_tokens (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.oauth_clients (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index oauth_access_tokens_one_active_idx
  on public.oauth_access_tokens (client_id, user_id)
  where revoked_at is null;

create index oauth_access_tokens_user_idx
  on public.oauth_access_tokens (user_id)
  where revoked_at is null;

comment on table public.oauth_clients is
  'Registered partner apps (Telegram bot). Secrets hashed; Edge service-role only.';
comment on table public.oauth_authorization_codes is
  'One-time Telegram start params. 5 minute TTL.';
comment on table public.oauth_access_tokens is
  'Partner bearer tokens. 7 day TTL, no refresh.';

alter table public.oauth_clients enable row level security;
alter table public.oauth_authorization_codes enable row level security;
alter table public.oauth_access_tokens enable row level security;

revoke all on public.oauth_clients from public, anon, authenticated;
revoke all on public.oauth_authorization_codes from public, anon, authenticated;
revoke all on public.oauth_access_tokens from public, anon, authenticated;
