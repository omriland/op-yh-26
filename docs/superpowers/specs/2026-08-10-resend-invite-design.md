# Resend invite + pending users

Approved 2026-08-10. Approach B.

## Decisions

- Invite / OTP link expiry: **24 hours** (86400s)
- Pending = `profiles.invite_pending` (not Auth `email_confirmed_at` — scanners can confirm early)
- Last-login column shows `ממתין להרשמה`; sort pending → active → inactive
- Invite redeem is **click-gated** (`המשך להגדרת סיסמה`) so email scanners cannot burn the OTP
- Overflow: `שליחת הזמנה מחדש` (email + copy link) and `העתקת קישור הזמנה`
- Resend falls back to recovery token if Auth already considers the user registered

## Out of scope

- Mobile overflow / resend on cards
- Auto-reminders
- Invite email copy changes
