comment on table public.oauth_access_tokens is
  'Partner bearer tokens. 60 day TTL, no refresh.';

update public.oauth_access_tokens
set expires_at = created_at + interval '60 days'
where revoked_at is null
  and expires_at > now();
