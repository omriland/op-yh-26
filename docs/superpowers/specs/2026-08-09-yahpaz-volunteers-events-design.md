# Yahpaz (יחפ״צ) — Volunteers & Events Platform — Design

**Date:** 2026-08-09  
**Repo:** `yhpz-2026`  
**Accounts:** Supabase + Netlify + Resend under `omriland@gmail.com`  
**Status:** Approved in brainstorming (architecture, status model, screens, infra slice); Resend + custom domain added as requirements.

## Problem

יחפ״צ is a road-recovery volunteer unit (חילוץ בכבישים). Shift-leads and responders need a structured way to log recovery events: create events in the field (often partial), assign multiple responders, capture event-level and per-responder details, and finish responder sections later online. Roles must see different things; Hebrew-only RTL UI.

## Goals (v1)

- Manage **users** (profiles, vehicles, roles) and **events** (structured reporting)
- Role-aware UX: Admin / Shift-lead / Responder
- Multiple responders per event; viewer-relative status
- Hebrew-only, full RTL, mobile-friendly card UI (inspired by responders / hebrew-card-manager)
- Stack: React (Vite) + Supabase + Netlify + Resend (transactional + Auth email)

## Non-goals (v1)

- True offline / PWA sync (fill-later while online only)
- Native iOS/Android apps
- Netlify Functions for privileged writes
- English UI
- Push notifications
- Reusing the old Lovable `yhpz-mgmt-sstm` codebase as source of truth

## Architecture

**Approach:** Vite + React + TypeScript SPA → Netlify static hosting → Supabase (Auth, Postgres, RLS). Client talks to Supabase directly; permissions enforced with RLS.

```
[Browser HE/RTL SPA]
       │
       ├─ Supabase Auth (email + password; SMTP via Resend)
       ├─ Supabase Postgres + RLS
       └─ (optional later) Resend API for app-triggered mail
[Netlify] serves dist/
[Resend]  sends Auth + transactional email from custom domain
```

### Roles

| Role | Capabilities |
|---|---|
| `admin` | Users, roles, vehicles CRUD; closed-list CRUD; can view all events |
| `shift_lead` | Create/edit events; assign responders; fill shift-lead-owned fields |
| `responder` | Complete own participation fields on assigned events |
| Combo | A user may be both shift-lead and responder; on a given event they may act as the assigned responder |

### Core tables (logical)

- `profiles` — full_name, email, callsign, phone
- `vehicles` — per user: plate_number, model (1..n)
- `user_roles` — `admin` \| `shift_lead` \| `responder`
- Lookup tables (admin-managed): `districts` (שלוחה), `event_types` (סוג אירוע), `roads` (כביש), `vehicle_kinds` (סוגי רכב לטיפול)
- `events` — event-level fields + status
- `event_responders` — per-participation fields + status
- `event_treated_vehicles` — per participation: vehicle_kind × count

### Event-level fields

| HE | EN column (draft) | Filled by |
|---|---|---|
| אחמ״ש | `shift_lead_id` (+ denormalized name/callsign optional) | Auto (creator) |
| תאריך | `event_date` | Shift-lead (default today) |
| מספר אירוע | `police_event_id` | Shift-lead |
| שלוחה | `district_id` | Shift-lead |
| או״ק ניידת | `patrol_callsign` | Shift-lead |
| סוג אירוע | `event_type_id` | Shift-lead |
| הערות | `notes` | Shift-lead |
| כביש | `road_id` | Shift-lead |
| מיקום | `location` | Shift-lead |

### Per-responder fields (`event_responders`)

| HE | EN column (draft) | Filled by |
|---|---|---|
| שם כונן ואו״ק | `responder_id` | Shift-lead (multi from users) |
| לוחית רישוי | `vehicle_plate` | Responder |
| קילומטרים | `total_km` | Shift-lead |
| ק"מ התחלה | `odometer_start` | Responder |
| ק"מ סיום | `odometer_end` | Responder |
| נתיב נסיעה | `route` | Responder |
| פירוט הטיפול | `treatment_detail` | Responder |
| רכבים שטופלו | via `event_treated_vehicles` | Shift-lead |
| אמצעים | `emergency_means` (boolean) | Shift-lead |
| הערות לטיפול | `treatment_notes` | Responder |

## Status model

### Per participation (`event_responders.status`)

| Status | Meaning |
|---|---|
| `pending` | Assigned; responder section incomplete |
| `in_progress` | Partially filled by responder |
| `done` | Responder completed required fields |

### Event (`events.status`)

| Status | Rule |
|---|---|
| `draft` | Created; event-level still incomplete / not fully saved by lead |
| `in_progress` | Lead working the live run / participations underway |
| `partial` | Lead side saved; not all responders `done` |
| `done` | **All** assigned responders are `done` (automatic) |

### Viewer labels (UI)

- Responder whose row is `done` → הושלם
- Responder whose row is open → ממתין למילוי פרטים
- Shift-lead while event ≠ `done` after lead save → הושלם חלקית
- Event `done` → הושלם / נשמר

## Screens (HE / RTL, mobile-first cards)

- Login
- Home / event list (role-filtered, status chips)
- Event detail (event block + responder cards)
- Shift-lead: create/edit event, assign responders, lead-owned fields
- Responder: “האירועים שלי”, complete own section
- Admin: users + vehicles + roles; closed lists CRUD

## Auth & email (Resend)

- Supabase Auth: **email + password**
- **Resend** as custom SMTP for Supabase Auth emails (invite / reset / confirm) and later app transactional mail
- Sending domain on Resend (verified DNS: SPF/DKIM/etc.)
- Setup via Resend MCP when domain DNS is available; secrets in Supabase + Netlify env (never committed)

## Custom domain

- Domain: **yahpz.com** (purchased on Cloudflare Registrar)
- App on Netlify (`yahpaz-2026`); custom domain + `www` attached
- DNS stays on Cloudflare: apex A → Netlify load balancer `75.2.60.1`; `www` CNAME → `yahpaz-2026.netlify.app`
- Resend sending domain for `yahpz.com` pending (free plan already has `send.responders-tlv.com`)

## Infra bootstrap slice (first implementation)

1. Scaffold Vite/React/TS in this repo (`lang=he`, `dir=rtl`)
2. Supabase project + migrations (core tables + RLS stubs)
3. Supabase client + Auth wired
4. Netlify site + `netlify.toml`
5. Resend domain + Supabase SMTP (once domain exists)
6. Smoke shell: login + empty HE home

## Errors

- Auth failures → clear Hebrew messages
- RLS denials → אין הרשאה (no silent empty for forbidden actions)
- Partial save allowed; required-field validation tightens on status transitions

## Testing (v1)

- `tsc` + production build pass
- Manual smoke with seeded Admin / Shift-lead / Responder
- RLS verified under each role

## Open decisions (non-blocking for infra)

- Exact domain name to buy
- Final Hebrew copy for status chips
- Seed values for closed lists (שלוחות, כבישים, etc.) — Admin can add after launch
- Whether `total_km` should later auto-calc from odometer start/end (v1: manual by shift-lead as specified)
