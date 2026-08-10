# Resend invite + pending users

Approved 2026-08-10. Approach B.

## Decisions

- Invite / OTP link expiry: **7 days** (604800s)
- Pending = `auth.users.email_confirmed_at IS NULL`
- UI: chip `ממתין להרשמה`; sort pending → active confirmed → inactive
- Resend: overflow menu only — `שליחת הזמנה מחדש` → edge `resend_invite` (regenerate link + same Resend email)

## Out of scope

- Mobile overflow / resend on cards
- Auto-reminders
- Invite email copy changes
