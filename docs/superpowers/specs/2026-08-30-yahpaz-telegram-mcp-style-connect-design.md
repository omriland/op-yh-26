# Yahpaz — Telegram MCP-style connect (revise)

**Date:** 2026-08-30  
**Repo:** `op-yh-26` (web + Edge + docs)  
**Status:** Approved (Approach 3)  
**Supersedes (linking UX only):** `2026-08-24-yahpaz-partner-responder-api-design.md` linking / profile connect sections  
**API surface:** unchanged — `responder:fill` via `partner-auth` + `responder-api`

## Problem

Partner OAuth already works (bot link → consent → code → 60-day token → fill API), but the connect surface is noisy: long authorize URLs, profile **חבר לטלגרם**, and docs that do not match the intended “connect once, then use tools” mental model.

## Goals

- Bot-initiated connect only (short link)
- Profile **חיבורים**: status + revoke only
- Docs/Swagger framed as an MCP-style connection (HTTP actions stay as today — no MCP wire protocol)
- Keep fill-only API, 60-day opaque token, admin bot registration

## Non-goals

- Real MCP server / JSON-RPC tools transport
- Expanding scope beyond `responder:fill`
- Changing token TTL, refresh, or media rules
- Android / iOS clients of this API

## Decisions

| Topic | Choice |
|---|---|
| Authorize URL | Required: `client_id` + `state`. Optional: `redirect_uri`, `scope` (if present must still be valid). Missing → derive `https://t.me/<registered_bot>` and `responder:fill` |
| Profile | Section **חיבורים** — list live grants + **בטל גישה**. No connect CTA |
| Empty profile | Copy points volunteers to start from the Telegram bot |
| Partner docs | “MCP-style connection”: authorize once, then call HTTP actions as tools |
| Backward compat | Old long authorize URLs still accepted when params are valid |

## Flow

```
Telegram bot → https://yahpz.com/oauth/authorize?client_id=&state=
            → login if needed
            → אשר / לא עכשיו
            → t.me/<bot>?start=yp_…
            → POST partner-auth action=token
            → Bearer ypat_… on responder-api (same actions as before)
```

Profile **חיבורים** revokes; bot `/unlink` still uses partner-auth `revoke` with the secret.

## Web / Edge changes

- `parseOAuthAuthorizeRequest`: require only `client_id` + `state`; default scope; allow omitted `redirect_uri`
- Consent page: on approve, omit or send derived `redirect_uri` from `client_info`
- `partner-auth` `authorize`: if `redirect_uri` empty, use registered bot URI; still reject mismatches
- `admin_create_client` `authorize_url`: short form (`client_id` + `state=STATE`)
- Remove profile connect (`connectPartnerApp` / MessageSquare CTA)
- Design-system: `oauth-authorize.md`, `profile.md` חיבורים

## Testing

- Vitest: short authorize parse; reject bad scope; still accept full URL
- Manual: bot link consent → Telegram start; profile revoke only
