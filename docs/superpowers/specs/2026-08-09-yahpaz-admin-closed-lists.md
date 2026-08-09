# Yahpaz — Admin closed lists (slice B)

**Date:** 2026-08-09  
**Status:** Implemented  
**Screen SoT:** `design-system-design-instructions/screens/admin.md` → הגדרות

## Scope

- Admin nav: desktop `משתמשים` + `הגדרות`; mobile `ניהול` tab with segmented control
- Four lookups: `districts`, `event_types`, `roads`, `vehicle_kinds`
- Inline add/edit; remove blocked when referenced by events / treated vehicles
- Overflow menus portaled to `document.body` so table `overflow: hidden` cannot clip them

## Data

Client + existing admin RLS write policies. No Edge Function for list CRUD.
