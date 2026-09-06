# Android מפה Implementation Plan

> **For agentic workers:** Execute task-by-task. Spec: `docs/superpowers/specs/2026-09-06-yahpaz-android-ops-map-design.md`

**Goal:** Standalone מפה tab on Android matching web `UsersMapPage` / `OpsMapPanel` (no cockpit events).

**Architecture:** Domain helpers for pins/nearby/catalog/mile-posts; `:app` Maps Compose screen + YahpazAPI RPC/poll; assets bundled; Maps key from `local.properties`.

**Tech Stack:** Kotlin, Compose, Maps Compose, Places SDK, Supabase Postgrest, JUnit domain tests.

## Global Constraints

- Hebrew/RTL only; Field accent `#1D4E89`
- No iOS; no new schema; no cockpit event pins
- Live AVL via RLS (poll ~5s while tab visible)
- Key never committed

---

### Task 1: Domain OpsMap + tests
### Task 2: MobileNav includes map
### Task 3: Gradle/Manifest/assets + MAPS_API_KEY
### Task 4: YahpazAPI list_unit_map_pins + live pins
### Task 5: MapScreen + AppTab wiring
### Task 6: Verify domain tests + assembleDebug
