# Yahpaz — Unit broadcast (תפוצה לכלל היחידה)

**Date:** 2026-08-15  
**Status:** Implemented

## Problem

Admins need a single official way to push a free-text message to the unit by email, SMS, or both — without going through personal WhatsApp lists.

## Decisions

| Topic | Choice |
|---|---|
| Who | `admin` only (not אחמ״ש). Impersonation cannot send. |
| Copy | Admin writes the text. Email: subject + body. SMS: body only. |
| Channel | `email` / `sms` / `both` |
| Audience | `all` / `admins` / `shift_leads` |
| Eligible | `profiles.active` and not `invite_pending` |
| Missing contact | Skip and report the skip count. Do not block the rest. |
| Confirm | Dialog with recipient count, channel, and skips before send. |
| History | Send log (who / when / channel / audience / text / counts). No per-recipient delivery rows. |
| Nav | Inside **הגדרות**, second menu card **תפוצה לכלל היחידה** (not a top-level ניהול tab). |
| Pipes | Resend (existing invite sender) + Soprano SMS (existing OTP account). |

## Flow

1. Admin opens **הגדרות** → **תפוצה לכלל היחידה**.
2. Picks channel + audience, writes subject (if email) and body.
3. UI previews how many active users will be reached and how many will be skipped.
4. Confirm → Edge Function `unit-broadcast` re-resolves recipients from the DB (client list is not trusted) and sends.
5. Row written to `unit_broadcasts`. Toast: sent / skipped / failed.

## Out of scope

- Templates, scheduled send, per-recipient delivery log
- Shift-lead access, district targeting, in-app inbox
- Resend-from-history
