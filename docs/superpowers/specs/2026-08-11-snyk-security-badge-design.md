# App footer (security vendors + legal)

Date: 2026-08-11 (layout uplift 2026-09-06)

## Goal

Document footer on logged-in non-immersive screens: brand, Snyk/Cloudflare marks, downloads, privacy.

## Decisions

- **Layout:** Brand row (wordmark + circular vendor icon buttons) → hairline → copyright / main links / legal — adapted from a marketing Footer pattern into רשומה tokens (no Tailwind/shadcn).
- **Copy:** Hebrew brand `אבן דרך` + unit line. English `Protected and monitored by Snyk and Cloudflare` remains an explicit product exception under copyright.
- **Links:** Snyk logo → `https://snyk.io`; Cloudflare logo → `https://www.cloudflare.com`; new tab, `rel="noopener noreferrer"`. Privacy / Android / iOS use the existing in-app callbacks.
- **Placement:** Document footer inside `AppShell` `main` (not sticky). Hidden when `immersiveSurface` (event/shift form, fill, detail).
- **Not shown:** Login / password-setup (outside `AppShell`).
- **Architecture:** `SnykBadge` rendered from `AppShell` via `showSecurityBadge={!immersiveSurface}`.
- **Assets:** Favicon `/favicon.svg` as brand mark. Inline SVG (Snyk dog mark), `fill="currentColor"`. Local Cloudflare mark at `public/cloudflare-mark.svg`. English security line sits in an LTR cluster next to the vendor icons.

## Out of scope

- Sticky always-visible strip
- Per-page duplication
- Hebrew translation of the Snyk/Cloudflare brand line
