-- Fill-email links used to expire after 7 days. Volunteers often log an event
-- weeks later, so stretch the token to 180 days. Re-running this file only
-- touches hashes that still look like the old 7-day window (or are already
-- expired), so later Deploy Edge Functions runs do not keep resetting fresh
-- six-month tokens.

update public.event_responders
set fill_token_expires_at = now() + interval '180 days'
where fill_token_hash is not null
  and (
    fill_token_expires_at is null
    or fill_token_expires_at <= now() + interval '8 days'
  );

comment on column public.event_responders.fill_token_expires_at is
  'Fill token expiry (typically 180 days from mint).';
