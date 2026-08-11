# Super Admin impersonation — Implementation Plan

> **For agentic workers:** Inline execution (user requested implement).

**Goal:** Super Admin can view the app as another active non–super-admin user via real session swap, with stash/restore and audit.

**Architecture:** Edge `impersonate` / `stop_impersonation` on `admin-users`; client `sessionStorage` stash; banner + avatar/users entry points.

**Tech Stack:** Supabase Auth Admin API, Edge Functions, React shell.

**Spec:** `docs/superpowers/specs/2026-08-11-yahpaz-super-admin-impersonation-design.md`

## Tasks

1. Migration `impersonation_audit` + RLS deny-all for clients
2. `canImpersonateTarget` helper + tests
3. Edge actions + deploy
4. Client: stash, API, auth signOut clears stash, banner
5. AppShell menu + AdminUsersPage overflow + design-system note + MEMORY
