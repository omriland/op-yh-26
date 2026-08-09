# Yahpaz — Admin users + invite (slice A)

**Date:** 2026-08-09  
**Status:** Implemented

## Scope

- Admin `משתמשים` UI (list / create-edit / roles / vehicles / deactivate)
- Supabase Edge Function `admin-users` for invite + deactivate/reactivate
- Temporary Auth SMTP via Resend domain `send.responders-tlv.com`
- Closed lists deferred

## Architecture change vs original v1 non-goal

Original design forbade Netlify Functions and privileged browser writes. This slice adds a **Supabase Edge Function** (not Netlify) so the service role never ships to the client. Invite and ban still require Admin JWT + `has_role(..., 'admin')`.

Invites use `auth.admin.generateLink({ type: 'invite' })` + Resend HTTP API (`RESEND_API_KEY` Edge secret), not Supabase’s built-in SMTP mailer.

Invite redirect includes `?set_password=1`. The SPA captures invite/recovery markers before
`createClient` consumes the URL hash, then blocks the app shell until `updateUser({ password })`.

Password gate rules:
- `?set_password=1` alone after the auth hash is gone must not re-open the gate on refresh
- After a successful save: strip the query marker, show confirmation (`הסיסמה נשמרה` → `המשך למערכת`), then enter the app
- Password inputs are LTR-isolated (Latin secrets)

## Email

Temporary sender domain: `onboarding@send.responders-tlv.com`. Move to `yahpz.com` when Resend plan allows a second domain. SMTP must be configured in Supabase Auth (see README).

## Schema

- `profiles.active boolean not null default true`
- `handle_new_user` copies `phone` from user metadata
- `profiles_select_unit_visibility` retained for event teammate name resolution

## Verification checklist

- [ ] SMTP configured with Yahpaz Auth SMTP Resend key
- [ ] Auth Site URL + redirect allow-list includes production + localhost
- [ ] Admin creates user → invite email arrives → password set → login
- [ ] Deactivate blocks login; reactivate restores
- [ ] Non-admin cannot invoke `admin-users`
