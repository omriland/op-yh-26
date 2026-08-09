# Yahpaz (יחפ״צ) — Project Memory

Last updated: 2026-08-09

## What this is

Web app for Yahpaz road-recovery volunteer unit (חילוץ בכבישים): manage volunteers/users and recovery **events**. Hebrew-only, full RTL, mobile-friendly.

Repo: `yhpz-2026`

## Accounts / hosting

| Service | Detail |
|---|---|
| Owner email | `omriland@gmail.com` |
| Supabase | Project `yahpaz-2026`, ref `rtvizpsfvtjowbimugns`, region `eu-central-1`, ~$10/mo |
| Supabase URL | `https://rtvizpsfvtjowbimugns.supabase.co` |
| Netlify | Site `yahpaz-2026`, id `d737d9f2-cda4-4f35-83f0-e44332fb52bd` |
| Netlify URL | https://yahpaz-2026.netlify.app |
| Custom domain | **yahpz.com** (+ www) on Netlify; DNS on Cloudflare |
| Cloudflare zone | `yahpz.com` id `0840a05bc431c56eb3479042a1e7f2ee` |
| DNS records | A `@` → `75.2.60.1` (DNS only); CNAME `www` → `yahpaz-2026.netlify.app` (DNS only) |
| Resend | Blocked: free plan already has `send.responders-tlv.com` — need upgrade or remove that domain before adding `yahpz.com` |

## Auth / admin seed

- Auth: email + password (Supabase)
- Seed admin: `omriland@gmail.com` — profile Omri Landman / callsign Admin — role `admin`
- Profile auto-created via `handle_new_user` trigger on `auth.users`

## Product decisions (locked)

- Roles: Admin (users + closed lists), Shift-lead (events), Responder (own participation fields)
- Multiple responders per event; each has own details
- Event auto-`done` when **all** assigned responders are `done`; shift-lead sees **partial** until then
- Viewer-relative labels
- Online fill-later (not true offline PWA)
- Closed lists admin-managed: districts, event types, roads, vehicle kinds
- UI HE/RTL only; EN column names in DB

### Event statuses

`draft` → `in_progress` → `partial` → `done`

### Participation statuses

`pending` → `in_progress` → `done`

## Schema (high level)

- `profiles`, `vehicles`, `user_roles`
- Lookups: `districts`, `event_types`, `roads`, `vehicle_kinds`
- `events`, `event_responders`, `event_treated_vehicles`
- RLS stubs in place; migration: `supabase/migrations/20260809120000_init.sql`

## Design reference

Inspire UX/visuals from **`/Users/omrilandman/CursorProjects/hebrew-card-manager`** (Responders TLV):

- Fonts: Varela Round, Assistant, Heebo
- Ops tokens: `--ops-ink` `#0B1220`, `--ops-panel` `#141C2B`, `--ops-fog` `#E8EDF5`, `--ops-signal` `#3D8BFF`, `--ops-ok` `#3D9A6E`
- Auth: dark hero + white login panel (desktop split); mobile dark gradient
- Cards, mobile-first volunteer chrome

## Current app state

- Scaffold + Auth gate deployed; **UI restyled** to hebrew-card-manager ops language (dark hero login, ops-ink status bar, fog background, Varela/Assistant fonts)
- `.cursor/` rules + `memory/MEMORY.md` in place (always-apply: read/update memory)
- Full event/admin UI **not** built yet

## Open / next

0. **BLOCKED on design system docs** — Omri is writing MD design-instruction files; do **not** start further UI/feature work until he says those files are ready. Then build a proper design system from them.
1. Resend domain for `yahpz.com` (plan limit)
2. Supabase Auth Site URL / redirect URLs → `https://yahpz.com`
3. Event list + create/edit flows; admin users + lookups UI
4. Commit git history when Omri asks

## Do not

- Hardcode secrets in repo
- English UI strings in product surfaces
- Netlify Functions in v1 (RLS-only client)
- True offline sync in v1
