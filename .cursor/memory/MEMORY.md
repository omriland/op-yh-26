# Yahpaz (יחפ״צ) — Project Memory

Last updated: 2026-09-01

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
- Seed admin: `omriland@gmail.com` — profile עמרי לנדמן / callsign Admin — roles `admin`, `shift_lead`, **`super_admin`**
- `super_admin`: DB-only grant (trigger blocks JWT insert/delete); not in role checkboxes/invite. Capabilities: set user password (`set_password`); impersonate active non–super-admin users (`impersonate` / `stop_impersonation` + `impersonation_audit`). Specs: `2026-08-11-yahpaz-super-admin-set-password-design.md`, `2026-08-11-yahpaz-super-admin-impersonation-design.md`
- `profiles.must_change_password` + RPC `clear_must_change_password()` for force-change gate after admin-set password
- Profile auto-created via `handle_new_user` trigger on `auth.users`

## Product decisions (locked)

- Roles: Admin (users + closed lists), Shift-lead (events), Responder (own participation fields); Super Admin (additive, DB-only — set passwords)
- Multiple responders per event; each has own details
- Event auto-`done` when **all** assigned responders are `done`; shift-lead sees **partial** until then
- Viewer-relative labels
- Online fill-later (not true offline PWA)
- Closed lists admin-managed: districts, event types, roads, vehicle kinds
- UI HE/RTL only; EN column names in DB
- **Kilometers for calculations / refunds:** only `event_responders.total_km` (lead-entered). `odometer_start` / `odometer_end` are logging / future discrepancy only — never use them for sums, reports, or refunds.
- **Responder fill odometer:** user enters both `odometer_start` and `odometer_end`. Lead `total_km` is never shown on fill or to plain responders on event detail; complete still requires lead `total_km != null` (generic error). Spec: `2026-08-15-yahpaz-revert-auto-odometer-end-design.md` (supersedes auto-odometer-end).
- **Odometer field labels (HE):** `מד אוץ התחלה` / `מד אוץ סיום` (not `ק"מ התחלה` / `ק"מ סיום`). Lead km field remains `קילומטרים`.

### Event statuses

`draft` → `in_progress` → `partial` → `done`

### Participation statuses

`pending` → `in_progress` → `done`

## Schema (high level)

- `profiles` (includes `lifetime_event_count`, `lifetime_km`, `lifetime_stats_updated_at`), `vehicles` (includes `is_default` — one רכב ראשי per user; used on new `event_responders` insert + fill/personal-shift preselect), `user_roles`
- Lookups: `districts`, `event_types`, `roads`, `vehicle_kinds`
- `events`, `event_responders`, `event_treated_vehicles`
- RLS stubs in place; migration: `supabase/migrations/20260809120000_init.sql`

## Design reference

Visual source of truth: **`design-system-design-instructions/`** ("רשומה"). Read `00-how-to-use.md` first. Old hebrew-card-manager / Responders TLV reference is dead.

## Current app state

- App live on Netlify / yahpz.com; UI follows **רשומה** (`design-system-design-instructions/`)
- Core flows: auth, events, responder fill, admin users + closed lists
- **Partner Telegram bot (2026-08-30 revise):** MCP-style connect — bot sends short `/oauth/authorize?client_id&state`; profile **חיבורים** is revoke-only (no **חבר לטלגרם**). Fill API unchanged (`responder:fill`, 60-day token). Spec: `2026-08-30-yahpaz-telegram-mcp-style-connect-design.md`; contract `/partner-api/` v1.1. **Merged to `infra/bootstrap` + Netlify prod** (deploy `6a93b72f085722000888eda6`, commit `e2bc6c3`). Edge `partner-auth` / `responder-api` added to deploy workflow but **not live** — GitHub secret `SUPABASE_ACCESS_TOKEN` missing (workflow skipped).
- Desktop forms: ⌘/Ctrl+Enter primary submit + hint (`useDesktopFormSubmit`, `SubmitShortcutHint`) — desktop ≥1025px only; not on confirm dialogs
- Spec: `docs/superpowers/specs/2026-08-10-desktop-form-submit-shortcut-design.md`
- Toasts: mobile top-center via flex (RTL-safe; no `translateX` centering); desktop bottom-inline-start. Spec: `docs/superpowers/specs/2026-08-11-mobile-toast-design.md`
- Admin users mobile cards: ⋮ overflow menu (same actions as desktop) + internal `--space-3` rhythm; spec `2026-08-11-mobile-admin-users-card-design.md`
- Sticky form footers: upward `--shadow-scroll-cue` while scrollport overflows (`FormStickyFooter` on responder fill / event / shift). Spec: `docs/superpowers/specs/2026-08-11-sticky-footer-scroll-cue-design.md`
- Mobile shell: viewport-locked flex (`height: var(--app-height)` from `visualViewport` via `bindAppViewportHeight`; html/body/#root `overflow: hidden`); `.shell__main` scrolls; bottom tab bar **in-flow** (not `position: fixed`) to avoid iOS Safari mid-scroll drift / blank gap below chrome. Sticky form footers use `inset-block-end: 0` against main.
- Snyk security badge: English “Protected by Snyk” + logo in `AppShell` footer on non-immersive logged-in screens; links to snyk.io. Spec: `docs/superpowers/specs/2026-08-11-snyk-security-badge-design.md`
- Unit events desktop search: RPC `search_unit_event_ids` — police id / road / location / shift-lead + responder name & או״ק. Spec: `docs/superpowers/specs/2026-08-12-yahpaz-events-search-by-responder-design.md`
- **KM discrepancy report (2026-08-16):** אירועים עם פערי דיווח ק״מ shipped in reports library; spec `docs/superpowers/specs/2026-08-16-yahpaz-km-discrepancy-report-design.md`; admin-only; compares odometer delta vs lead `total_km`; confirm replace writes `total_km` only (odometers unchanged).
- **Profile lifetime stats (2026-08-16):** פרופיל card `סיכום פעילות` reads snapshot columns on `profiles` (events + km; same inclusion as החזר דלק). `refresh_profile_lifetime_stats()` + `pg_cron` 07:00/19:00 Asia/Jerusalem. Clients cannot write the columns. Spec: `2026-08-16-yahpaz-profile-lifetime-stats-design.md`.
- **Default vehicle (2026-09-01):** `vehicles.is_default` (רכב ראשי). Profile star when 2+ active cars; `set_default_vehicle` RPC; new `event_responders` insert copies that plate; fill + personal-shift preselect it. Spec: `2026-09-01-yahpaz-default-vehicle-design.md`.

## Email (Resend)

- Decision (2026-08-09): keep temporary sender domain until Resend plan allows apex `yahpz.com` fully (choice 3).
- Invites via Edge Function `admin-users` + Resend HTTP API (not Supabase SMTP mailer).
- Invite copy (approved 2026-08-10): subject `הזמנה למערכת אבן דרך - יחפ״צ`; brand **אבן דרך**; CTA `להשלמת הרישום`; sender display `אבן דרך - יחפ״צ`.
- **Generic transactional mail (2026-08-12):** Edge Function `send-email` + `_shared/email.ts` shell; admin JWT or service-role; recipients = active `profiles` only (`user_id`). Spec: `2026-08-12-yahpaz-generic-email-and-fill-link-design.md`.
- **Fill-ready auto email:** when lead `total_km` first set on a participation → `responder-fill` `notify_fill_ready` (idempotent via `fill_ready_emailed_at`). Scoped 7-day `fill_token` for fill without Auth session; expired → login + `yahpaz:post_login_fill` return. Env: `RESEND_API_KEY`, optional `EMAIL_FROM` (default `alerts@send.yahpz.com`), `INVITE_REDIRECT_TO` for link base.
- **Deployed (2026-08-12):** migration `20260812160000_event_fill_token.sql` applied; Edge Functions `send-email` + `responder-fill` ACTIVE on project `rtvizpsfvtjowbimugns`. Secrets: `RESEND_API_KEY`, `INVITE_REDIRECT_TO`, `EMAIL_FROM`.
- **Merged + Netlify prod (2026-08-15):** email/fill-token merged to `infra/bootstrap`; production deploy live on https://yahpz.com (deploy `6a7ff55309294f5fc12c908a`).
- **Merged + Netlify prod (2026-08-15):** mobile bottom chrome fix (`--app-height` / viewport lock) merged to `infra/bootstrap` (PR #7); live on https://yahpz.com.
- **Merged + Netlify prod (2026-08-15):** revert auto odometer end + hide lead km (PR #8 → `infra/bootstrap` `119a8ab`); production deploy `6a80ae593b19dc0008034c77` on https://yahpz.com. **Pending:** redeploy Edge `responder-fill` (needs `SUPABASE_ACCESS_TOKEN`) so fill-token path matches client.

## Shifts (design approved 2026-08-10; UX revise same day)

- Spec: `docs/superpowers/specs/2026-08-10-yahpaz-shifts-design.md` (lifecycle UI superseded)
- Independent Shift log + optional Event links (not Event parent)
- `shift_kind`: morning / midday / reinforcement / escort / other (שם משמרת)
- Vehicle: `patrol_north` | `patrol_center` | `personal` → label **רכב פרטי** (+ plate)
- Form: single **שמירה**; no start/close/reopen; `total_km` computed via `computeTotalKm`
- Assigned responders edit on/after `shift_date` (`canEditShiftByDate`); future → view-only; save with `syncResponders: false`
- **Identity lock:** responders cannot change `shift_date` / `shift_kind` / `vehicle_type` / `personal_vehicle_id` — UI disabled + client omit + DB trigger `enforce_shift_identity_edit`. Only `admin` / `shift_lead`. Spec: `2026-08-11-yahpaz-shift-identity-fields-lock-design.md`
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
- KM report: lead-entered `total_km >= 60` (any participation status; not odometer); cancelled included; `kmExceptionsReport.ts`
- Spec (KM): `docs/superpowers/specs/2026-08-10-yahpaz-km-exceptions-report-design.md`

## Event detail map hero (2026-08-11)

- Spec: `docs/superpowers/specs/2026-08-11-yahpaz-event-detail-map-hero-design.md`
- When `location_lat`/`location_lng` present: faded Static Maps band behind event detail letterhead (layout B), pin, no click-out
- Needs **Maps Static API** enabled on the same `VITE_GOOGLE_MAPS_API_KEY`

## System שלוחות + Places location (2026-08-11)

- Spec: `docs/superpowers/specs/2026-08-11-yahpaz-system-districts-places-location-design.md`
- One system district: `code=station_other_duplicated`, name `תחנה / אחר / משוכפל` — DB trigger locks rename/delete/deactivate
- When selected on event form: מיקום = Places autocomplete (HE, IL); free-text always first; location required
- Store: `events.location` + optional `location_place_id` / `location_lat` / `location_lng`
- Env: `VITE_GOOGLE_MAPS_API_KEY` (Places API New; referrer-restricted). Ops setup in Google Cloud + Netlify.

## Phone OTP (production 2026-08-12)

- Spec: `docs/superpowers/specs/2026-08-12-yahpaz-phone-otp-twilio-design.md` (provider later switched)
- Provider: **Soprano SMS** (same account as responders) — not Twilio
- Edge secrets: `SOPRANO_USER`, `SOPRANO_PASSWORD`, `SOPRANO_SOURCE` (`Konenut TLV`)
- Migrations applied; Edge `phone-otp` deployed; PR #5 merged to `infra/bootstrap` → live on yahpz.com

## Open / next

1. Three-role production smoke (invite → event → fill → done) + shifts acceptance
2. Later: add/verify `yahpz.com` on Resend when plan allows
3. Set `VITE_GOOGLE_MAPS_API_KEY` in Netlify + `.env.local` for Places autocomplete
4. Smoke phone OTP on production (enable per user → SMS → login / משתמשים gates)

## Netlify CD

- Linked (2026-08-09): GitHub `omriland/yhpz-2026`, branch `infra/bootstrap`
- Build env set: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (all contexts); `NODE_VERSION=22`
- **Security headers (2026-08-16):** `netlify.toml` sets HSTS, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` (camera/mic/geo/payment off). CSP deferred (Fonts/Maps/PostHog/Supabase). **LIVE on https://yahpz.com** (merged PR #9 → `infra/bootstrap`; browser smoke PASS, clean console).
- **Edge CORS allowlist (2026-08-16):** functions reject `*`; reflect Origin only for `yahpz.com` / www, `yahpaz-2026.netlify.app`, Netlify `*--yahpaz-2026.netlify.app` previews, and `localhost:5173` / `127.0.0.1:5173`. Shared: `supabase/functions/_shared/cors.ts`. **Code on `infra/bootstrap`; live Edge still `*` until redeploy** (needs `SUPABASE_ACCESS_TOKEN`). Workflow: `.github/workflows/deploy-edge-functions.yml` (skips if secret missing).
- **Dependabot (2026-08-16):** weekly npm updates via `.github/dependabot.yml` on `infra/bootstrap`.


## Auth URLs

- Set (2026-08-09): Site URL `https://yahpz.com`; redirects include yahpz.com, netlify.app, localhost:5173

## Do not

- Hardcode secrets in repo
- English UI strings in product surfaces
- Netlify Functions in v1 (RLS-only client)
- True offline sync in v1
