# Profile Telegram Link Button Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "link with Telegram" entry point to the profile's חיבורים card so a volunteer can start the connect flow from the website, reusing the existing `/oauth/authorize` consent screen and backend actions.

**Architecture:** Pure frontend change. `ProfilePage.tsx` fetches active bot apps via the already-existing `partner-auth` `list_apps` action; when exactly one is active, a button does a real browser navigation to `/oauth/authorize?client_id=…&state=…` (built with the already-existing, currently-unused `buildPartnerAuthorizeUrl`/`randomOAuthState` helpers in `partnerOAuth.ts`), landing on the already-existing `OAuthAuthorizePage` consent screen. No new Edge functions, no migrations.

**Tech Stack:** React 19 + TypeScript, Vite, Vitest, Supabase Edge Functions (unchanged), Hebrew/RTL UI.

**Spec:** `docs/superpowers/specs/2026-09-04-yahpaz-profile-telegram-link-design.md` (Part A only — Part B is a future plan, not built here).

---

## Chunk 1: Implementation

### Task 1: Re-enable the חיבורים card (dependency check)

PR #25 (branch `feat/profile-connections-enable`) already removes the card's `inert`/disabled state — check whether it has merged into `infra/bootstrap` before doing this task. If it has merged and this branch has picked up that change (e.g. via rebase/merge), **skip this task** — it's already done. Otherwise, do it here so the new button isn't unreachable.

**Files:**
- Modify: `src/pages/ProfilePage.tsx`
- Modify: `src/styles/components.css`
- Modify: `design-system-design-instructions/screens/profile.md`

- [ ] **Step 1: Check whether PR #25 already landed on this branch**

Run: `git log --oneline --all --grep="Grey out the profile connections" -- src/pages/ProfilePage.tsx` and separately check whether `src/pages/ProfilePage.tsx` currently contains `card--disabled`:

Run: `grep -n "card--disabled" src/pages/ProfilePage.tsx`

If this prints nothing, the card is already enabled — skip to Task 2.

- [ ] **Step 2: Remove the disable wrapper from the חיבורים section**

In `src/pages/ProfilePage.tsx`, find:

```tsx
        <section className="card card--disabled" aria-disabled="true" inert>
          <h2 className="t-section">חיבורים</h2>
```

Replace with:

```tsx
        <section className="card">
          <h2 className="t-section">חיבורים</h2>
```

- [ ] **Step 3: Remove `disabled` from the two existing buttons in that section**

Find:

```tsx
                {isAdmin && onOpenBotSettings ? (
                  <Button disabled onClick={onOpenBotSettings}>
                    רישום בוט
                  </Button>
                ) : null}
```

Replace with:

```tsx
                {isAdmin && onOpenBotSettings ? (
                  <Button onClick={onOpenBotSettings}>רישום בוט</Button>
                ) : null}
```

Find:

```tsx
                    <Button variant="destructive" disabled onClick={() => setRevokeId(grant.id)}>
                      בטל גישה
                    </Button>
```

Replace with:

```tsx
                    <Button variant="destructive" onClick={() => setRevokeId(grant.id)}>
                      בטל גישה
                    </Button>
```

- [ ] **Step 4: Remove the now-unused `.card--disabled` CSS**

In `src/styles/components.css`, delete this block (only consumer was the section touched above):

```css
.card--disabled {
  opacity: 0.4;
  pointer-events: none;
}

.card--disabled .btn:disabled {
  opacity: 1;
}
```

- [ ] **Step 5: Drop the stale "Temporarily UI-disabled" note**

In `design-system-design-instructions/screens/profile.md`, in the חיבורים bullet (item 2), remove the trailing sentence: `**Temporarily UI-disabled:** card uses `.card--disabled` (40% opacity, `inert`, `aria-disabled`) so the section stays visible but greyed and non-interactive. Buttons inside are disabled. No backend change.` (Leave the rest of that bullet as-is for now — Task 5 updates it further for the new button.)

- [ ] **Step 6: Typecheck and commit**

Run: `npx tsc -b`
Expected: no output, exit 0.

```bash
git add src/pages/ProfilePage.tsx src/styles/components.css design-system-design-instructions/screens/profile.md
git commit -m "Re-enable the profile connections section (dependency for Telegram link button)"
```

---

### Task 2: Add `fetchPartnerApps()` to the partner API client

**Files:**
- Modify: `src/lib/partnerApi.ts`

No test file exists for `partnerApi.ts` today and none of its existing wrappers (`fetchPartnerGrants`, `fetchPartnerClientInfo`, `approvePartnerAuthorize`, etc.) have direct unit tests — there's no precedent to introduce one here. This task is implementation-only, verified by the typecheck step and by Task 3's manual verification.

- [ ] **Step 1: Add the `PartnerApp` type and `fetchPartnerApps()` function**

In `src/lib/partnerApi.ts`, add after the existing `PartnerClientInfo` type (near the top, alongside the other exported types):

```ts
export type PartnerApp = {
  name: string
  client_id: string
  telegram_bot_username: string
  redirect_uri: string
}
```

Then add this function near `fetchPartnerGrants` (same section — both are volunteer-facing, session-only reads):

```ts
export async function fetchPartnerApps(): Promise<
  { ok: true; apps: PartnerApp[] } | { ok: false; error: string }
> {
  const result = await invokePartnerAuth<{ apps?: PartnerApp[] }>({
    action: 'list_apps',
  })
  if (!result.ok) return result
  return { ok: true, apps: result.data.apps ?? [] }
}
```

This mirrors the existing `fetchPartnerGrants` implementation exactly (same `invokePartnerAuth` helper, same result shape convention) and calls the already-existing `partner-auth` `list_apps` action (`supabase/functions/partner-auth/index.ts`, `handleListApps`) — no backend changes.

- [ ] **Step 2: Typecheck and commit**

Run: `npx tsc -b`
Expected: no output, exit 0.

```bash
git add src/lib/partnerApi.ts
git commit -m "Add fetchPartnerApps() to the partner API client"
```

---

### Task 3: Wire the "קישור לטלגרם" button into the profile empty state

**Files:**
- Modify: `src/pages/ProfilePage.tsx`

- [ ] **Step 1: Import the new pieces**

At the top of `src/pages/ProfilePage.tsx`, change:

```tsx
import { fetchPartnerGrants, revokePartnerGrant, type PartnerGrant } from '../lib/partnerApi'
```

to:

```tsx
import {
  fetchPartnerApps,
  fetchPartnerGrants,
  revokePartnerGrant,
  type PartnerApp,
  type PartnerGrant,
} from '../lib/partnerApi'
import { buildPartnerAuthorizeUrl, randomOAuthState } from '../lib/partnerOAuth'
```

- [ ] **Step 2: Add `apps` state**

Near the existing `const [grants, setGrants] = useState<PartnerGrant[] | null>(null)` line, add:

```tsx
  const [apps, setApps] = useState<PartnerApp[] | null>(null)
```

- [ ] **Step 3: Fetch apps alongside grants**

In the main `useEffect` (the one that already calls `fetchPartnerGrants()`), add this call next to it:

```tsx
    fetchPartnerGrants().then((result) => {
      if (!active) return
      if (result.ok) {
        setGrants(result.grants)
        setGrantError(null)
      } else {
        setGrants([])
        setGrantError(result.error)
      }
    })

    fetchPartnerApps().then((result) => {
      if (!active) return
      setApps(result.ok ? result.apps : [])
    })
```

(Errors are swallowed to `[]` here — the button just won't show, same as the zero-apps case. This mirrors how `fetchOwnAddresses`'s catch already degrades silently to `[]` a few lines above, so it's consistent with the file's existing error-handling style for secondary, non-critical data.)

- [ ] **Step 4: Add the button in the empty state**

Find the empty-state block (this is what it looks like *after* Task 1's Step 3 has already removed `disabled` from the "רישום בוט" button — Task 1 runs first):

```tsx
            ) : grants.length === 0 ? (
              <div className="stack-3">
                <p className="t-body">עדיין לא מחוברים.</p>
                <p className="t-caption text-muted">
                  פתחו את הבוט בטלגרם ושלחו קישור חיבור. אחרי האישור יופיע כאן החיבור לביטול.
                </p>
                {isAdmin && onOpenBotSettings ? (
                  <Button onClick={onOpenBotSettings}>רישום בוט</Button>
                ) : null}
              </div>
            ) : (
```

Replace with:

```tsx
            ) : grants.length === 0 ? (
              <div className="stack-3">
                <p className="t-body">עדיין לא מחוברים.</p>
                <p className="t-caption text-muted">
                  פתחו את הבוט בטלגרם ושלחו קישור חיבור, או קשרו ישירות מכאן. אחרי האישור יופיע כאן החיבור לביטול.
                </p>
                {apps && apps.length > 0 ? (
                  <Button
                    onClick={() => {
                      const url = buildPartnerAuthorizeUrl({
                        clientId: apps[0].client_id,
                        state: randomOAuthState(),
                      })
                      window.location.assign(url)
                    }}
                  >
                    קישור לטלגרם
                  </Button>
                ) : null}
                {isAdmin && onOpenBotSettings ? (
                  <Button onClick={onOpenBotSettings}>רישום בוט</Button>
                ) : null}
              </div>
            ) : (
```

`apps[0]` is deliberate — see the spec's "Known limitation" note (single-bot assumption; picks the oldest-registered active app when more than one exists).

- [ ] **Step 5: Typecheck**

Run: `npx tsc -b`
Expected: no output, exit 0.

- [ ] **Step 6: Run the full test suite**

Run: `npx vitest run`
Expected: same pass/fail counts as the pre-existing baseline (788 passed / 1 pre-existing unrelated failure in `formStickyFooterLayout.test.ts` / ~44 pre-existing `supabaseUrl is required` file failures — see the spec's Part A "Testing" section and the earlier PR #25 verification for why those are pre-existing and environment-related, not caused by this change). No *new* failures should appear.

- [ ] **Step 7: Manual verification (best-effort — no local Supabase credentials)**

There's no `.env.local` in this repo, so a full live click-through (open profile → see button → land on consent screen → approve → redirect to `t.me/...`) isn't possible in this environment. At minimum, visually sanity-check by reading the rendered JSX logic:
- With `apps === null` or `apps.length === 0`: no "קישור לטלגרם" button renders (only existing copy, and admin's "רישום בוט" if applicable).
- With `apps.length >= 1`: the button renders, and its `onClick` builds a URL of the form `/oauth/authorize?client_id=<apps[0].client_id>&state=<uuid-or-fallback>` (per `buildPartnerAuthorizeUrl`'s existing, tested implementation) and calls `window.location.assign` (a real navigation, not a client-side route change — required per the spec, since `src/lib/appRoute.ts`'s router doesn't handle `/oauth/authorize` internally).
- If/when Supabase credentials become available, do the real click-through and confirm it lands on `OAuthAuthorizePage`, shows the app name, and "אשר והמשך לטלגרם" redirects to `https://t.me/<bot>?start=yp_…`.

- [ ] **Step 8: Commit**

```bash
git add src/pages/ProfilePage.tsx
git commit -m "Add a 'link with Telegram' button to the profile connections section"
```

---

### Task 4: Update the partner API docs

There are **two** places with this stale claim: the markdown doc and the public HTML page served at `/partner-api` (confirmed as a reserved route in `src/lib/appRoute.ts`) — both need updating or the live page at yahpz.com/partner-api will keep telling integrators there's no connect button after this ships.

**Files:**
- Modify: `docs/partner-api.md`
- Modify: `public/partner-api/index.html`

- [ ] **Step 1: Drop the "no connect button" sentence in the markdown doc**

In `docs/partner-api.md`, section `## 1. Link a volunteer (MCP-style connection)`, find (note: curly quotes around "connect", not straight ASCII quotes):

```markdown
You never collect אבן דרך passwords. The volunteer logs in on yahpz.com and taps **אשר גישה**. There is **no** “connect” button on the profile — only your bot should send the link.
```

Replace with:

```markdown
You never collect אבן דרך passwords. The volunteer logs in on yahpz.com and taps **אשר גישה**. The volunteer's profile page also has its own "link with Telegram" entry point that starts the same flow — either path lands them on the same consent screen described below.
```

- [ ] **Step 2: Drop the same claim from the public HTML page**

In `public/partner-api/index.html`, find (line 119-122):

```html
        <p class="muted">
          Revoke later in Profile → <strong>Connections</strong> → <strong>Revoke access</strong>.
          There is no connect button on the profile — start from the bot.
        </p>
```

Replace with:

```html
        <p class="muted">
          Revoke later in Profile → <strong>Connections</strong> → <strong>Revoke access</strong>.
          The profile also has its own link button that starts the same flow.
        </p>
```

- [ ] **Step 3: Commit**

```bash
git add docs/partner-api.md public/partner-api/index.html
git commit -m "Update partner API docs: profile now has its own Telegram link entry point"
```

---

### Task 5: Update the profile design-instructions doc

**Files:**
- Modify: `design-system-design-instructions/screens/profile.md`

- [ ] **Step 1: Reconcile the חיבורים bullet (item 2) with the new button**

Find (after Task 1's Step 5 already removed the "Temporarily UI-disabled" sentence):

```markdown
2. **חיבורים** — `--type-section` heading, immediately after identity (not after vehicles). Caption `--type-caption` / `--text-muted`: `חיבור חד־פעמי לבוט בטלגרם. אחרי האישור אפשר לדווח אירועים בצ׳אט.` Loading: skeleton. Error: body muted. Empty: body `עדיין לא מחוברים.` + caption `פתחו את הבוט בטלגרם ושלחו קישור חיבור. אחרי האישור יופיע כאן החיבור לביטול.` Admin may also show primary `רישום בוט` (opens הגדרות on the `רישום בוט` pane). **No connect CTA** on the profile — connect is bot-link only. Connected: ledger `יישום` · `בתוקף עד` + destructive `בטל גישה`. Confirm dialog: `לבטל את הגישה?` body `הבוט לא יוכל יותר להשלים דיווחים בשמך עד לחיבור מחדש מטלגרם.`
```

Replace with:

```markdown
2. **חיבורים** — `--type-section` heading, immediately after identity (not after vehicles). Caption `--type-caption` / `--text-muted`: `חיבור חד־פעמי לבוט בטלגרם. אחרי האישור אפשר לדווח אירועים בצ׳אט.` Loading: skeleton. Error: body muted. Empty: body `עדיין לא מחוברים.` + caption `פתחו את הבוט בטלגרם ושלחו קישור חיבור, או קשרו ישירות מכאן. אחרי האישור יופיע כאן החיבור לביטול.` When exactly one active partner app is registered, primary `קישור לטלגרם` starts the same `/oauth/authorize` consent flow the bot-initiated link uses (navigates the browser, not an in-app route). No button when zero apps are registered; with more than one, links to the oldest-registered active app (known limitation — no picker yet). Admin may also show primary `רישום בוט` (opens הגדרות on the `רישום בוט` pane). Connected: ledger `יישום` · `בתוקף עד` + destructive `בטל גישה`. Confirm dialog: `לבטל את הגישה?` body `הבוט לא יוכל יותר להשלים דיווחים בשמך עד לחיבור מחדש מטלגרם.`
```

- [ ] **Step 2: Commit**

```bash
git add design-system-design-instructions/screens/profile.md
git commit -m "Update profile design instructions for the Telegram link button"
```

---

## Definition of Done

- [ ] All 5 tasks committed
- [ ] `npx tsc -b` clean
- [ ] `npx vitest run` shows no new failures vs. baseline
- [ ] `docs/partner-api.md`, `public/partner-api/index.html`, and `design-system-design-instructions/screens/profile.md` no longer say "no connect button on the profile"
- [ ] Ready for `superpowers:requesting-code-review` before opening a PR
