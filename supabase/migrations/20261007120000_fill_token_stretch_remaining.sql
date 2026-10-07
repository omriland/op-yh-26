-- Fill-email links must stay valid for six months and stay reusable.
-- Stretch any remaining short-lived or already-expired hashes so emails
-- already in inboxes keep working. Tokens that already have more than two
-- weeks of life (the 180-day window) are left alone so later Deploy Edge
-- Functions runs do not keep resetting the clock.

update public.event_responders
set fill_token_expires_at = now() + interval '180 days'
where fill_token_hash is not null
  and (
    fill_token_expires_at is null
    or fill_token_expires_at <= now() + interval '14 days'
  );

comment on column public.event_responders.fill_token_expires_at is
  'Fill token expiry (typically 180 days from mint). Reusable until then.';
