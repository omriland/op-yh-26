# Snyk security badge (footer)

Date: 2026-08-11

## Goal

Show a subtle “Protected by Snyk” mark (English brand line + logo) on logged-in non-immersive screens, linking to Snyk.

## Decisions

- **Copy:** English `Protected by Snyk` (explicit product exception to Hebrew-only UI for this brand mark).
- **Link:** `https://snyk.io`, new tab, `rel="noopener noreferrer"`.
- **Placement:** Document footer inside `AppShell` `main` (not sticky). Hidden when `immersiveSurface` (event/shift form, fill, detail).
- **Not shown:** Login / password-setup (outside `AppShell`).
- **Architecture:** Single `SnykBadge` rendered from `AppShell` via `showSecurityBadge={!immersiveSurface}`.
- **Asset:** Inline SVG (Snyk dog mark) in `SnykBadge`, `fill="currentColor"` for Field/Command themes.

## Out of scope

- Sticky always-visible strip
- Per-page duplication
- Hebrew translation of the brand line
