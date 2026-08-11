# Super Admin + set password — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) or subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add DB-only `super_admin` role and Super-Admin-only “set password” (optional force-change checkbox) in the admin users panel.

**Architecture:** Extend `app_role` + `profiles.must_change_password`; protect `super_admin` with a trigger; clear flag via SECURITY DEFINER RPC; Edge Function `set_password` on `admin-users`; reuse LoginPage set-password gate with reason `admin_reset`.

**Tech Stack:** Supabase (Postgres enum/RLS/RPC, Auth Admin API, Edge Functions), Vite React TS, existing admin-users UI.

## Global Constraints

- Hebrew-only UI, full RTL
- Visual SoT: `design-system-design-instructions/`
- No secrets in repo
- `super_admin` never assignable from app UI
- Seed: `omriland@gmail.com` gets `super_admin`
- Spec: `docs/superpowers/specs/2026-08-11-yahpaz-super-admin-set-password-design.md`

## File map

| File | Responsibility |
|---|---|
| `supabase/migrations/20260811130000_super_admin_set_password.sql` | Enum, column, triggers, RPC, seed |
| `supabase/functions/admin-users/index.ts` | `set_password` action |
| `src/lib/auth.tsx` | AppRole, profile flag, arm gate, clear RPC after updatePassword |
| `src/lib/passwordSetup.ts` | `admin_reset` reason |
| `src/lib/adminUsers.ts` | `setAdminUserPassword`, sync skips `super_admin` |
| `src/lib/adminUsers.test.ts` (or sync helper test) | Role sync skip |
| `src/pages/AdminUsersPage.tsx` | Menu + dialog |
| `src/pages/LoginPage.tsx` | Copy for `admin_reset` |
| `src/pages/ProfilePage.tsx` | Filter `super_admin` from displayed roles |
| `.cursor/memory/MEMORY.md` | Record role + capability |

### Task 1: Database migration

- [ ] Create migration file + apply via Supabase MCP
- [ ] Verify seed + RPC with SQL

### Task 2: Client auth + password setup

- [ ] Extend types; arm `admin_reset` from `must_change_password`
- [ ] Call `clear_must_change_password` after successful updatePassword
- [ ] Unit tests for passwordSetup / role filter as needed

### Task 3: Edge + adminUsers API

- [ ] `set_password` handler (super_admin gate, strength, updateUser, flag)
- [ ] `setAdminUserPassword` client
- [ ] `syncUserRoles` skips `super_admin`
- [ ] Deploy edge function

### Task 4: Admin UI + Login copy

- [ ] Overflow menu + dialog (modes, checkbox, confirm)
- [ ] LoginPage copy for `admin_reset`
- [ ] Hide `super_admin` from role chips/labels

### Task 5: Verify platform + MEMORY

- [ ] Confirm Auth redirect URLs
- [ ] Run unit tests + typecheck/build
- [ ] Update MEMORY.md
