# Snyk security badge (footer)

Date: 2026-08-11

## Goal

Show a subtle “Protected and monitored by Snyk and Cloudflare” mark (English brand line + both logos) on logged-in non-immersive screens.

## Decisions

- **Copy:** English `Protected and monitored by Snyk and Cloudflare` (explicit product exception to Hebrew-only UI for this brand mark).
- **Links:** Snyk logo → `https://snyk.io`; Cloudflare logo → `https://www.cloudflare.com`; new tab, `rel="noopener noreferrer"`.
- **Placement:** Document footer inside `AppShell` `main` (not sticky). Hidden when `immersiveSurface` (event/shift form, fill, detail).
- **Not shown:** Login / password-setup (outside `AppShell`).
- **Architecture:** Single `SnykBadge` rendered from `AppShell` via `showSecurityBadge={!immersiveSurface}`.
- **Assets:** Inline SVG (Snyk dog mark) in `SnykBadge`, `fill="currentColor"` for Field/Command themes. Local Cloudflare cloud mark at `public/cloudflare-mark.svg` (official orange).

## Out of scope

- Sticky always-visible strip
- Per-page duplication
- Hebrew translation of the brand line
