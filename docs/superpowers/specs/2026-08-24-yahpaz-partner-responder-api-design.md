# Yahpaz — Partner responder API (Telegram bot)

**Date:** 2026-08-24  
**Repo:** `op-yh-26` (web + Edge + DB)  
**Status:** Approved in brainstorming (Approach 1); remaining sections filled to implement  
**Official partner contract (share this):** https://yahpz.com/partner-api/ (Swagger) · spec `public/partner-api/openapi.yaml` · notes `docs/partner-api.md`  
**Depends on:** `2026-08-09-yahpaz-responder-fill-design.md`, treated plates, event media

## Problem

A trusted partner wants to build a **Telegram bot** so volunteers can complete their own standalone event reports in chat. They must not receive Yahpaz passwords, user JWTs, or the service-role key. The bot must list open assignments, fill the same fields as **השלמת הפרטים שלי** (including treated plates and media), and surface the same Hebrew field errors.

## Goals

- One registered partner app; volunteer **authorizes** it on yahpz.com
- Telegram starts the link; **חיבורים** on the profile revokes it
- 7-day opaque access token, **no refresh**; `/unlink` or revoke or expiry ends access
- Full standalone fill parity: plate, odometers, route, treatment, notes, treated plates, media
- Structured validation errors the bot can show in chat

## Non-goals (v1)

- MCP (same functions later, same tokens)
- Shifts / shift-born events (`origin = shift`)
- Creating or editing events, lead `total_km`, admin, tracking SMS
- Email fill-link photos (unchanged)
- iOS / Android clients of this API
- Public multi-app marketplace; PKCE (confidential client with a secret)

## Decisions (locked)

| Topic | Choice |
|---|---|
| Client | One trusted partner; `client_id` + hashed `client_secret` |
| Transport | HTTP Edge API, not PostgREST |
| Linking | `/oauth/authorize` from Telegram + **חיבורים** revoke |
| Completion | `https://t.me/<bot>?start=<one_time_code>` (Telegram 64-char start limit) |
| Token | Opaque bearer, 7 days, no refresh; re-link replaces the grant |
| Writes | Same rules as `validateResponderFillDraft` + plates + media |
| Media | JPEG only, max 1.5 MB already-compressed (partner compresses / Telegram size) |
| JWT gateway | `partner-auth` and `responder-api` deploy with `--no-verify-jwt`; functions authenticate themselves |

## Architecture

```
Telegram → yahpz.com/oauth/authorize
        → login + OTP (existing)
        → אשר / דחה
        → t.me/<bot>?start=yp_…
        → POST partner-auth action=token (code + client_secret)
        → Bearer ypat_… on responder-api
```

Yahpaz owns identity and writes. The partner owns Telegram and stores the bearer keyed by Telegram user id. We do **not** store Telegram user ids.

### Pieces

| Piece | Job |
|---|---|
| `oauth_clients` | Partner app: name, `client_id`, secret hash, Telegram bot username |
| `oauth_authorization_codes` | 5-minute, single-use start params |
| `oauth_access_tokens` | 7-day hashed bearers; `revoked_at` |
| Web `/oauth/authorize` | Login required; Hebrew consent; block impersonation |
| Profile **חיבורים** | List grant + expiry + **בטל גישה** |
| Profile (admin) **יישומים לשותפים** | Create client; show `client_id` + secret **once** |
| Edge `partner-auth` | client_info, authorize, token, revoke, list_grants, admin_* |
| Edge `responder-api` | Fill/plates/media for the token’s user |

## Data model

```sql
create table public.oauth_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client_id text not null unique,
  client_secret_hash text not null,
  telegram_bot_username text not null unique, -- no @
  is_active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

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

create table public.oauth_access_tokens (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.oauth_clients (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
```

RLS: **no** authenticated policies. Service-role Edge only. `revoke all from public, anon, authenticated`.

Start param charset: Telegram `[A-Za-z0-9_-]`, max 64. Format `yp_` + 32 chars. Access token `ypat_` + unpadded base64url (32 random bytes).

Re-link: new authorize consumes the previous unused codes for that user+client and, on token redeem, revokes prior access tokens for that pair.

## Linking (web)

URL: `https://yahpz.com/oauth/authorize?client_id=&redirect_uri=&state=&scope=responder:fill`

- `redirect_uri` must equal `https://t.me/<telegram_bot_username>` (optional trailing slash; username case-insensitive).
- `scope` must be `responder:fill` (only scope in v1).
- `state` required (partner CSRF); echoed only by putting it in the start flow on **their** side — we do not put `state` in `t.me` start (too small). Partner binds `state` to the Telegram user **before** opening the link, then trusts the start code that comes back on **that** chat. We still persist `state` on the code row for audit; the bot does not need it on redeem.

Logged-out visitors see existing login (same path). After OTP / password-setup, consent.

Consent copy (Hebrew): app name, what they grant (השלמת דיווחי אירועים: קילומטרים, טיפול, לוחיות, מדיה), 7 days, **אשר גישה** / **לא עכשיו**.

Deny: stay on a short “בוטל” card; no code issued.

Impersonation: cannot approve.

Inactive `profiles.active = false`: cannot approve.

## partner-auth actions

All `POST /functions/v1/partner-auth`. Partner sends `apikey` = anon key.

| action | Auth | Body | Result |
|---|---|---|---|
| `client_info` | user JWT | `client_id` | `{ name, telegram_bot_username }` |
| `authorize` | user JWT | `client_id`, `redirect_uri` | `{ redirect }` → `https://t.me/<bot>?start=yp_…` |
| `token` | `client_id` + `client_secret` | `code` | `{ access_token, token_type, expires_in, scope }` |
| `revoke` | secret + `token` **or** user JWT + `grant_id` | | `{ ok: true }` |
| `list_grants` | user JWT | | grants for this user (name, expiry, id) |
| `admin_create_client` | admin JWT | `name`, `telegram_bot_username` | `{ client_id, client_secret }` once |
| `admin_list_clients` | admin JWT | | clients without secrets |
| `admin_rotate_secret` | admin JWT | `client_id` | new secret once; existing access tokens stay until expiry/revoke |

Invalid client / secret: generic `יישום או סוד אינם תקינים.` (no user enumeration).

## responder-api actions

`POST /functions/v1/responder-api`  
Auth: `Authorization: Bearer ypat_…` **or** `X-Yahpaz-Partner-Token` + `apikey` anon.

Service role only after the token hashes, is unrevoked, unexpired, user active.

Scope: the token user’s **own** `event_responders` rows on `events.origin = 'manual'` only.

| action | Purpose |
|---|---|
| `whoami` | `user_id`, `full_name`, `callsign` |
| `list_open_events` | Assigned, participation not `done`, event not cancelled, origin manual |
| `get_event` | Context + draft + vehicles + plates + media (signed URLs, 1h) |
| `save_draft` | Partial field save → `in_progress` |
| `complete` | Validate required fields → `done` + `apply_event_status_from_participations` |
| `add_treated_plate` | 7/8 digits; lookup model/color; persist |
| `remove_treated_plate` | By digits |
| `lookup_treated_plate` | Registry hit or null (plate still addable) |
| `list_media` | Event gallery the crew can see |
| `upload_media` | JSON `{ event_id, taken_when, caption?, treated_plate_ids?, image_base64 }` JPEG ≤ 1.5 MB |
| `update_media` | Own photo metadata |
| `delete_media` | Own photo |

`save_draft` / `complete` body `draft`: `vehicle_plate`, `odometer_start`, `odometer_end`, `route`, `treatment_detail`, `treatment_notes`. Plates/media are incremental endpoints; complete validates stored plates (leftover pending N/A on API) and does not require photos.

Errors: HTTP 400 + `{ error, fieldErrors?, code }`. Same Hebrew strings as web fill.

Writes blocked when: participation `done` (except media add after complete, matching web), event `done` for fill fields, cancelled, not assigned, `origin = shift`.

Media after complete: assigned responder may still add; uploader edits/deletes own. Cancelled: view only.

## Security

- Secrets hashed (SHA-256 hex), compared in Edge
- Timing-safe string compare for secrets where practical
- No CORS for unknown browser origins (existing allowlist); partner is server-to-server
- Anon key is already public in the SPA; it is not authorization
- Partner never receives service role or user refresh tokens
- X-Frame-Options DENY already on Netlify (consent clickjacking)

## Testing

- URL parse / Telegram redirect / grant expiry (Vitest)
- Open-event filter (manual vs shift, cancelled, done)
- Web authorize / חיבורים smoke in browser after Edge deploy

## Out of scope follow-ups

- MCP wrapper
- Shift-born + משמרות
- Server-side image transcode (PNG/HEIC)
- Per-IP rate limits
