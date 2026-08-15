# Generic email + scoped fill link — Implementation Plan

> **For agentic workers:** Implement task-by-task. Checkboxes track progress.

**Goal:** Shared Resend transactional email + first fill-ready auto-email when lead `total_km` is first set, with a 7-day scoped fill token (no Auth session); expired token → login → return to fill.

**Spec:** `docs/superpowers/specs/2026-08-12-yahpaz-generic-email-and-fill-link-design.md`

**Stack:** Supabase Edge (Deno), Resend HTTP, React + Vitest, Postgres.

## File map

| Path | Responsibility |
|---|---|
| `supabase/functions/_shared/email.ts` | Shell + Resend send helper |
| `supabase/functions/send-email/index.ts` | Generic send API (admin / service) |
| `supabase/migrations/20260812160000_event_fill_token.sql` | Token + emailed_at columns |
| `supabase/functions/responder-fill/index.ts` | Token load/save + notify_fill_ready |
| `src/lib/fillTokenIntent.ts` (+ test) | sessionStorage post-login fill + URL parse |
| `src/lib/responderFillToken.ts` | Client invoke for token load/save/notify |
| `src/lib/eventForm.ts` | After save, notify newly-km’d rows |
| `src/pages/ResponderFillPage.tsx` | Token mode (load/save via Edge) |
| `src/App.tsx` | Boot fill_token / fill_event; gate before login |
| `.cursor/memory/MEMORY.md` | Record email + fill-link facts |

---

### Task 1: Shared email module + `send-email`

- [ ] `_shared/email.ts`: `wrapEmailShell`, `htmlToText`, `sendTransactionalEmail`
- [ ] `send-email/index.ts`: auth admin or service-role; resolve active user email; wrap + send
- [ ] Commit

### Task 2: Migration

- [ ] Add `fill_token_hash`, `fill_token_expires_at`, `fill_ready_emailed_at` on `event_responders`
- [ ] Commit

### Task 3: Edge `responder-fill`

- [ ] `load_by_token` / `save_by_token` / `notify_fill_ready`
- [ ] Mint token, send fill-ready email via shared module, set `fill_ready_emailed_at`
- [ ] Commit

### Task 4: Client intent + token API + App boot

- [ ] `fillTokenIntent.ts` + tests
- [ ] `responderFillToken.ts`
- [ ] App: token-mode fill without session; expired → stash eventId → login; after OTP open fill
- [ ] `ResponderFillPage` token mode
- [ ] Commit

### Task 5: Wire notify from event save

- [ ] Detect newly set `total_km` in `saveEventForm`; call `notify_fill_ready` (soft-fail)
- [ ] Unit tests for detection helper
- [ ] Commit; update MEMORY; update PR
