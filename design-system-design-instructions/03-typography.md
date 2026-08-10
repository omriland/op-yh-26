# 03 — Typography

## Families (all via Google Fonts, all with full Hebrew support)

| Role | Family | Weights | Where |
|---|---|---|---|
| **Brand mark** | Suez One | 400 | `אבן דרך` only — app-bar brand + login wordmark. Never for UI chrome or body. |
| **Display / titles** | IBM Plex Sans Hebrew | 700 | Screen titles, event-form section counters. Hierarchy via weight/size. |
| **UI / body** | IBM Plex Sans Hebrew | 400, 500, 600, 700 | Everything interactive and readable: body, labels, buttons, inputs, nav, chips, unit line in app bar |
| **Numeric / registry** | IBM Plex Mono | 400, 500 | Plate numbers, odometer values, kilometers, event IDs, timestamps in tables |

### Loading (do this exactly — silent font failures are a known defect mode)

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans+Hebrew:wght@400;500;600;700&family=Suez+One&display=swap" rel="stylesheet">
```

### Font-family stacks (never use a bare family name — always the full stack)

```css
:root {
  --font-display: "IBM Plex Sans Hebrew", "Heebo", "Segoe UI", "Arial Hebrew", "Noto Sans Hebrew", sans-serif;
  --font-ui: "IBM Plex Sans Hebrew", "Heebo", "Segoe UI", "Arial Hebrew", "Noto Sans Hebrew", sans-serif;
  --font-brand: "Suez One", "Frank Ruhl Libre", "Times New Roman", "Noto Serif Hebrew", serif;
  --font-mono: "IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace;
}
```

**Verification is mandatory before declaring a screen done:** in the browser console run
`document.fonts.check('16px "IBM Plex Sans Hebrew"')`, `document.fonts.check('16px "IBM Plex Mono"')`, and `document.fonts.check('16px "Suez One"')` — all must return `true` with Hebrew content rendered on screen. If the app must work without network access to Google Fonts (CSP, offline), self-host the same families/weights instead of the `<link>`.

**IBM Plex Mono contains no Hebrew glyphs.** It is used ONLY for digits, Latin, and punctuation (plates, odometers, IDs, timestamps). Never set Hebrew text in `--font-mono` — it would fall back mid-word and look broken.

**Suez One is brand-only.** Do not use it for buttons, forms, tables, or body copy.

## Type scale

Sizes in px, `size/line-height`. Mobile ≤640 px; desktop ≥1025 px (tablet inherits mobile values).

| Token | Family / weight | Mobile | Desktop | Use |
|---|---|---|---|---|
| `--type-display` | Plex Sans Hebrew 700 | 26/32 | 32/38 | Reserved display scale (legacy) |
| Login wordmark | Plex Sans Hebrew 700 | 40/44 | 64/68 (tablet 48/52) | `אבן דרך` on the login hero ONLY — see `screens/login.md` |
| `--type-title` | Plex Sans Hebrew 700 | 22/28 | 26/32 | Screen title (one per screen) |
| `--type-section` | Plex Sans Hebrew 600 | 17/24 | 18/26 | Card titles, form section headings |
| `--type-body` | Plex Sans Hebrew 400 | 16/24 | 16/24 | Body, input values, ledger values |
| `--type-body-strong` | Plex Sans Hebrew 600 | 16/24 | 16/24 | Emphasized values, button labels |
| `--type-label` | Plex Sans Hebrew 500 | 13/18 | 13/18 | Form labels, ledger labels, table headers. `letter-spacing: 0.01em` |
| `--type-caption` | Plex Sans Hebrew 400 | 12/16 | 12/16 | Timestamps, helper text, counters |
| `--type-stamp` | Plex Sans Hebrew 700 | 12/16 | 12/16 | Stamp chips only. `letter-spacing: 0.06em` |
| `--type-numeric` | Plex Mono 400 | 16/24 | 16/24 | Inline operational numbers |
| `--type-numeric-lg` | Plex Mono 500 | 20/26 | 22/28 | Prominent numbers (total ק״מ on a summary) |

Body text is never smaller than 16 px in form inputs (prevents iOS auto-zoom).

## Numeric rules

- All operational numbers — לוחית רישוי, ק"מ התחלה, ק"מ סיום, קילומטרים, מספר אירוע — render in `--type-numeric` (Plex Mono). This is registry data; it must look like registry data.
- Digits are Western Arabic numerals (0–9), never Hebrew letters-as-numerals.
- License plates format with hyphens and are direction-isolated: `<span dir="ltr">12-345-67</span>` (see `05-rtl-language.md`).
- In tables of numbers, align numeric columns to the inline-end and let the mono face do the vertical alignment.

## Hierarchy discipline

- One `--type-title` per screen.
- Hierarchy below the title is built from **weight and spacing**, not from ever-larger sizes: `--type-section` → `--type-label` → `--type-body`.
- Line length for reading content: max 65ch. Forms cap at the form width defined in `04-layout.md`.
- No text in pure black or pure white: always `--text-primary` of the current theme.
- No letter-spacing on body Hebrew text (Hebrew tolerates tracking poorly); only the two specified exceptions (`--type-label`, `--type-stamp`).
- Never fake-bold Hebrew via browser synthesis — load and use the real weights listed above.
