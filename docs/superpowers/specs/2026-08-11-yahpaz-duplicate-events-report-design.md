# Yahpaz (יחפ״צ) — Duplicate events exceptions (אירועים כפולים) — Design

**Date:** 2026-08-11  
**Repo:** `yhpz-2026`  
**Status:** Approved in brainstorming  
**Depends on:** Exceptions hub (`ExceptionsPage` + חריגי ק״מ)  
**Source:** Moshe WhatsApp backlog item #4

## Problem

Shift leads need to spot accidental double/triple event entries for the same volunteer at the same place and time. The **אירועים כפולים** segment already exists under חריגים as `בקרוב`.

## Goals (v1)

- Replace `בקרוב` with a live report on the existing exceptions segment
- Visible to `shift_lead` and `admin`
- Detect clusters of 2+ participations that match (see rules)
- Tap opens event detail
- Client-side detection; no schema change
- Hebrew-only RTL UI (רשומה)

## Non-goals (v1)

- Fuzzy location / geocoding
- Matching on police event id alone
- Configurable time window (hardcode ±30 minutes)
- Date-range filter / CSV
- Shifts
- Responder-only access

## Match rules

Two participations match when **all** are true:

| Rule | Detail |
|---|---|
| Same volunteer | Same `responder_id` |
| Same day | Same `events.event_date` |
| Same location | `trim(location)` equal and **non-empty** (blank does not match blank) |
| Time window | Both `started_at` non-null; absolute difference ≤ **30 minutes** |

Matching is transitive (A~B and B~C → one cluster of three). Distinct `event_id`s only (same event twice is impossible via PK).

Cancelled events are included. No filter on event/participation status.

## UI

| Element | Hebrew |
|---|---|
| Segment (existing) | אירועים כפולים |
| Empty | אין אירועים כפולים להצגה |
| Load error | Same as חריגי ק״מ |
| Cluster size 2 | כפול |
| Cluster size ≥3 | משולש |

Show clusters sorted by latest `event_date` desc. Each cluster lists member rows (כונן, תאריך, שעה, מיקום, סוג) — tap → detail.

## Architecture

- `src/lib/duplicateEventsReport.ts` — flatten, union-find clusters, fetch
- `src/lib/duplicateEventsReport.test.ts`
- `src/pages/DuplicateEventsPage.tsx`
- Wire in `ExceptionsPage` instead of EmptyState

Constant: `DUPLICATE_TIME_WINDOW_MINUTES = 30`
