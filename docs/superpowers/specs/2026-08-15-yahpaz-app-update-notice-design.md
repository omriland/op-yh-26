# App update notice

Date: 2026-08-15

## Goal

When a logged-in tab is still running an older deploy, show a persistent, dismissible notice so the volunteer can refresh when ready — including mid-form.

## Decisions

- **Who:** Auth session only. Login and fill-by-link without a session do not check.
- **Detection:** Each build writes `/version.json` `{ "id": "<COMMIT_REF | BUILD_ID | dev>" }` and bakes the same id into the client as `VITE_APP_VERSION`. Poll every 5 minutes and on `visibilitychange` → `visible`. `cache: 'no-store'` + cache-bust query. Netlify `Cache-Control: no-store` on `/version.json`.
- **Show when:** remote id is a non-empty string, differs from this tab’s id, and is not the id dismissed in this tab.
- **Dismiss:** X writes the **remote** id to `sessionStorage` (`yahpaz:dismissed_app_version`). Hidden for that version in this tab. A later deploy (new id) prompts again.
- **Refresh:** button `רענון` → `location.reload()`.
- **Copy:** `יצאה גרסה חדשה. רעננו כדי לעדכן.`
- **UI:** Toast-family chrome (Command navy, info bar, icon), **non-modal**, pinned **top** on all breakpoints so it does not cover sticky form footers. No auto-dismiss. Does not steal focus.
- **Failures:** Offline / 404 / bad JSON — silent, retry next poll.
- **Local preview:** Vite dev only — `?update_notice=1` pretends remote id is `dev-preview` so the notice appears. Ignored in production builds. X dismisses that preview id for the tab.

## Out of scope

- Service worker / PWA
- Forcing refresh
- Prompting logged-out or token-only fill
- Re-prompting the same version after X in this tab
