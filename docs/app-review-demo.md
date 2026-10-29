# App Review demo isolation

Apple's App Review signs in with a demo account. Before this change any active account
could read every member's name, phone and email (`list_unit_contacts`) and saved home
and work addresses (`list_unit_map_pins`), and lead accounts see real incidents. This
change makes a demo account see demo data only, and keeps demo data away from real
members.

- Migration: `supabase/migrations/20261029120000_app_review_demo_isolation.sql`
- Edge functions: `unit-broadcast`, `responder-fill`
- Scripts and tests: `scripts/app-review-demo/` (see its README)

## Definitions

| Term | Meaning |
|---|---|
| Demo account | `profiles.is_app_review_demo = true`. Set only by the server (service role / no JWT). Must be responder-only and have no phone |
| Demo event / shift | `events.is_demo = true` / `shifts.is_demo = true`. Shift-born events inherit the shift's value. Demo events also carry the human label `דמו - App Review` in `notes` and `location` |
| Demo child row | Any row whose event or shift is demo: assignments, photos, photo-plate links, treated plates and vehicles, secondary leads, audit, active-event prefs, live locations, shift links and counts |
| Demo member data | Rows owned by a demo account: vehicles, addresses, roles, feedback, iOS devices, push tokens, feedback files |

## Decision: demo rows are hidden from real users, admins included

Each table gets one RESTRICTIVE policy: a row is visible or writable only when its
demo-ness equals the caller's. A demo caller sees demo rows only; every real user,
admins and super admins included, never sees a demo row. So demo events stay out of
lists, reports, fuel, exports, stats and partner webhooks, and nobody can assign real
people to demo events or the demo account to real events. The service role bypasses
RLS, so only the scripts manage demo data.

Consequences: the demo accounts do not appear in the admin users screen; feedback the
reviewer sends is not in the super-admin inbox (`remove-app-review-demo.mjs` prints it
before deleting); admins cannot edit or deactivate the demo accounts from the UI (use
the scripts).

## Guards (apply to every writer, service role included)

| Guard | Rule |
|---|---|
| `guard_app_review_demo_link` on events, shifts, event_responders, event_secondary_leads, shift_responders, shift_events | Demo accounts link only to demo events/shifts and the other way round. A demo event needs a demo lead |
| `guard_app_review_demo_profile` on profiles | Only the server changes the flag (the demo user cannot clear it, an admin cannot set it). A flagged profile has no phone and only the responder role |
| `guard_app_review_demo_role` on user_roles | A demo account cannot get any role but responder |
| `guard_app_review_demo_oauth` on oauth_authorization_codes, oauth_access_tokens | A demo account cannot link a partner app (Telegram bot), so `responder-api` and partner webhooks never act for it |

## Tables and policies

| Table | Existing policies | Handling |
|---|---|---|
| events | events_select, events_insert_lead_admin, events_update_lead_admin, events_delete_admin, events_delete_cockpit_draft_lead | Restrictive on `is_demo`; link guard |
| event_responders | event_responders_select, _lead_admin_insert/update/delete, _self_update | Restrictive on event; link guard |
| event_media | event_media_select/insert/update/delete | Restrictive on event |
| event_media_plates | event_media_plates_select/insert/delete | Covered through event_media: every policy requires a visible event_media row, and that subquery runs under event_media's RLS (tested) |
| event_treated_plates | treated_plates_select, treated_plates_event_write, treated_plates_responder_write | Restrictive on event or assignment |
| event_treated_vehicles | treated_vehicles_select, treated_vehicles_event_select, _lead_admin_insert/update/delete | Restrictive on event or assignment |
| event_secondary_leads | event_secondary_leads_select/insert/update/delete | Restrictive on event; link guard |
| event_audit | event_audit_select_admin | Restrictive on event (admins do not see demo audit) |
| event_responder_live_locations | event_responder_live_locations_select_ops (also Realtime, which applies RLS) | Restrictive on assignment |
| my_active_event_prefs | own select/insert/update/delete | Restrictive on event |
| shifts | shifts_select, shifts_insert_lead_admin, shifts_update_lead_admin, shifts_update_assigned, shifts_delete_admin | Restrictive on `is_demo`; link guard |
| shift_responders | shift_responders_select, shift_responders_write_lead_admin | Restrictive on shift; link guard |
| shift_events | shift_events_select, _write_lead_admin, _write_assigned | Restrictive on shift; link guard |
| shift_event_type_counts, shift_treated_vehicle_counts | _select, _write_lead_admin, _write_assigned | Restrictive on shift |
| profiles | profiles_select_unit_visibility, profiles_update_own_or_admin | Restrictive on the flag; profile guard |
| user_roles | user_roles_select_own_or_admin, user_roles_admin_all | Restrictive on owner; role guard |
| vehicles | vehicles_select_own_or_admin, vehicles_write_admin | Restrictive on owner |
| user_addresses | user_addresses_select_own_or_ops, user_addresses_admin_write | Restrictive on owner |
| user_feedback | user_feedback_select/insert/update/delete | Restrictive on owner |
| ios_devices | ios_devices_select | Restrictive on owner; `mint_ios_enroll_token` refuses demo |
| device_tokens | own select/insert/update/delete | Restrictive: a demo account has no access; `upsert_device_token` is a no-op for it |
| storage.objects | event_media_storage_select/insert/delete, user_feedback_storage_select/insert/delete | Restrictive: `event-media` by the event in the path, `user-feedback` by the owner in the path |
| districts, event_types, roads, vehicle_kinds | lookups_read_authenticated, *_admin_write | Unchanged: reference data, no personal data; writes are admin-only |
| highway_junctions | highway_junctions_select_ops, _super_admin_write | Unchanged: reference data, ops roles only |
| fuel_quarters, fuel_quarter_distributions | *_admin_all | Unchanged: admin-only, entered by admins |
| unit_broadcasts | unit_broadcasts_admin_select | Unchanged: admin-only log; recipients exclude demo (edge function) |
| impersonation_audit, ios_enroll_tokens, otp_challenges, otp_device_trust, otp_step_up, user_presence | none (RLS on) | Unchanged: no client access |
| oauth_clients, oauth_authorization_codes, oauth_access_tokens, partner_webhook_events, partner_webhook_cron_auth | none, no grants | Service only; oauth guard added |

## SECURITY DEFINER and other RPCs callable by `authenticated`

| RPC | Handling |
|---|---|
| list_unit_contacts | **Patched**: a demo caller gets demo members only, a real caller never gets demo members |
| list_unit_map_pins | **Patched**: same rule |
| default_vehicle_plate_for_user | **Execute revoked** from anon/authenticated. It returned any member's plate for an id; its original migration meant it for the service role, but Supabase's default grants left it open. Its only caller is a SECURITY DEFINER trigger |
| mint_ios_enroll_token | **Patched**: refuses a demo caller (enrollment goes to a super admin) |
| upsert_device_token | **Patched**: no-op for a demo caller |
| upsert_locked_secondary_lead | **Patched**: no-op for a demo caller (it accepts any event id from any member) |
| admin_list_last_active, admin_list_last_sign_in, approve_event_freeze, user_ids_with_device_tokens | Admin-only; a demo account is never admin (role guard). Real admins still get demo ids with timestamps, which the UI never shows (rows come from profiles) |
| ios_device_approve / reject / retire | Super-admin only |
| list_shift_lead_profiles, search_highway_junctions, set_locked_event_lead_km | Lead/admin only |
| delete_event | Lead/admin/super admin only; a responder always gets an error |
| revoke_user_sessions | Refuses any signed-in caller (service only) |
| clear_must_change_password, report_android_session, touch_last_active, set_default_vehicle | Caller's own row (vehicle: own or admin) |
| apply_event_status_from_participations, save_shift_born_event_fill, sync_shift_born_events, can_edit_shift_as_assigned, is_assigned_to_event, is_assigned_to_shift | Need the caller's own assignment; the link guard keeps demo assignments on demo rows |
| derived_event_status, event_missing_lead_km, shift_born_event_is_empty, has_role, profile_is_active, super_admin_row_locked, is_event_edit_unlocked, is_event_id_edit_unlocked, is_event_responder_edit_unlocked, refresh_shift_log_status | Take an id, return a boolean or status (or recompute a shift's own status). No row data, and the demo account cannot read any real UUID |
| ios_budget_used, apply_due_availability | Aggregate count / housekeeping, no personal data |
| count_events_missing_lead_km, search_unit_event_ids, search_unit_shift_ids | SECURITY INVOKER: RLS applies, so the restrictive policies cover them (searches are also lead/admin-only) |
| event_media_path_event_id, user_feedback_path_user_id, normalize_plate_number, split_patrol_callsign, ios_membership_year_now | Pure helpers |
| is_app_review_demo_caller, app_review_demo_user_ids / event_ids / shift_ids / assignment_ids | New helpers used by the policies; not granted to anon |

Not executable by `authenticated`: event_has_pending_over_60km, event_matches_over_60km,
event_matches_suspicious_duplicate, invoke_deliver_partner_webhooks,
invoke_notify_overdue_fills, refresh_event_freeze, refresh_event_freeze_for_responder_day,
refresh_profile_lifetime_stats.

## Triggers that read across rows or reach outside

| Trigger function | Handling |
|---|---|
| events_reject_same_day_police_event_id | **Patched**: compares only events with the same `is_demo`. Before, demo event 4127 would have blocked a real lead from entering 4127 that day, with an error about an event they cannot see |
| enqueue_partner_webhook_events, enqueue_partner_webhooks_on_police_event_id | Fire only for responders holding a partner OAuth token; a demo account cannot get one, and real responders cannot be on demo events |
| event_matches_suspicious_duplicate, refresh_event_freeze_for_responder_day | Compare one responder's own assignments, so demo and real never mix |
| event_audit_write | Writes audit rows; demo ones are hidden from admins |
| refresh_profile_lifetime_stats (cron) | Per-profile; demo stats land only on demo profiles |
| handle_new_user | Unchanged; the script flags the profile before the account has a password |

## Edge functions (service role, bypass RLS)

| Function | Handling |
|---|---|
| unit-broadcast | **Changed**: recipients exclude demo profiles (no email, SMS or push) |
| responder-fill `notify_fill_ready`, `notify_overdue_fills` | **Changed**: skip demo assignments (`app_review_demo`), so no fill-ready or overdue emails and no fill tokens for them |
| responder-fill `load_by_token`, `save_by_token` | Token-based; tokens are only minted by the two emails above |
| phone-otp | Sends only to `profiles.phone`; a demo profile cannot have one |
| user-feedback `mark_treated` | Super-admin only, SMS to the author's phone: demo feedback is hidden and demo phones are empty |
| responder-track `start` / `stop` | Lead/admin only; demo accounts are hidden from leads and have no phone |
| partner-auth `authorize`, responder-api | Need a partner OAuth link; the oauth guard refuses it for demo accounts |
| admin-users, send-email | Admin / super-admin only, and demo accounts are hidden from admins |
| ios-enroll | Needs a token from `mint_ios_enroll_token`, which refuses demo accounts |
| plate-lookup | Public vehicle-registry lookup; reaches no person. Unchanged |
| privacy-policy | Public HMAC check. Unchanged |

## Tests

- `scripts/app-review-demo/test/isolation.sql`, 59 checks, run by
  `scripts/app-review-demo/test/run-local-db.sh` on a throwaway local Postgres with
  every migration replayed: real users see real rows; the demo account sees demo rows
  only on every table, storage bucket and RPC above; it cannot clear its flag, add a
  phone, register a push token, mint an enrollment token, read a plate by id, assign
  anyone, change roles or link a partner app; leads cannot mix demo and real rows; a
  real event can reuse a demo event's number.
- `scripts/app-review-demo/lib.test.mjs` (in `npm test`): the scripts' safety gates,
  data plan and dry run.

## Deploy order (needs Omri's OK)

1. Merge into `infra/bootstrap` and push. The Deploy Edge Functions workflow applies
   the migration last in its list (it is re-runnable, and running last restores the
   same-day trigger body that `20260929082322` replaces on every run), then deploys the
   functions, so the column exists before `unit-broadcast` and `responder-fill` select it.
2. Netlify Git CD publishes the site (privacy policy and `/support`).
3. Run `create-app-review-demo.mjs --target production --confirm-production` with
   `APP_REVIEW_DEMO_ALLOW=1`, then copy the email and password into App Store Connect.
4. After review: `remove-app-review-demo.mjs`.

Rollback: run `remove-app-review-demo.mjs` first, then
`scripts/app-review-demo/rollback-20261029120000.sql` (it refuses while demo rows exist).
Tested locally: migration, rollback, migration again; the schema after rollback is
identical to before the migration.
