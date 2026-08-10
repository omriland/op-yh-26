-- Durable invite token for email links. Reusable until the invitee sets a
-- password (invite_pending cleared). Auth OTP hashes stay one-time and are
-- minted fresh on each "המשך להגדרת סיסמה" click.

alter table public.profiles
  add column if not exists invite_token uuid unique;

alter table public.profiles
  add column if not exists invite_token_expires_at timestamptz;

comment on column public.profiles.invite_token is
  'Unguessable invite URL secret; valid while invite_pending and before expires_at.';
