-- Track invitees who have not finished choosing a password in the app.
-- email_confirmed_at alone is wrong: verifyOtp (or an email scanner) confirms
-- the address before the user completes registration.

alter table public.profiles
  add column if not exists invite_pending boolean not null default false;

comment on column public.profiles.invite_pending is
  'True until the invitee sets a password in the app; drives ממתין להרשמה.';

-- Anyone not yet confirmed in Auth is still pending.
update public.profiles p
set invite_pending = true
from auth.users u
where u.id = p.id
  and u.email_confirmed_at is null;
