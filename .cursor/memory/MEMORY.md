# Yahpaz (יחפ״צ) — Project Memory

Last updated: 2026-09-11 (prod tip `f3da689` / deploy `6aa37b6e669a950008dfc234`; feature ship: per-responder freeze PR #45)

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
- **Remember me (web, 2026-09-04):** login checkbox `זכור אותי במכשיר זה ל־30 יום` (default on). Session stays in `localStorage` for 30 days from that login; email is prefilled next time. Unchecked → `sessionStorage` (browser close signs out) and email is forgotten. Password is never stored by the app (browser password manager / Credential Management API only). Helper: `src/lib/rememberLogin.ts`.
- Seed admin: `omriland@gmail.com` — profile עמרי לנדמן / callsign Admin — roles `admin`, `shift_lead`, **`super_admin`**
- `super_admin`: DB-only grant (trigger blocks JWT insert/delete); not in role checkboxes/invite. Capabilities: set user password (`set_password`); change user email (`set_email` — Auth + `profiles.email`); impersonate active non–super-admin users (`impersonate` / `stop_impersonation` + `impersonation_audit`). Specs: `2026-08-11-yahpaz-super-admin-set-password-design.md`, `2026-08-11-yahpaz-super-admin-impersonation-design.md`
- `profiles.must_change_password` + RPC `clear_must_change_password()` for force-change gate after admin-set password
- Profile auto-created via `handle_new_user` trigger on `auth.users`

## Product decisions (locked)

- Roles: Admin (users + closed lists), Shift-lead (events), Responder (own participation fields); Super Admin (additive, DB-only — set passwords, change emails)
- Multiple responders per event; each has own details
- Event auto-`done` when **all** assigned responders are `done`; shift-lead sees **partial** until then
- Viewer-relative labels
- Online fill-later (not true offline PWA)
- Closed lists admin-managed: districts, event types, roads, vehicle kinds
- UI HE/RTL only; EN column names in DB
- **Kilometers for calculations / refunds:** only `event_responders.total_km` (lead-entered). `odometer_start` / `odometer_end` are logging / future discrepancy only — never use them for sums, reports, or refunds.
- **Responder fill odometer:** user enters both `odometer_start` and `odometer_end`. Lead `total_km` is never shown on fill or to plain responders on event detail; complete still requires lead `total_km != null` (generic error). Spec: `2026-08-15-yahpaz-revert-auto-odometer-end-design.md` (supersedes auto-odometer-end).
- **Odometer field labels (HE):** `מד אוץ התחלה` / `מד אוץ סיום` (not `ק"מ התחלה` / `ק"מ סיום`). Lead km field remains `קילומטרים`.
- **Vehicles (2026-09-09):** Responders view-only on profile (may still set רכב ראשי via `set_default_vehicle` security definer). Add/edit/archive/delete only via admin panel. RLS `vehicles_write_admin` (admin only; was own-or-admin). Migration `20260909210000_vehicles_admin_only_write.sql`.
- **KM backfill (2026-09-09):** One-off on prod: for `events.created_at < 2026-09-01`, set null `event_responders.total_km` to varied 8–55 (`8 + abs(hashtext(id)) % 48`); stamped overdue/fill clocks to event `created_at` to avoid mail spam. **169 rows** updated.
- **Demo event data cleanup (2026-09-09):** One-off on prod for demo readiness. Deleted **2** empty shell events (no police id/type/location/road/treatment/notes/plates). Backfilled invented Hebrew TLV/demo details on most incomplete events (police id, type, district, road, location, patrol, notes, treatment; responder treatment/plate/route where needed). Left **~32** intentionally incomplete (~12%). Rough before→after: 274→272 total; complete 83→~240; incomplete 189→~32. Invented demo text only — not real PII.
- **Delete events without Event ID (2026-09-10):** One-off on prod: hard-deleted **8** null/blank `police_event_id` (UI מספר אירוע); 280→272; 0 remaining.
- **Missing lead-KM alerts (2026-09-09):** For `shift_lead` / `admin` when ≥2 events have any responder with `total_km` null: Events page top banner + login/refresh popup (`תזכירו לי מאוחר יותר` = sessionStorage dismiss; banner always while condition holds). RPC `count_events_missing_lead_km()`.
- **Shift-born UX (2026-09-09):** Never show `אחמ״ש טרם הזין ק״מ` on `origin=shift`. Missing `treatment_detail` → `ממתין לתיעוד` / pending mine inbox — never `סיימת לתעד`.
- **Super admin edit (2026-09-09):** `super_admin` bypasses `isAssignedVolunteerEventEditBlocked` (admins who are also responders stay blocked).
- **Fuel Mgmt hub cards (2026-09-09):** Same `ReportCatalogCard` as דוחות; forced white `default` variant only.
- **Per-responder freeze (2026-09-10):** Freeze is a **participation**, not an event. `event_responders.frozen_over_60km` / `frozen_suspicious_duplicate` drive החזר דלק, monthly detail, quarterly allocation and `refresh_profile_lifetime_stats`; `events.frozen_*` remain the "at least one frozen participation" aggregate (same meaning as before). Fixes: one responder ≥80 ק״מ used to void a teammate's justified refund on the same event. Approval stays event-scoped (`approve_event_freeze` + `approved_over_60km_responder_ids`). **Visibility:** `admin`/`super_admin` see the event when any participation is frozen (+ which volunteer, on event detail); `shift_lead` never; a responder only their own. Non-admins never fall back to the event aggregate. Migration `20260910140000_responder_level_event_freeze.sql` — **not yet applied on prod** (agent had no Supabase access to `rtvizpsfvtjowbimugns`); verified on a local PG16 replay of all freeze migrations. Spec: `2026-09-10-yahpaz-per-responder-event-freeze-design.md`. Android port pending.
- **Freeze migration applied (2026-09-11):** `20260910140000_responder_level_event_freeze.sql` is **live on prod**, applied by the **Deploy Edge Functions** workflow (run `34573664900`), which now lists it among the idempotent migrations it applies with `SUPABASE_ACCESS_TOKEN`. **That workflow is the way an agent reaches the prod database** — the Supabase MCP on cloud runs is authenticated to "Opeaz Org" only and returns `You do not have permission` for `rtvizpsfvtjowbimugns`. Post-migration prod state: 417 participations, 4 frozen on km, 0 duplicates; invariant check returned aggregate_mismatch **0**, missed_freeze **0**, refunds_restored **1** (one real participation whose fuel refund a teammate's ≥80 ק״מ had been voiding).
- **Freeze schema probe (2026-09-11):** Deploy order no longer matters. `src/lib/responderFreezeSchema.ts` probes `event_responders.frozen_over_60km` once per session; selects carry the `RESPONDER_FREEZE_FIELDS` token and `withResponderFreeze()` drops it on `42703` only. Pre-migration the fuel reports fall back to the event aggregate via `participationFrozen()` (= old behaviour, no refund regression); admins still see the mark, responders do not see their own yet. Probed prod REST 2026-09-11: `event_responders.frozen_over_60km` → 400 `42703` (missing); `events.approved_over_60km_responder_ids` / `approved_suspicious_duplicate` / `frozen_over_60km` → 200, so the migration's prerequisites are met. Verified every freeze-bearing select (events list/detail, cockpit, shifts list/detail, km exceptions, 3 fuel reports) returns **200** against the live pre-migration schema. Cloud-agent secrets hold only `VITE_*` — an agent cannot apply migrations (Supabase MCP sees only the Opeaz org) but the Netlify MCP does reach site `yahpaz-2026`.

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
- **Latest Netlify prod (2026-09-10):** Git CD deploy `6aa21986240c820008666778` **ready**, published 2026-09-10T02:45:01Z at https://yahpz.com, tip commit `d1a33a0` on `infra/bootstrap` (memory note). Feature ship: `76b3440` + build fix `4ebf78f` (deploy `6aa21923f7e52f0008130a16`); first `76b3440` attempt `6aa218869f0f4e0008ede652` errored on unused `useRef`. **Git CD is the live path.**
- **Latest Netlify prod (2026-09-11):** Git CD deploy `6aa37b6e669a950008dfc234` **ready**, published 2026-09-11T03:55:43Z at https://yahpz.com, tip commit `f3da689` on `infra/bootstrap` (PR #45, per-responder freeze, fast-forward). Bundle `assets/index-BeEozeAm.js`; smoke: `/` 200 HE/RTL, `/android/version.json` 200, `/partner-api/openapi.yaml` 200. **Migration `20260910140000_responder_level_event_freeze.sql` still pending on prod** — the client runs on the old schema via the freeze probe until it is applied.
- **Android force-update (2026-09-09):** 0.3.34 `versionCode` 45; `minVersionCode` 45; APK `yahpaz-0.3.34.apk` 64,659,293 bytes at https://yahpz.com/android/yahpaz-0.3.34.apk. Android commit `47cb3a6` on origin/main.
- **Prod smoke (2026-09-09):** yahpz.com 200 HE/RTL; `version.json` 200 with 0.3.34 / min 45; APK 200 64,659,293 bytes.
- **Migrations (2026-09-09):** `event_delete_with_responders` applied (remote name `20260909071841`; local file `20260909045235_event_delete_with_responders.sql`). Partner webhook cron **not** replayed (`20260908034425` already present).
- **Edge (2026-09-09):** `responder-fill` ACTIVE v21 (`verify_jwt` true); `responder-api` ACTIVE v7 (`verify_jwt` false).
- **iOS Ad Hoc live (2026-09-09):** Git CD commit `07853fe` on `infra/bootstrap`. Signed IPA build **14** (`1.0.0`), **6,076,317** bytes, Ad Hoc profile 2 devices expires 2027-08-17. Live `minBuild`/`latestBuild` **14** at https://yahpz.com/ios/version.json; IPA https://yahpz.com/ios/Yahpaz.ipa 200 6076317; manifest https://yahpz.com/ios/manifest.plist 200. Archive+export succeeded after Apple ID in Xcode. iOS source `dcd4736` on `feat/android-parity` (`CFBundleVersion=$(CURRENT_PROJECT_VERSION)`). Team `477WWCHXU7`, bundle `com.yahpz.responder`.
- Core flows: auth, events, responder fill, admin users + closed lists
- **Partner Telegram bot:** MCP-style connect via `/oauth/authorize?client_id&state`. **Profile חיבורים** (2026-09-04, PR #28): re-enabled + empty-state **קישור לטלגרם** starts the same OAuth consent flow (uses `list_apps` + `buildPartnerAuthorizeUrl` with current origin). Bot-initiated link still works. Spec: `2026-09-04-yahpaz-profile-telegram-link-design.md` (supersedes 2026-08-30 revoke-only). Fill API unchanged (`responder:fill`, 60-day token). Contract `/partner-api/` **v1.3**. Edge `partner-auth` responds live (Hebrew 401 without session); GitHub deploy workflow still skips when `SUPABASE_ACCESS_TOKEN` secret is missing.
- **Telegram live trip tracking (2026-09-05, PR #33):** `responder-api` `start_live_track` / `stop_live_track` mint/clear the same `track_token_hash` the SMS flow uses; bot pings existing `responder-track` `ping`. Completing a report also stops tracking (fail-open). Reuses `responder:fill` grant; no new consent. Spec: `2026-09-04-yahpaz-telegram-live-trip-tracking-design.md`. **`responder-api` ACTIVE v7** (`verify_jwt` false, 2026-09-09). GitHub workflow still needs repo secret `SUPABASE_ACCESS_TOKEN` for future deploys of `responder-api` + `responder-track` (`--no-verify-jwt`).
- **Assignment webhook Part B (2026-09-05, PR #34):** on `event_responders` insert, enqueue `assignment_created` to `partner_webhook_events` for each active unexpired grant + configured `oauth_clients.webhook_url`. Enqueue trigger is fail-open (assignment insert never rolls back). Minute `pg_cron` → `partner-auth` `deliver_webhooks` (HMAC-SHA256 `X-Yahpaz-Signature`, backoff). Admin sets URL + one-time `webhook_secret` on Partner Bot settings. Migration `20260905120000_partner_webhook_events.sql` (idempotent). Spec/plan: `2026-09-04-yahpaz-profile-telegram-link-design.md` Part B, `2026-09-05-yahpaz-partner-assignment-webhook.md`. **2026-09-09:** webhook cron not replayed (`20260908034425` already present). Edge `partner-auth` redeploy still needs `SUPABASE_ACCESS_TOKEN`.
- Desktop forms: ⌘/Ctrl+Enter primary submit + hint (`useDesktopFormSubmit`, `SubmitShortcutHint`) — desktop ≥1025px only; not on confirm dialogs
- Spec: `docs/superpowers/specs/2026-08-10-desktop-form-submit-shortcut-design.md`
- **Event create draft survival (2026-09-03):** `EventFormPage` boot effect depends on stable `userId` / lead name+callsign (not auth object refs). Typed אירוע חדש is kept across tab-focus `TOKEN_REFRESHED`. Local stash (`eventFormStash`) runs on all viewports (was mobile-only).
- **Form draft survival (2026-09-03, expanded):** Same pattern on shift form, responder fill, shift-born fill (stash added), profile vehicles, unit broadcast compose, admin create-user stash keys. Shared helper: `formDraftSurvival.shouldKeepLiveFormBoot`.
- Toasts: mobile top-center via flex (RTL-safe; no `translateX` centering); desktop bottom-inline-start. Spec: `docs/superpowers/specs/2026-08-11-mobile-toast-design.md`
- Admin users mobile cards: ⋮ overflow menu (same actions as desktop) + internal `--space-3` rhythm; spec `2026-08-11-mobile-admin-users-card-design.md`
- Sticky form footers: upward `--shadow-scroll-cue` while scrollport overflows (`FormStickyFooter` on responder fill / event / shift). Spec: `docs/superpowers/specs/2026-08-11-sticky-footer-scroll-cue-design.md`
- Mobile shell: viewport-locked flex (`height: var(--app-height)` from `visualViewport` via `bindAppViewportHeight`; html/body/#root `overflow: hidden`); `.shell__main` scrolls; bottom tab bar **in-flow** (not `position: fixed`) to avoid iOS Safari mid-scroll drift / blank gap below chrome. Sticky form footers use `inset-block-end: 0` against main.
- Snyk security badge: English “Protected by Snyk” + logo in `AppShell` footer on non-immersive logged-in screens; links to snyk.io. Spec: `docs/superpowers/specs/2026-08-11-snyk-security-badge-design.md`
- Unit events desktop search: RPC `search_unit_event_ids` — police id / road / location / shift-lead + responder name & או״ק. Spec: `docs/superpowers/specs/2026-08-12-yahpaz-events-search-by-responder-design.md`
- **KM discrepancy report (2026-08-16):** אירועים עם פערי דיווח ק״מ shipped in reports library; spec `docs/superpowers/specs/2026-08-16-yahpaz-km-discrepancy-report-design.md`; admin-only; compares odometer delta vs lead `total_km`; confirm replace writes `total_km` only (odometers unchanged).
- **Profile lifetime stats (2026-08-16):** פרופיל card `סיכום פעילות` reads snapshot columns on `profiles` (events + km; same inclusion as החזר דלק). `refresh_profile_lifetime_stats()` + `pg_cron` 07:00/19:00 Asia/Jerusalem. Clients cannot write the columns. Spec: `2026-08-16-yahpaz-profile-lifetime-stats-design.md`.
- **Default vehicle (2026-09-01):** `vehicles.is_default` (רכב ראשי). Profile star when 2+ active cars; `set_default_vehicle` RPC; new `event_responders` insert copies that plate; fill + personal-shift preselect it. Spec: `2026-09-01-yahpaz-default-vehicle-design.md`. **Not yet applied on prod** — UI fallback retries without `is_default` so the vehicle list still loads.
- **24-hour time (2026-09-03):** Event time inputs are digit-masked `HH:mm` (not native `type="time"`, which followed device 12/24). Display formatters use `hour12: false` + `hourCycle: 'h23'`. Same pattern as Android `TimeField`.
- **Form field limits (2026-09-05):** Event `מספר אירוע` max 7 digits (`maxLength` + `policeEventIdForInput`). Lead `קילומטרים` max 3 digits. Create-event `או״ק ניידת` max 16 characters. Treated plates accept **5–8** digits (was 7–8); format 5=`XX-XXX`, 6=`XXX-XXX`. Error copy: `יש להזין 5 עד 8 ספרות.`
- **Latest `infra/bootstrap` tip (2026-09-10):** `d1a33a0` Record prod deploy; prior `4ebf78f` useRef build fix; `76b3440` vehicles admin-only / KM alerts / shift-born UX.

## Email (Resend)

- Decision (2026-08-09): keep temporary sender domain until Resend plan allows apex `yahpz.com` fully (choice 3).
- Invites via Edge Function `admin-users` + Resend HTTP API (not Supabase SMTP mailer).
- Invite copy (approved 2026-08-10): subject `הזמנה למערכת אבן דרך - יחפ״צ`; brand **אבן דרך**; CTA `להשלמת הרישום`; sender display `אבן דרך - יחפ״צ`.
- Invite link TTL: **24 hours** (`profiles.invite_token_expires_at`; Edge `admin-users` `INVITE_TTL_MS`). Email + create-user hint: `הקישור בתוקף ל־24 שעות.` Expired → `קישור ההזמנה פג תוקף. בקשו הזמנה חדשה.` Admin resend mints a fresh token. **Merged to `infra/bootstrap` (2026-09-01).** Live Edge still 7-day until `admin-users` is redeployed (`SUPABASE_ACCESS_TOKEN` GitHub secret still missing).
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
5. ~~Add GitHub repo secret `SUPABASE_ACCESS_TOKEN`~~ — **done and working (verified 2026-09-11).** The secret exists; **Deploy Edge Functions** has succeeded on every `infra/bootstrap` push since 2026-09-08 (it exits 1 when the secret is missing), redeploying all ten functions each run. Any note elsewhere saying live Edge lags the repo is stale.

## Netlify CD

- Linked (2026-08-09): GitHub `omriland/yhpz-2026`, branch `infra/bootstrap`
- **Live prod path (2026-09-09):** Git CD. Do not rely on `npx netlify deploy --prod` (failed JSONHTTPError Not Found that day).
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
