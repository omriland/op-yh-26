# יחפ״צ — מערכת מתנדבים ואירועים

Hebrew-only RTL web app for Yahpaz volunteer / event management.

## Stack

- Vite + React + TypeScript
- Supabase (Auth + Postgres + RLS)
- Netlify (static hosting)
- Resend (email — after custom domain)

## Local setup

```bash
npm install
cp .env.example .env.local
# fill VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
```

## Hosting

- Netlify site: https://yahpaz-2026.netlify.app
- Custom domain (configured on Netlify): **yahpz.com** (+ `www.yahpz.com`)
- Supabase project: `yahpaz-2026` (`rtvizpsfvtjowbimugns`, `eu-central-1`)

### Cloudflare DNS for `yahpz.com`

Keep nameservers on Cloudflare. In the zone DNS, add:

| Type | Name | Content | Proxy |
|---|---|---|---|
| A | `@` | `75.2.60.1` | DNS only (grey cloud) until SSL issues |
| CNAME | `www` | `yahpaz-2026.netlify.app` | DNS only |

After records propagate, Netlify provisions TLS for `https://yahpz.com`.

### Email (Resend)

**Temporary:** Invite emails send from verified Resend domain `send.responders-tlv.com`
(`יחפ״צ <onboarding@send.responders-tlv.com>`) until `yahpz.com` can be added (free plan = 1 domain).

**How invites send:** Edge Function `admin-users` uses Auth `generateLink({ type: 'invite' })`
then Resend’s HTTP API (secret `RESEND_API_KEY` on the Supabase project). This bypasses
Supabase’s built-in mailer rate limit. Invite links create a session immediately — the SPA
captures `type=invite` / `?set_password=1` and forces **בחירת סיסמה** before the app shell.
Password-reset uses the same set-password gate (`PASSWORD_RECOVERY` / `set_password`).


Optional Auth SMTP (Dashboard → Authentication → SMTP) for reset/confirm templates:

| Setting | Value |
|---|---|
| Host | `smtp.resend.com` |
| Port | `587` |
| User | `resend` |
| Pass | Resend API key **Yahpaz Auth SMTP** |
| Sender email | `onboarding@send.responders-tlv.com` |
| Sender name | `יחפ״צ` |

Auth URL config:

| Setting | Value |
|---|---|
| Site URL | `https://yahpz.com` |
| Redirect URLs | `https://yahpz.com/**`, `https://yahpaz-2026.netlify.app/**`, `http://localhost:5173/**` |

Edge secret already set for this project: `RESEND_API_KEY`, `INVITE_REDIRECT_TO` (local default
`http://localhost:5173/` — change to production when ready).

Privileged invite/deactivate: Supabase Edge Function `admin-users` (service role stays
server-side). Admin UI covers `משתמשים` + `רשימות` (districts / event types / roads /
vehicle kinds) via RLS.

## Design system — "רשומה"

`design-system-design-instructions/` is the binding source of truth for everything visual. Read `00-how-to-use.md` before writing UI code.

Implementation lives in three layers:

| File | Contains |
|---|---|
| `src/styles/tokens.css` | Raw palette + the semantic layer for both theme contexts (`data-theme="field"` / `"command"`), spacing, radii, motion |
| `src/styles/base.css` | Reset, document defaults, type-scale utilities, accessibility primitives, reduced motion |
| `src/styles/components.css` | Buttons, fields, stamps, ledger rows, cards, table, shell, states |

Rules that must hold: components consume **semantic tokens only** (never raw palette), CSS **logical properties only** (no `left`/`right`), every UI string in Hebrew, stamps for statuses only.

Three traps worth knowing before touching the visual layer:

- **A themed subtree must own its text color.** The Field token set is declared on `:root` and `[data-theme]` sets `color: var(--text-primary)`. Without both, any element that does not set `color` explicitly inherits it from `<body>` — which sits outside every theme, so the variable is undefined and the text falls back to pure black. That failure is invisible on paper and unreadable on navy.
- **IBM Plex Mono carries no Hebrew glyphs.** Registry values that can contain Hebrew (callsigns, patrol numbers, `142 ק״מ`) must not be set in it or they fall back mid-string. `monoClass()` in `src/lib/format.ts` decides this per value; `LedgerRow` applies it automatically.
- **Colors are machine-verified.** `npm run contrast` checks every pairing declared in `02-color.md`, plus four known traps that must keep failing (amber ink on white, Command tints above 8%, Field `--stroke-strong` below ~0.5). Run it after any color change and update `scripts/contrast-check.mjs` in the same change.

## Docs

- Spec: `docs/superpowers/specs/2026-08-09-yahpaz-volunteers-events-design.md`
- Infra plan: `docs/superpowers/plans/2026-08-09-yahpaz-infra-bootstrap.md`
