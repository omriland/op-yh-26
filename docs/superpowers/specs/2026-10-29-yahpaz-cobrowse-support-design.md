# Yahpaz — Co-browse support takeover (Cobrowse.io)

Status: draft for Omri's review · 2026-10-29

## Why

A volunteer phones the support admin because they are stuck in Yahpaz. Today the
admin can only talk them through it, or use Super Admin impersonation, which
logs the admin in *as* the user in a separate session. Impersonation can't show
what the user is looking at right now, and the user isn't part of it.

We want the admin, while on the call, to send a request to that user's live
Yahpaz session; the user approves on their own screen; the admin then sees the
screen live and, after a second approval, can click and type for them. The user
stays in charge the whole time.

## Decisions already made (by Omri)

- **Vendor: Cobrowse.io**, web plan, **one named agent** (one support admin).
  Chosen over OpenReplay (self-hosted) because there is a single admin and no
  one to run a server.
- **Data passes through Cobrowse.io's cloud.** Accepted.
- **Flow:** admin initiates → user approves in their session → admin views →
  separate approval for remote control.
- **License key** is in hand; it goes in `VITE_COBROWSE_LICENSE_KEY`
  (`.env.local` and Netlify env), never committed.

## Goals

1. A logged-in user's session is findable in the Cobrowse.io agent dashboard by
   user id, full name and callsign.
2. When the admin presses Connect, the user sees a Yahpaz-styled, Hebrew, RTL
   approval dialog naming the admin. Nothing is shared until they approve.
3. Remote control needs its own Hebrew approval, after the view approval.
4. While a session is active, a persistent Hebrew banner shows on the user's
   screen with an "end support" button that ends it immediately.
5. Everything is redacted by default (Cobrowse "Private by Default"); the admin
   sees layout, labels and buttons, not entered values or personal data.
6. Every request, approval, denial and end is recorded in Yahpaz with the
   admin's name and time.

## Non-goals (v1)

- A "request support" button inside Yahpaz's admin screens. The admin starts
  sessions from the Cobrowse.io dashboard. *(Omri's call pending — see Open
  questions; default is dashboard-only.)*
- Session recording or replay.
- User-initiated sessions (6-digit codes, "share my screen" buttons).
- Native Android SDK or full-device sharing.
- More than one agent, agent roles, SSO into Cobrowse.

## Anti-goals (would count as failure even if it "works")

- Any view or control without an explicit approval on the user's screen in
  that session — including if someone switches the consent prompt off in the
  Cobrowse dashboard settings. Our own `confirmSession` must always ask.
- The admin seeing plates, phone numbers, names, odometers or free text by
  default.
- Cobrowse loading on logged-out pages (login, invite / set-password, OTP),
  for impersonated sessions, or before the phone OTP gate is passed.
- An active session the user can't see or can't end.
- English or LTR UI in front of the user.

## Constraints

- Stack is locked to what the repo uses: Vite + React 19 + TS, HeroUI, the
  in-repo UI kit (`src/components/ui/*`, e.g. `Dialog`, `AlertDialog`,
  `Button`), Supabase. Only new dependency: `cobrowse-sdk-js`.
- No CSP is set today (`netlify.toml`, `index.html`). If one is added later it
  needs `connect-src cobrowse.io *.cobrowse.io wss://*.cobrowse.io` and
  `js.cobrowse.io` for scripts.
- Cobrowse testing doesn't work on plain `localhost` per their docs; use a
  tunnel (ngrok or similar) or a Netlify deploy preview.
- Cobrowse.io has no Hebrew yet — all user-facing UI is ours, via the
  `confirmSession`, `confirmRemoteControl`, `showSessionControls` and
  `hideSessionControls` hooks.
- Copy follows the app's existing Hebrew voice (plural address, e.g.
  "חזרתם לחשבון שלכם").

## How it works

### SDK lifecycle (`src/lib/cobrowse.ts`, wired from `src/lib/auth.tsx`)

- Start the SDK only when: a license key is configured, the session is fully
  prepared (same condition as `usePresenceHeartbeat` in `App.tsx`: session,
  no password-setup gate, `loginOtp.state === 'ok'`), and there is **no**
  impersonation stash.
- Set `CobrowseIO.customData = { user_id, user_name, callsign }` before
  `start()`. No email, no phone.
- On sign-out, or when impersonation starts: end any active session and stop
  the SDK, so the next user on the same device can't be reached through the
  previous identity.
- Load the SDK lazily (dynamic import) so it doesn't weigh on first paint for
  roadside phones.

### Approval dialogs

- `confirmSession`: Yahpaz dialog, title like "בקשת תמיכה", body naming the
  agent (`CobrowseIO.currentSession.agent().name`): "<name> מהתמיכה מבקש/ת
  לצפות במסך שלכם. מה שתקלידו ופרטים אישיים יוסתרו." Buttons: אישור / דחייה.
  Decline or dismiss means reject.
- `confirmRemoteControl`: second dialog: "<name> מבקש/ת לשלוט במסך שלכם
  (ללחוץ ולהקליד בשבילכם). תוכלו לעצור בכל רגע." אישור / דחייה.
- Final copy is the builder's draft, reviewed by Omri before ship.

### Active-session banner

- Replace Cobrowse's default controls with a Yahpaz banner, in the same family
  as `ImpersonationBar` (`src/components/shell/ImpersonationBar.tsx`):
  "התמיכה צופה במסך שלכם" (plus "ושולטת בו" when remote control is on), and a
  "סיום תמיכה" button calling `CobrowseIO.currentSession.end()`.
- Visible on every screen and both themes, never covered by dialogs or sticky
  footers.

### Redaction

- Account set to Private by Default (dashboard setting), *and* enforced in code
  where the SDK allows, so a dashboard change alone can't expose data.
- Unredact only the app chrome needed to follow the user: navigation, page
  headings, button labels, field labels, status chips. The builder picks the
  mechanism (class or data attribute) and applies it to shell and shared UI
  components rather than page by page.

### Audit log

- New table `public.cobrowse_audit`: `id`, `user_id` (the user whose screen it
  is), `agent_name`, `cobrowse_session_id`, `action` in (`requested`,
  `approved`, `declined`, `control_approved`, `control_declined`, `ended`),
  `created_at`.
- Written from the user's browser at each hook. RLS: insert only where
  `user_id = auth.uid()`; no select/update/delete for authenticated users
  (same posture as `impersonation_audit`). Super admins read it via SQL or a
  later report.
- A failed audit insert must not block the session or the user's decision.

## Rollout

1. Web only. The Android app is native Kotlin (`yahpaz-android`), not a
   wrapper, so `cobrowse-sdk-js` never runs there; Android support would mean
   the native Cobrowse SDK, out of scope for v1. Check desktop and phone
   browsers on a deploy preview.
2. Build the real slice: lifecycle, dialogs, banner, redaction, audit.
3. Omri tests end to end with a test user on the deploy preview, then ships.

## Left to the builder

- File layout, component names, how the dialog promise is bridged to React.
- Exact unredaction mechanism and the list of elements it covers.
- Detecting the Android wrapper (reuse whatever `androidInstall` /
  `androidDownload` already rely on).
- Test coverage: unit tests for start/stop rules (logged out, impersonating,
  OTP pending, no key) and for audit-row mapping.

## Implemented default, pending Omri (redaction)

The builder check showed "redact everything" makes remote typing blind. The
build currently hides passwords, the OTP code and anything tagged
`data-cobrowse-redact` (`COBROWSE_REDACTED_VIEWS` in `src/lib/cobrowse.ts`);
the rest of the screen is visible, since the Super Admin already sees that
data through impersonation. No fields are tagged yet.

## Open questions

1. Is requesting from the Cobrowse.io dashboard acceptable for v1, or must the
   request button live inside Yahpaz's admin screen? (Default: dashboard.)
