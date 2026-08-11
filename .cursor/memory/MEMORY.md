# Yahpaz (יחפ״צ) — Project Memory

Last updated: 2026-08-11

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
| DNS records | A `@` → `75.2.60.5` (DNS only; Netlify current apex LB); CNAME `www` → `yahpaz-2026.netlify.app` (DNS only) |
| Resend | Temp sender `send.responders-tlv.com` (choice 3); `yahpz.com` later when plan allows |

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
- **Kilometers for calculations / refunds:** only `event_responders.total_km` (lead-entered). `odometer_start` / `odometer_end` are logging only — never use them for sums, reports, or refunds.
- **Responder fill odometer:** user enters `odometer_start` only; `odometer_end` is read-only `start + total_km`. Draft OK without lead km; complete requires `total_km > 0`. Spec: `2026-08-11-auto-odometer-end-design.md`.

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

Visual source of truth: **`design-system-design-instructions/`** ("רשומה"). Read `00-how-to-use.md` first. Old hebrew-card-manager / Responders TLV reference is dead.

## Current app state

- App live on Netlify / yahpz.com; UI follows **רשומה** (`design-system-design-instructions/`)
- Core flows: auth, events, responder fill, admin users + closed lists
- Desktop forms: ⌘/Ctrl+Enter primary submit + hint (`useDesktopFormSubmit`, `SubmitShortcutHint`) — desktop ≥1025px only; not on confirm dialogs
- Spec: `docs/superpowers/specs/2026-08-10-desktop-form-submit-shortcut-design.md`
- Toasts: mobile top-center via flex (RTL-safe; no `translateX` centering); desktop bottom-inline-start. Spec: `docs/superpowers/specs/2026-08-11-mobile-toast-design.md`

## Email (Resend)

- Decision (2026-08-09): keep temporary sender `onboarding@send.responders-tlv.com` until Resend plan allows `yahpz.com` (choice 3).
- Invites via Edge Function + Resend HTTP API (not Supabase SMTP mailer).
- Invite copy (approved 2026-08-10): subject `הזמנה למערכת אבן דרך - יחפ״צ`; brand **אבן דרך**; CTA `להשלמת הרישום`; sender display `אבן דרך - יחפ״צ`. Deployed on Edge Function `admin-users`.

## Shifts (design approved 2026-08-10; UX revise same day)

- Spec: `docs/superpowers/specs/2026-08-10-yahpaz-shifts-design.md` (lifecycle UI superseded)
- Independent Shift log + optional Event links (not Event parent)
- `shift_kind`: morning / midday / reinforcement / escort / other (שם משמרת)
- Vehicle: `patrol_north` | `patrol_center` | `personal` → label **רכב פרטי** (+ plate)
- Form: single **שמירה**; no start/close/reopen; `total_km` computed via `computeTotalKm`
- Assigned responders edit on/after `shift_date` (`canEditShiftByDate`); future → view-only; save with `syncResponders: false`
- Admin delete via detail Dialog (`deleteShift`)
- Out of scope v1: open signup roster, payroll, GPS

## Shifts implementation notes (2026-08-10)

- Schema: `20260810120000_shifts.sql`, peer RLS `20260810150000`, kind/delete/responder-edit `20260810160000`
- `shift_kind`: בוקר / צהריים / תגבור / ליווי / אחר; vehicle personal label = רכב פרטי
- No start/close lifecycle UI; save requires date + kind + vehicle; km auto from odometers
- Admin-only delete; assigned responders edit on/after shift_date (future view-only)
- Nav: personal top, כלים לאחמ״ש, ניהול; desktop sidebar on all list views
- Mobile tab bar only: האירועים שלי · המשמרות שלי · אירועים · משמרות · משתמשים (role-gated). No profile / km exceptions / fuel / lists tabs — profile via app-bar; fuel+lists via admin segment; km exceptions desktop sidebar only.


## Fuel refund report (shipped 2026-08-10; revised same day)

- Spec: `docs/superpowers/specs/2026-08-10-yahpaz-fuel-refund-report-design.md`
- Admin-only **החזר דלק** (`FuelRefundPage`, view `fuel_refund`)
- Date filter: event **`created_at`** (when shift-lead reported), not `event_date`
- Include only participations with lead-entered **`total_km` IS NOT NULL** (0 counts; null excluded)
- **No filter** on event status, participation status, or cancelled — km entered is enough
- All active users as rows; columns: כונן · קילומטרים · אירועים
- Out of scope: money math, CSV, shift km

## Exceptions hub (implemented 2026-08-10)

- Nav **חריגים** under כלים לאחמ״ש (desktop; `shift_lead` + `admin`); AppView `exceptions`
- Sub-tabs: **חריגי ק״מ** (live) · **אירועים כפולים** (placeholder `בקרוב`)
- KM report: `done` + `total_km >= 60`; cancelled included; `kmExceptionsReport.ts`
- Spec (KM): `docs/superpowers/specs/2026-08-10-yahpaz-km-exceptions-report-design.md`

## Open / next

1. Three-role production smoke (invite → event → fill → done) + shifts acceptance
2. Later: add/verify `yahpz.com` on Resend when plan allows

## Netlify CD

- Linked (2026-08-09): GitHub `omriland/yhpz-2026`, branch `infra/bootstrap`
- Build env set: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (all contexts); `NODE_VERSION=22`

## Auth URLs

- Set (2026-08-09): Site URL `https://yahpz.com`; redirects include yahpz.com, netlify.app, localhost:5173

## Do not

- Hardcode secrets in repo
- English UI strings in product surfaces
- Netlify Functions in v1 (RLS-only client)
- True offline sync in v1
