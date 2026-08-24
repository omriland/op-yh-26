# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary — confirmed by the user, jointly, not ranked:**

- **Responder in the field (כונן).** A volunteer standing on the shoulder of a highway, often at night, holding a phone one-handed. Their job: record their own participation in a recovery event — plate, start/end odometer, route, treatment detail, notes. They frequently start in the field and finish later online.
- **Shift-lead on duty (אחמ״ש).** Runs the live shift from a phone or a desktop: creates events (often partial), assigns multiple responders, fills lead-owned event fields, works the cockpit, and closes records.

A single person may hold both roles and may act as an assigned responder on an event they lead.

**Secondary, present in the product but not the design center:** unit admin / HQ (user and list management, reports, fuel refunds, km exceptions, duplicate-event audits, event freeze) — largely desktop. District or national oversight was not confirmed as an audience.

## Product Purpose

Yahpaz (יחפ״צ) is the on-duty management platform of a police road-recovery volunteer unit (חילוץ בכבישים). It replaces ad-hoc logging with a structured record of every recovery event: who commanded, who responded, which vehicles were treated, kilometers driven, and how the event was closed.

Success is a complete, trustworthy record produced under field conditions — created live, finished later, and readable months afterward by someone who was not there.

## Positioning

The product is built around the record itself rather than around a dashboard. Its distinguishing mechanism is a **two-sided completion model**: an event has lead-owned fields and per-responder participation sections, each with its own status, and the event only reaches `done` when every assigned responder's section is done. Status is *viewer-relative* — the same event reads "ממתין לתיעוד שלך" to one responder and "הושלם חלקית" to the lead. A generic incident tracker or spreadsheet cannot express that without becoming a different product.

## Operating Context

- Events are created **in the field, partially**, and completed later while online. There is no offline sync.
- Two operating scenes with genuinely different constraints: the roadside phone (night, one hand, weak signal, urgency) and the desk (shift review, reporting, administration).
- Downstream operational workflows built on the record: shifts, cockpit / live shift running, live tracking, km exception review, fuel quarter and fuel refund reporting, duplicate-event detection, open-documentation chasing, contacts, unit broadcast.
- Field volunteers can use an Android client distributed as a side-loaded APK (kept off the Play Store deliberately); it is a wrapper around this web app, not a separate native product. Force-update of Android clients is an existing operational practice.
- Authentication is email + password with invite links, plus a phone OTP gate; admins can view-as another user.

## Capabilities and Constraints

**Hard constraints:**

- **Hebrew-only, full RTL.** No English ever appears in the product surface. CSS logical properties only; the words `left` and `right` are forbidden in layout CSS. (Code identifiers and DB columns stay English.)
- **Field-usable on a phone at 03:00.** Mobile-first is a requirement, not a preference: one-handed reach, poor light, gloves, weak signal. Tap targets ≥ 44×44 px.
- Stack is fixed: Vite + React + TypeScript SPA, Supabase (Auth + Postgres + RLS), Netlify static hosting, Resend for mail. Permissions are enforced by RLS; the client talks to Supabase directly. Privileged writes go through the `admin-users` Edge Function.
- The visual system in `design-system-design-instructions/` is binding (see Brand Commitments).

**Roles:** `admin` (users, roles, vehicles, closed lists; views all events), `shift_lead` (create/edit events, assign responders, lead-owned fields), `responder` (own participation fields on assigned events). Combos allowed.

**Domain terminology (Hebrew is the canonical form):** אחמ״ש (shift-lead), כונן (responder), שלוחה (district), או״ק (callsign), ניידת (patrol), אירוע (event), כביש (road), ק״מ.

**Status model:** participation is `pending` / `in_progress` / `done`; event is `draft` / `in_progress` / `partial` / `done`, where `done` is computed from all responders being done. UI labels are viewer-relative.

**Records and freeze:** events can be frozen (see `src/lib/eventFreeze.ts` and the `event_freeze` migrations). The user did **not** declare legal or regulatory auditability a binding product constraint, so future work should treat freeze as an existing capability with real semantics, not as a compliance obligation — and must still never make a frozen record look editable.

**Explicit non-goals (v1):** offline/PWA sync, native iOS/Android apps, English UI, push notifications, Netlify Functions for privileged writes.

## Brand Commitments

The design system **"רשומה" (The Official Record)** in `design-system-design-instructions/` is the single binding source of visual truth; `00-how-to-use.md` is its contract and must be read before writing UI code.

Committed identity facts:

- The interface is a beautifully typeset official record, not a dashboard — the logic of Israeli official paperwork (structure, ink-on-paper clarity, the ceremony of completion) executed with modern digital precision, never skeuomorphic pastiche.
- Personality: calm, authoritative, precise, institutional but crafted. The tone a duty officer would respect at 03:00.
- Two theme contexts, one language: **שטח (Field)** cool paper-white, and **מפקדה (Command)** archival navy (chrome and login hero only; page content does not invert).
- The signature element is the **stamp** — statuses as bordered rubber-stamp chips; the only rotation in the system is the −8° stamp on event-detail headers.
- Typography: IBM Plex Sans Hebrew (UI and display), IBM Plex Mono (numerals only — it carries no Hebrew glyphs), Frank Ruhl Libre.
- Named anti-references, binding: not cream-editorial, not dark-mode-with-acid-accent, not achromatic broadsheet, not a generic admin panel. No gradients, glassmorphism, neumorphism, glows, emoji, or animated backgrounds.
- Components consume semantic tokens only; raw palette values never appear in component code.
- Hebrew microcopy in an official-but-human register: no exclamation marks, no cute tone, no English words.

Product name and wordmark: **יחפ״צ** / "אבן דרך - יחפ״צ" (the sender identity on outbound mail). Domain `yahpz.com`.

## Evidence on Hand

- `design-system-design-instructions/` — full binding design system plus per-screen blueprints in `screens/`.
- `docs/superpowers/specs/2026-08-09-yahpaz-volunteers-events-design.md` — approved v1 design spec (roles, fields, status model, screens). Note: the product has grown substantially past it (shifts, cockpit, reports, live tracking, event freeze).
- `scripts/contrast-check.mjs` — machine-verified color pairings, including four traps that must keep failing. Run after any color change.
- `src/styles/tokens.css`, `base.css`, `components.css` — the implemented token and component layers.
- Real operational Supabase project and live deployment.

**Absences future work must not fabricate:** no testimonials, case studies, press, benchmarks, pricing, or customer logos exist — this is an internal unit tool, not a marketed product. No formal accessibility conformance claim exists.

## Product Principles

1. **The record is the product.** Every screen exists to produce, complete, or read a trustworthy official record. Design serves legibility of the record, not dashboard expressiveness.
2. **Design for 03:00 on the shoulder of the road.** The roadside phone is the governing case; the desk is the easier one. Where the two conflict, the field wins.
3. **Completion is a shared, visible state.** Who still owes what must be unambiguous from a glance, and it is answered relative to whoever is looking.
4. **Structure comes from typography and rules, not boxes.** Hairlines, ledger rows, and dotted leaders carry hierarchy; the stamp is the single loud element.
5. **Hebrew is the product, not a localization.** Copy, direction, numerals, and font behavior are designed in Hebrew from the start.

## Accessibility & Inclusion

No external accessibility standard was declared as a requirement — no formal IS 5568 or WCAG conformance obligation is recorded, and no conformance may be claimed.

What is nevertheless binding as engineering practice, from `08-accessibility.md`: text contrast ≥ 4.5:1 (≥ 3:1 for large text), every declared pairing machine-verified by `scripts/contrast-check.mjs`, tap targets ≥ 44×44 px on mobile, visible focus states, and `prefers-reduced-motion` respected.

Real user-condition needs that outrank any checklist: legibility in darkness and in direct sun, one-handed operation, and gloved or cold fingers.
